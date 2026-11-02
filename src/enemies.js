// Enemy definitions, spawning, fixed-order AI and BFS pathing.
// Wolves alternate bite/move on ticks and telegraph bites one tick ahead.

import { isWalkable } from './world.js';
import { rollHit, rollDamage, isCardinalAdjacent } from './combat.js';

export const ENEMY_DEFS = {
  ice_wolf: {
    id: 'ice_wolf',
    name: 'Ice Wolf',
    kind: 'ice_wolf',
    hp: 12,
    attackSpeedTicks: 3,
    range: 1,
    maxHit: 4,
    accuracy: 12,
    defence: 15,
    style: 'melee',
    scale: 1.12,
  },
};

const CARDINAL_STEPS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const DIAGONAL_STEPS = [
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
];
const ALL_STEPS = [...CARDINAL_STEPS, ...DIAGONAL_STEPS];

function key(x, z) {
  return `${x},${z}`;
}

export class Enemies {
  constructor(rng) {
    this.rng = rng;
    this.list = [];
    this.nextUid = 1;
    this.reserved = new Set();
  }

  clear() {
    this.list = [];
    this.nextUid = 1;
    this.reserved.clear();
  }

  spawn(kind, x, z, tick) {
    const def = ENEMY_DEFS[kind];
    if (!def) throw new Error(`Unknown enemy kind: ${kind}`);
    const enemy = {
      id: `${kind}-${this.nextUid}`,
      uid: this.nextUid,
      kind,
      name: def.name,
      x,
      z,
      prevX: x,
      prevZ: z,
      hp: def.hp,
      maxHp: def.hp,
      alive: true,
      nextAttackTick: tick + 1,
      telegraph: false,
      deathTick: null,
      facing: { x: 0, z: 1 },
      damageTick: -9999,
      accuracy: def.accuracy,
      defence: def.defence,
      maxHit: def.maxHit,
      attackSpeedTicks: def.attackSpeedTicks,
      range: def.range,
      style: def.style,
    };
    this.nextUid += 1;
    this.list.push(enemy);
    return enemy;
  }

  get(id) {
    for (const e of this.list) {
      if (e.id === id) return e;
    }
    return null;
  }

  living() {
    return this.list.filter((e) => e.alive);
  }

  livingCount() {
    let n = 0;
    for (const e of this.list) if (e.alive) n += 1;
    return n;
  }

  isOccupied(x, z) {
    for (const e of this.list) {
      if (e.alive && e.x === x && e.z === z) return true;
    }
    return false;
  }

  // Called once at the top of every game tick, before any AI.
  // Stores interpolation origins and removes corpses that finished fading.
  beginTick(tick) {
    const next = [];
    for (const e of this.list) {
      if (!e.alive && e.deathTick != null && tick - e.deathTick >= 1) continue;
      e.prevX = e.x;
      e.prevZ = e.z;
      next.push(e);
    }
    this.list = next;
  }

  // Fixed order = list order. Bites resolve immediately; movement reservations
  // stop later wolves from entering the same destination this tick.
  tick(tick, player, ctx) {
    this.reserved.clear();

    for (const wolf of this.list) {
      if (!wolf.alive) continue;
      if (!ctx.isPlayerAlive()) break;

      const dx = player.x - wolf.x;
      const dz = player.z - wolf.z;
      const adjacent = isCardinalAdjacent(wolf.x, wolf.z, player.x, player.z);

      if (adjacent && wolf.nextAttackTick <= tick) {
        const hit = rollHit(this.rng, wolf.accuracy, player.defence);
        const dmg = hit ? rollDamage(this.rng, wolf.maxHit) : 0;
        wolf.nextAttackTick = tick + wolf.attackSpeedTicks;
        wolf.telegraph = false;
        wolf.facing = { x: Math.sign(dx), z: Math.sign(dz) };
        ctx.onBite(wolf, hit, dmg);
        continue;
      }

      if (!adjacent) {
        const next = this._findStep(wolf, player);
        if (next) {
          wolf.facing = { x: Math.sign(next.x - wolf.x), z: Math.sign(next.z - wolf.z) };
          wolf.x = next.x;
          wolf.z = next.z;
          this.reserved.add(key(next.x, next.z));
        }
      } else {
        wolf.facing = { x: Math.sign(dx), z: Math.sign(dz) };
      }

      const nowAdjacent = isCardinalAdjacent(wolf.x, wolf.z, player.x, player.z);
      wolf.telegraph = nowAdjacent && wolf.nextAttackTick <= tick + 1;
    }
  }

  // 8-way BFS to the closest free tile cardinally adjacent to the player.
  // Diagonals require both orthogonal corner tiles to be enterable (same rule
  // as the player's step()). Returns the first tile of the path, or null.
  _findStep(wolf, player) {
    if (isCardinalAdjacent(wolf.x, wolf.z, player.x, player.z)) return null;

    const blocked = new Set(this.reserved);
    blocked.add(key(player.x, player.z));
    for (const e of this.list) {
      if (e !== wolf && e.alive) blocked.add(key(e.x, e.z));
    }

    const startX = wolf.x;
    const startZ = wolf.z;
    const seen = new Set([key(startX, startZ)]);
    const queue = [{ x: startX, z: startZ, first: null }];
    let head = 0;

    while (head < queue.length) {
      const cur = queue[head];
      head += 1;

      for (const step of ALL_STEPS) {
        const nx = cur.x + step[0];
        const nz = cur.z + step[1];
        const k = key(nx, nz);
        if (seen.has(k)) continue;
        if (!isWalkable(nx, nz) || blocked.has(k)) continue;

        if (step[0] !== 0 && step[1] !== 0) {
          const sx = cur.x + step[0];
          const sz = cur.z + step[1];
          if (!isWalkable(sx, cur.z) || blocked.has(key(sx, cur.z))) continue;
          if (!isWalkable(cur.x, sz) || blocked.has(key(cur.x, sz))) continue;
        }

        seen.add(k);
        const first = cur.first || { x: nx, z: nz };
        if (isCardinalAdjacent(nx, nz, player.x, player.z)) return first;
        queue.push({ x: nx, z: nz, first });
      }
    }

    return null;
  }
}
