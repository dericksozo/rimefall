=== FILE: src/enemies.js ===
// Enemy definitions, spawning and deterministic OSRS-style NPC AI.
// Wolves use naive one-step pathing (no BFS), act in spawn order, and must
// telegraph for one full tick before a bite can land.

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
    maxHit: 5,
    accuracy: 18,
    defence: 15,
    style: 'melee',
    scale: 1.12,
  },
};

export class Enemies {
  constructor(rng) {
    this.rng = rng;
    this.list = [];
    this.nextUid = 1;
  }

  clear() {
    this.list = [];
    this.nextUid = 1;
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
      waitUntilTick: 0,
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

  // Stores interpolation origins at the top of every tick and removes corpses
  // after their one-tick death fade.
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

  tick(tick, player, ctx) {
    // List order is spawn order. No BFS, no reservations: later wolves see the
    // current positions of wolves that already moved this tick.
    for (const wolf of this.list) {
      if (!wolf.alive) continue;
      if (!ctx.isPlayerAlive()) break;

      const dx = player.x - wolf.x;
      const dz = player.z - wolf.z;
      const adjacent = isCardinalAdjacent(wolf.x, wolf.z, player.x, player.z);

      // a) A committed telegraph resolves now. Out-of-range = visible whiff.
      if (wolf.telegraph) {
        let hit = false;
        let dmg = 0;
        const inRange = isCardinalAdjacent(wolf.x, wolf.z, player.x, player.z);

        if (inRange) {
          hit = rollHit(this.rng, wolf.accuracy, player.defence);
          dmg = hit ? rollDamage(this.rng, wolf.maxHit) : 0;
        }

        wolf.nextAttackTick = tick + wolf.attackSpeedTicks;
        wolf.telegraph = false;
        wolf.waitUntilTick = tick + 2;
        if (dx !== 0 || dz !== 0) {
          wolf.facing = { x: Math.sign(dx), z: Math.sign(dz) };
        }
        ctx.onBite(wolf, hit, dmg, !inRange);
        continue;
      }

      // b) In melee range: stand still and telegraph if the cooldown is ready
      // for a bite next tick.
      if (adjacent) {
        wolf.facing = { x: Math.sign(dx), z: Math.sign(dz) };
        if (wolf.nextAttackTick <= tick + 1) {
          wolf.telegraph = true;
        }
        continue;
      }

      // c) Not in range: wait out post-attack recovery, otherwise take exactly
      // one naive step toward the player.
      if (tick < wolf.waitUntilTick) continue;

      const next = this._findStep(wolf, player);
      if (next) {
        wolf.facing = {
          x: Math.sign(next.x - wolf.x),
          z: Math.sign(next.z - wolf.z),
        };
        wolf.x = next.x;
        wolf.z = next.z;
      }

      if (
        isCardinalAdjacent(wolf.x, wolf.z, player.x, player.z) &&
        wolf.nextAttackTick <= tick + 1
      ) {
        wolf.telegraph = true;
      }
    }
  }

  _isFree(x, z, wolf, player) {
    if (!isWalkable(x, z)) return false;
    if (x === player.x && z === player.z) return false;
    for (const e of this.list) {
      if (e !== wolf && e.alive && e.x === x && e.z === z) return false;
    }
    return true;
  }

  // One OSRS-style naive step: diagonal, else x, else z, else stay.
  // Diagonal steps require both orthogonal corner tiles to be clear.
  _findStep(wolf, player) {
    const sx = Math.sign(player.x - wolf.x);
    const sz = Math.sign(player.z - wolf.z);

    // Diagonally adjacent wolves must move to a cardinal-adjacent tile.
    const diagonalAdjacent =
      Math.abs(player.x - wolf.x) === 1 && Math.abs(player.z - wolf.z) === 1;

    if (diagonalAdjacent) {
      if (sx !== 0 && this._isFree(wolf.x + sx, wolf.z, wolf, player)) {
        return { x: wolf.x + sx, z: wolf.z };
      }
      if (sz !== 0 && this._isFree(wolf.x, wolf.z + sz, wolf, player)) {
        return { x: wolf.x, z: wolf.z + sz };
      }
      return null;
    }

    if (sx !== 0 && sz !== 0) {
      const nx = wolf.x + sx;
      const nz = wolf.z + sz;
      const cornerX = this._isFree(nx, wolf.z, wolf, player);
      const cornerZ = this._isFree(wolf.x, nz, wolf, player);
      if (cornerX && cornerZ && this._isFree(nx, nz, wolf, player)) {
        return { x: nx, z: nz };
      }
    }

    if (sx !== 0 && this._isFree(wolf.x + sx, wolf.z, wolf, player)) {
      return { x: wolf.x + sx, z: wolf.z };
    }

    if (sz !== 0 && this._isFree(wolf.x, wolf.z + sz, wolf, player)) {
      return { x: wolf.x, z: wolf.z + sz };
    }

    return null;
  }
}
=== END FILE ===

Only `maxHit` (4 → 5) and `accuracy` (12 → 18) changed in the ice wolf definition; everything else is untouched.