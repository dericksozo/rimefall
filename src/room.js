// Room flow: countdown, wolf spawns, cleared state, death and restart.

import { SPAWN, isWalkable } from './world.js';

export const COUNTDOWN_TICKS = 3;
export const WOLF_COUNT = 3;
const SPAWN_ROWS = [1, 2];

export class Room {
  constructor(ctx) {
    // ctx: { rng, enemies, player, fx, log, noEnemies }
    this.ctx = ctx;
    this.state = 'countdown';
    this.countdownLeft = COUNTDOWN_TICKS;
    this.startedAtTick = 0;
    this.spawned = false;
  }

  start(tick) {
    this.startedAtTick = tick;
    this.countdownLeft = COUNTDOWN_TICKS;
    this.spawned = false;

    if (this.ctx.noEnemies) {
      this.state = 'fighting';
      return;
    }

    this.state = 'countdown';
    this.ctx.fx.banner('3', 'Ice wolves approach…', 560);
  }

  restart(tick, seed) {
    const { rng, enemies, player, fx, log } = this.ctx;

    if (seed !== undefined && seed !== null && Number.isFinite(Number(seed))) {
      rng.reset(Number(seed));
    }

    enemies.clear();

    player.x = SPAWN.x;
    player.z = SPAWN.z;
    player.prevX = SPAWN.x;
    player.prevZ = SPAWN.z;
    player.facing = { x: 0, z: 1 };
    player.moved = false;
    player.hp = player.maxHp;
    player.food = player.maxFood;
    player.nextAttackTick = 0;
    player.damageTick = -9999;

    fx.clearTransient();
    log({ tick, type: 'restart', src: 'player', dst: 'room', hit: false, dmg: 0, x: SPAWN.x, z: SPAWN.z });

    this.start(tick);
  }

  tick(tick) {
    // Do not consume a countdown step on the very tick a (re)start happened.
    if (tick === this.startedAtTick) return;

    if (this.state === 'countdown') {
      this.countdownLeft -= 1;
      if (this.countdownLeft <= 0) {
        this.state = 'fighting';
        this.spawnWolves(tick);
        this.ctx.fx.banner('Fight!', '', 900);
      } else {
        this.ctx.fx.banner(String(this.countdownLeft), '', 560);
      }
      return;
    }

    if (this.state === 'fighting' && this.spawned && !this.ctx.noEnemies) {
      if (this.ctx.enemies.livingCount() === 0) {
        this.state = 'cleared';
        const p = this.ctx.player;
        this.ctx.log({
          tick,
          type: 'room_cleared',
          src: 'room',
          dst: null,
          hit: false,
          dmg: 0,
          x: p.x,
          z: p.z,
        });
        this.ctx.fx.banner('Room cleared!', 'Press ✕ / Space to restart', 0);
      }
    }
  }

  playerDied(tick, src, dmg) {
    if (this.state === 'dead') return;
    this.state = 'dead';
    const p = this.ctx.player;
    this.ctx.log({
      tick,
      type: 'player_died',
      src: src || null,
      dst: 'player',
      hit: true,
      dmg: dmg || 0,
      x: p.x,
      z: p.z,
    });
    this.ctx.fx.banner('You died', 'Press ✕ / Space to restart', 0);
  }

  spawnWolves(tick) {
    const { rng, enemies, player, log } = this.ctx;

    const tiles = [];
    for (const z of SPAWN_ROWS) {
      for (let x = 1; x <= 13; x++) {
        if (!isWalkable(x, z)) continue;
        if (x === player.x && z === player.z) continue;
        tiles.push({ x, z });
      }
    }

    rng.shuffle(tiles);

    const chosen = [];
    for (const t of tiles) {
      if (chosen.length >= WOLF_COUNT) break;
      const spread = chosen.every((c) => Math.abs(c.x - t.x) + Math.abs(c.z - t.z) >= 2);
      if (spread) chosen.push(t);
    }
    for (const t of tiles) {
      if (chosen.length >= WOLF_COUNT) break;
      if (!chosen.includes(t)) chosen.push(t);
    }

    for (const t of chosen) {
      const enemy = enemies.spawn('ice_wolf', t.x, t.z, tick);
      log({
        tick,
        type: 'spawn',
        src: 'room',
        dst: enemy.id,
        hit: false,
        dmg: 0,
        x: t.x,
        z: t.z,
      });
    }

    this.spawned = chosen.length > 0;
  }
}
