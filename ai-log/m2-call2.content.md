=== FILE: style.css ===
/* Rimefall HUD — chunky, dark, RuneScape-ish. */

* { box-sizing: border-box; }

html, body {
  margin: 0;
  height: 100%;
  overflow: hidden;
  background: #0b1620;
  color: #ffd257;
  font-family: ui-monospace, "Courier New", "Consolas", monospace;
  -webkit-user-select: none;
  user-select: none;
  touch-action: none;
}

#app { position: fixed; inset: 0; }
#app canvas { display: block; }

#hud {
  position: fixed;
  top: 12px;
  left: 12px;
  min-width: 218px;
  padding: 10px 12px 9px;
  background: rgba(8, 16, 24, 0.78);
  border: 2px solid #7a5c1e;
  border-radius: 4px;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.55), inset 0 0 14px rgba(0, 0, 0, 0.65);
  font-size: 13px;
  line-height: 1.45;
  letter-spacing: 0.4px;
  pointer-events: none;
  z-index: 5;
}

#hud .title {
  color: #ffb347;
  font-weight: bold;
  letter-spacing: 3px;
  margin-bottom: 5px;
  text-shadow: 1px 1px 0 #000;
}

#hud .row { display: flex; justify-content: space-between; gap: 16px; }
#hud .k { color: #9fb6c9; }
#hud .v { color: #ffe08a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px; }

#hud .meter {
  height: 6px;
  margin: 1px 0 5px;
  background: #6b1010;
  border: 1px solid #000;
  border-radius: 1px;
  overflow: hidden;
}
#hud .meter > div {
  height: 100%;
  width: 100%;
  background: #22c55e;
  transition: width 0.12s linear;
}

#hint {
  position: fixed;
  left: 12px;
  bottom: 12px;
  max-width: 720px;
  padding: 8px 12px;
  background: rgba(8, 16, 24, 0.66);
  border: 2px solid #4d4020;
  border-radius: 4px;
  color: #cfe0ee;
  font-size: 12px;
  line-height: 1.55;
  pointer-events: none;
  z-index: 5;
}
#hint b { color: #ffd257; }
#hint span { color: #8fa6b8; }

#toast {
  position: fixed;
  top: 14px;
  left: 50%;
  transform: translate(-50%, -10px);
  padding: 8px 16px;
  max-width: 72vw;
  background: rgba(8, 16, 24, 0.92);
  border: 2px solid #7a5c1e;
  border-radius: 4px;
  color: #ffe08a;
  font-size: 13px;
  text-align: center;
  opacity: 0;
  transition: opacity 0.22s ease, transform 0.22s ease;
  pointer-events: none;
  z-index: 8;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
}
#toast.visible { opacity: 1; transform: translate(-50%, 0); }

#pause-overlay {
  position: fixed;
  inset: 0;
  display: none;
  place-items: center;
  background: rgba(4, 10, 16, 0.55);
  backdrop-filter: blur(2px);
  z-index: 10;
  pointer-events: none;
}
#pause-overlay.visible { display: grid; }
#pause-overlay .box {
  padding: 18px 44px;
  font-size: 40px;
  letter-spacing: 10px;
  color: #ffd257;
  background: rgba(8, 14, 20, 0.88);
  border: 3px double #a8792a;
  border-radius: 4px;
  text-shadow: 3px 3px 0 #000, 0 0 26px rgba(255, 200, 80, 0.35);
}

/* ---- combat overlays ---- */

#overlay {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 6;
}

.splat {
  position: absolute;
  left: -1000px;
  top: -1000px;
  width: 30px;
  height: 27px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: bold;
  color: #fff;
  text-shadow: 1px 1px 0 #000;
  border-radius: 48% 52% 46% 54%;
  transform: translate(-50%, -50%);
  will-change: transform, opacity, left, top;
  pointer-events: none;
}
.splat.hit {
  background: #c62828;
  border: 2px solid #6d0f0f;
  box-shadow: 0 0 8px rgba(255, 80, 80, 0.45);
}
.splat.miss {
  background: #2f6fd0;
  border: 2px solid #123a72;
  box-shadow: 0 0 6px rgba(90, 150, 255, 0.35);
}
.splat.heal {
  width: 38px;
  background: #2e9e4f;
  border: 2px solid #14572a;
  box-shadow: 0 0 8px rgba(80, 230, 120, 0.4);
}

.hpbar {
  position: absolute;
  width: 46px;
  height: 6px;
  background: #6b1010;
  border: 1px solid #000;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.45);
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 1;
}
.hpbar.enemy { z-index: 2; }
.hpbar > .fill {
  height: 100%;
  width: 100%;
  background: #22c55e;
}

#banner {
  position: fixed;
  top: 17%;
  left: 50%;
  transform: translate(-50%, -10px);
  min-width: 340px;
  max-width: min(80vw, 620px);
  padding: 18px 34px 16px;
  text-align: center;
  opacity: 0;
  transition: opacity 0.18s ease, transform 0.18s ease;
  pointer-events: none;
  z-index: 7;
  background: rgba(8, 16, 24, 0.84);
  border: 2px solid #7a5c1e;
  border-radius: 4px;
  box-shadow:
    0 0 0 2px rgba(0, 0, 0, 0.6),
    0 10px 26px rgba(0, 0, 0, 0.55),
    inset 0 0 22px rgba(0, 0, 0, 0.7);
}
#banner.visible { opacity: 1; transform: translate(-50%, 0); }
#banner .main {
  font-size: 46px;
  font-weight: bold;
  letter-spacing: 7px;
  color: #ffe08a;
  -webkit-text-stroke: 1px rgba(0, 0, 0, 0.85);
  text-shadow:
    0 3px 0 #000,
    0 0 10px rgba(0, 0, 0, 0.95),
    0 0 24px rgba(255, 200, 80, 0.35);
}
#banner.dead .main {
  color: #ff4d4d;
  -webkit-text-stroke-color: rgba(45, 0, 0, 0.92);
  text-shadow:
    0 3px 0 #3a0000,
    0 0 10px rgba(0, 0, 0, 0.95),
    0 0 24px rgba(255, 50, 50, 0.5);
}
#banner .sub {
  margin-top: 8px;
  font-size: 18px;
  font-weight: bold;
  letter-spacing: 1.5px;
  color: #ffe08a;
  text-shadow: 1px 2px 0 #000, 0 0 10px rgba(0, 0, 0, 0.9);
}
=== END FILE ===
=== FILE: src/main.js ===
// Rimefall — Milestone 2: melee combat vs ice wolves.
// Movement feel, camera, tick clock, direction mapping, snapping/hysteresis,
// corner sliding and the one-tick linear player lerp are unchanged from 1.2.

import { Input } from './input.js';
import { Ticker } from './tick.js';
import { Render } from './render.js';
import { SPAWN, blockers, isWalkable } from './world.js';
import { RNG } from './rng.js';
import { Fx } from './fx.js';
import { Enemies } from './enemies.js';
import { Room } from './room.js';
import {
  WEAPONS,
  PLAYER_STATS,
  rollHit,
  rollDamage,
  inWeaponRange,
} from './combat.js';

const hud = {
  tick: document.getElementById('hud-tick'),
  tile: document.getElementById('hud-tile'),
  input: document.getElementById('hud-input'),
  hp: document.getElementById('hud-hp'),
  hpFill: document.getElementById('hud-hp-fill'),
  food: document.getElementById('hud-food'),
  target: document.getElementById('hud-target'),
  toast: document.getElementById('toast'),
  pause: document.getElementById('pause-overlay'),
};
const hintEl = document.getElementById('hint');
const KEYBOARD_HINT_HTML = hintEl.innerHTML;

let toastTimer = 0;
function showToast(text, ms = 3000) {
  hud.toast.textContent = text;
  hud.toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => hud.toast.classList.remove('visible'), ms);
}

const params = new URLSearchParams(window.location.search);
const seedRaw = params.get('seed');
const initialSeed =
  seedRaw !== null && seedRaw !== '' && Number.isFinite(Number(seedRaw)) ? Number(seedRaw) : 1;
const NO_ENEMIES = params.get('noenemies') === '1' || params.get('noenemies') === 'true';

const ticker = new Ticker();
const render = new Render(document.getElementById('app'));
const rng = new RNG(initialSeed);

const player = {
  x: SPAWN.x,
  z: SPAWN.z,
  prevX: SPAWN.x,
  prevZ: SPAWN.z,
  facing: { x: 0, z: 1 }, // facing south (+z) at spawn
  moved: false,
  hp: PLAYER_STATS.maxHp,
  maxHp: PLAYER_STATS.maxHp,
  defence: PLAYER_STATS.defence,
  food: PLAYER_STATS.foodCount,
  maxFood: PLAYER_STATS.foodCount,
  weapon: WEAPONS.sword,
  nextAttackTick: 0,
  damageTick: -9999,
};

const enemies = new Enemies(rng);

const fx = new Fx({
  overlay: document.getElementById('overlay'),
  banner: document.getElementById('banner'),
  render,
});

const combatLog = [];
const MAX_COMBAT_LOG = 500;
function logEvent(entry) {
  combatLog.push({
    tick: entry.tick,
    type: entry.type,
    src: entry.src === undefined ? null : entry.src,
    dst: entry.dst === undefined ? null : entry.dst,
    hit: entry.hit === undefined ? false : entry.hit,
    dmg: entry.dmg === undefined ? 0 : entry.dmg,
    x: entry.x === undefined ? 0 : entry.x,
    z: entry.z === undefined ? 0 : entry.z,
  });
  if (combatLog.length > MAX_COMBAT_LOG) {
    combatLog.splice(0, combatLog.length - MAX_COMBAT_LOG);
  }
}

const room = new Room({
  rng,
  enemies,
  player,
  fx,
  log: logEvent,
  noEnemies: NO_ENEMIES,
});

const input = new Input({ onPause: togglePause, onToast: showToast });

function togglePause() {
  ticker.setPaused(!ticker.paused);
  hud.pause.classList.toggle('visible', ticker.paused);
}

// ---- targeting ----

let targetId = null;

function distTo(e) {
  return Math.abs(e.x - player.x) + Math.abs(e.z - player.z);
}

function getTarget() {
  if (targetId == null) return null;
  const e = enemies.get(targetId);
  if (!e || !e.alive) return null;
  return e;
}

function clearTarget() {
  targetId = null;
}

function selectNearestTarget() {
  const living = enemies.living();
  if (living.length === 0) return false;

  let minD = Infinity;
  for (const e of living) minD = Math.min(minD, distTo(e));
  let pool = living.filter((e) => distTo(e) <= minD + 1);

  // Prefer enemies roughly in the facing direction when distances are close.
  const fx0 = player.facing.x;
  const fz0 = player.facing.z;
  const flen = Math.hypot(fx0, fz0) || 1;
  const front = pool.filter((e) => {
    const dx = e.x - player.x;
    const dz = e.z - player.z;
    const len = Math.hypot(dx, dz) || 1;
    return (dx * fx0 + dz * fz0) / (len * flen) > 0.45;
  });
  if (front.length > 0) pool = front;

  pool.sort((a, b) => distTo(a) - distTo(b) || a.uid - b.uid);
  targetId = pool[0].id;
  return true;
}

function cycleTarget(dir) {
  const living = enemies.living();
  if (living.length === 0) {
    clearTarget();
    return;
  }
  const order = living.slice().sort((a, b) => distTo(a) - distTo(b) || a.uid - b.uid);
  let idx = order.findIndex((e) => e.id === targetId);
  if (idx < 0) idx = dir > 0 ? -1 : 0;
  const n = order.length;
  idx = (idx + dir + n) % n;
  targetId = order[idx].id;
}

// ---- player movement (unchanged rules; enemies are extra walls) ----

function step(dx, dz) {
  const nx = player.x + dx;
  const nz = player.z + dz;
  if (!isWalkable(nx, nz)) return false;
  if (enemies.isOccupied(nx, nz)) return false;
  if (dx !== 0 && dz !== 0) {
    if (!isWalkable(player.x + dx, player.z)) return false;
    if (!isWalkable(player.x, player.z + dz)) return false;
    if (enemies.isOccupied(player.x + dx, player.z)) return false;
    if (enemies.isOccupied(player.x, player.z + dz)) return false;
  }
  player.x = nx;
  player.z = nz;
  return true;
}

// OSRS-like corner slide: a blocked diagonal falls back to a free cardinal
// component, trying the larger stick component first (x/east-west on a tie).
function tryMove(dx, dz, preferX) {
  if (dx !== 0 && dz !== 0) {
    if (step(dx, dz)) return { x: dx, z: dz };

    const first = preferX ? { x: dx, z: 0 } : { x: 0, z: dz };
    const second = preferX ? { x: 0, z: dz } : { x: dx, z: 0 };

    if (step(first.x, first.z)) return first;
    if (step(second.x, second.z)) return second;
    return null;
  }

  return step(dx, dz) ? { x: dx, z: dz } : null;
}

let lastMoveDir = null;
const moveLog = [];
const MAX_MOVE_LOG = 200;

// ---- debug overrides ----

let debugManual = false;
let debugMove = null;
let fatalWolfId = null;
let fatalDmg = 0;

// ---- combat resolution ----

function playerAttackTick(tick) {
  if (targetId != null && !getTarget()) {
    clearTarget();
    return;
  }
  const target = getTarget();
  if (!target) return;
  if (tick < player.nextAttackTick) return;

  const weapon = player.weapon;
  if (!inWeaponRange(weapon, player.x, player.z, target.x, target.z)) return;

  player.facing = {
    x: Math.sign(target.x - player.x),
    z: Math.sign(target.z - player.z),
  };
  player.nextAttackTick = tick + weapon.attackSpeedTicks;
  render.triggerPlayerAttack();

  const hit = rollHit(rng, weapon.accuracy, target.defence);
  const dmg = hit ? rollDamage(rng, weapon.maxHit) : 0;

  if (hit) {
    target.hp = Math.max(0, target.hp - dmg);
    target.damageTick = tick;
  }

  fx.splat({ kind: 'enemy', id: target.id }, hit ? 'hit' : 'miss', String(dmg), tick);
  logEvent({
    tick,
    type: 'player_attack',
    src: 'player',
    dst: target.id,
    hit,
    dmg,
    x: target.x,
    z: target.z,
  });

  if (target.hp <= 0) {
    target.alive = false;
    target.deathTick = tick;
    target.telegraph = false;
    logEvent({
      tick,
      type: 'enemy_death',
      src: 'player',
      dst: target.id,
      hit: true,
      dmg: 0,
      x: target.x,
      z: target.z,
    });
    clearTarget();
  }
}

function handleEnemyBite(tick, wolf, hit, dmg) {
  if (hit) {
    player.hp = Math.max(0, player.hp - dmg);
    player.damageTick = tick;
    if (player.hp <= 0) {
      fatalWolfId = wolf.id;
      fatalDmg = dmg;
    }
  }
  fx.splat({ kind: 'player' }, hit ? 'hit' : 'miss', String(dmg), tick);
  logEvent({
    tick,
    type: 'enemy_attack',
    src: wolf.id,
    dst: 'player',
    hit,
    dmg,
    x: player.x,
    z: player.z,
  });
}

function restartRoom(seed) {
  clearTarget();
  room.restart(ticker.tick, seed);
  player.defence = PLAYER_STATS.defence;
  lastMoveDir = null;
  fatalWolfId = null;
  fatalDmg = 0;
}

// ---- the one game tick ----
// Order: input actions -> player move -> player attack -> enemies -> deaths ->
// room flow. Presentation never mutates logical state.

function gameTick(tick) {
  const fromX = player.x;
  const fromZ = player.z;
  player.prevX = fromX;
  player.prevZ = fromZ;
  player.moved = false;

  fatalWolfId = null;
  fatalDmg = 0;

  enemies.beginTick(tick);

  let ateThisTick = false;
  const actions = input.consumeActions();
  const busy = room.state === 'cleared' || room.state === 'dead';

  for (const action of actions) {
    if (busy) {
      if (action === 'attack') {
        restartRoom();
      } else if (action === 'clear') {
        clearTarget();
      }
      continue;
    }

    if (action === 'attack') {
      if (!getTarget()) selectNearestTarget();
      // Pressing again while targeting keeps the current target.
    } else if (action === 'cycle') {
      cycleTarget(1);
    } else if (action === 'cycleBack') {
      cycleTarget(-1);
    } else if (action === 'clear') {
      clearTarget();
    } else if (action === 'eat') {
      if (player.food <= 0) {
        showToast('No food left', 1400);
      } else if (player.hp >= player.maxHp) {
        showToast('Already at full health', 1400);
      } else {
        const heal = Math.min(PLAYER_STATS.foodHeal, player.maxHp - player.hp);
        player.food -= 1;
        player.hp += heal;
        player.nextAttackTick = Math.max(player.nextAttackTick, tick + 3);
        ateThisTick = true;
        fx.splat({ kind: 'player' }, 'heal', `+${heal}`, tick);
        logEvent({
          tick,
          type: 'eat',
          src: 'player',
          dst: 'player',
          hit: false,
          dmg: heal,
          x: player.x,
          z: player.z,
        });
      }
    }
  }

  // 1) movement (skipped on an eat tick and when dead)
  if (!ateThisTick && room.state !== 'dead') {
    // useMovement() has already been evaluated this frame, before the ticker ran.
    const intent = debugMove !== null ? debugMove : input.getMoveIntent();
    let actual = null;
    if (intent && intent.dir) {
      actual = tryMove(intent.dir.x, intent.dir.z, intent.preferX);
    }

    lastMoveDir = actual ? { x: actual.x, z: actual.z } : null;

    if (actual) {
      player.facing = { x: actual.x, z: actual.z };
      player.moved = true;
    }
  } else {
    lastMoveDir = null;
  }

  // 2) player attack: engaged targets are attacked whenever adjacent + ready
  if (room.state === 'fighting') {
    playerAttackTick(tick);
  }

  // 3) enemies move/attack, fixed order, with per-tick reservations
  if (room.state === 'fighting') {
    enemies.tick(tick, player, {
      isPlayerAlive: () => player.hp > 0,
      onBite: (wolf, hit, dmg) => handleEnemyBite(tick, wolf, hit, dmg),
    });

    if (player.hp <= 0) {
      room.playerDied(tick, fatalWolfId, fatalDmg);
      clearTarget();
    }
  }

  // 4) room flow: countdown steps, cleared detection
  room.tick(tick);

  moveLog.push({
    tick,
    fromX,
    fromZ,
    toX: player.x,
    toZ: player.z,
  });
  if (moveLog.length > MAX_MOVE_LOG) {
    moveLog.splice(0, moveLog.length - MAX_MOVE_LOG);
  }
}

ticker.subscribe((tick) => gameTick(tick));

function worldView() {
  return { enemies: enemies.list, targetId, tick: ticker.tick };
}

function stepTicks(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  for (let i = 0; i < n; i++) {
    ticker.tick += 1;
    gameTick(ticker.tick);
  }
  ticker.resync();
  render.update(0, player, 1, worldView());
}

const FACING_NAMES = {
  '0,1': 'south',
  '0,-1': 'north',
  '1,0': 'east',
  '-1,0': 'west',
  '1,1': 'south-east',
  '1,-1': 'north-east',
  '-1,1': 'south-west',
  '-1,-1': 'north-west',
};

function facingName(f) {
  return FACING_NAMES[`${f.x},${f.z}`] || 'south';
}

// ---- live controls hint ----

function isPlayStationId(id) {
  const s = String(id).toLowerCase();
  return (
    s.includes('dualshock') ||
    s.includes('dualsense') ||
    s.includes('wireless controller') ||
    s.includes('playstation') ||
    s.includes('054c')
  );
}

let hintKey = 'keyboard';
function updateHint() {
  const device = input.device;

  if (device.startsWith('gamepad')) {
    const id = device.startsWith('gamepad: ')
      ? device.slice('gamepad: '.length)
      : device;
    const playstation = isPlayStationId(id);
    const key = playstation ? 'pad-playstation' : 'pad-xbox';
    if (hintKey !== key) {
      hintEl.innerHTML = playstation
        ? '<b>Left stick</b> move · <b>✕</b> attack · <b>R1/L1</b> cycle target · <b>○</b> clear target · <b>□</b> eat · <b>Options</b> pause'
        : '<b>Left stick</b> move · <b>A</b> attack · <b>RB/LB</b> cycle target · <b>B</b> clear target · <b>X</b> eat · <b>Start</b> pause';
      hintKey = key;
    }
  } else if (hintKey !== 'keyboard') {
    hintEl.innerHTML = KEYBOARD_HINT_HTML;
    hintKey = 'keyboard';
  }
}

// ---- test hooks ----

window.__rimefall = {
  get tick() {
    return ticker.tick;
  },
  get alpha() {
    return ticker.alpha;
  },
  get lastTickTime() {
    return ticker.lastTickTime;
  },
  get player() {
    return {
      x: player.x,
      z: player.z,
      facing: { x: player.facing.x, z: player.facing.z },
      facingName: facingName(player.facing),
    };
  },
  get inputDevice() {
    return input.device;
  },
  get paused() {
    return ticker.paused;
  },
  isWalkable,
  blockers,
  tileToScreen(x, z) {
    return render.tileToScreen(x, z);
  },
  meshScreen() {
    return render.meshScreen();
  },
  meshWorld() {
    return render.meshWorld();
  },
  get hintText() {
    return hintEl.textContent;
  },
  get lastMoveDir() {
    return lastMoveDir ? { x: lastMoveDir.x, z: lastMoveDir.z } : null;
  },
  get moveLog() {
    return moveLog;
  },

  // ---- milestone 2 hooks ----
  get hp() {
    return player.hp;
  },
  get maxHp() {
    return player.maxHp;
  },
  get food() {
    return player.food;
  },
  get targetId() {
    return targetId;
  },
  get roomState() {
    return room.state;
  },
  get nextAttackTick() {
    return player.nextAttackTick;
  },
  get weapon() {
    return {
      id: player.weapon.id,
      name: player.weapon.name,
      style: player.weapon.style,
      attackSpeedTicks: player.weapon.attackSpeedTicks,
      range: player.weapon.range,
      maxHit: player.weapon.maxHit,
      accuracy: player.weapon.accuracy,
    };
  },
  get enemies() {
    return enemies.list.map((e) => ({
      id: e.id,
      kind: e.kind,
      x: e.x,
      z: e.z,
      hp: e.hp,
      maxHp: e.maxHp,
      alive: e.alive,
      nextAttackTick: e.nextAttackTick,
      telegraph: !!e.telegraph,
    }));
  },
  get combatLog() {
    return combatLog;
  },
  debug: {
    manual(on) {
      debugManual = !!on;
      ticker.resync();
    },
    step(n = 1) {
      stepTicks(n);
    },
    setMove(dx, dz) {
      if (dx === null || dx === undefined) {
        debugMove = null;
        return;
      }
      const rawX = Number(dx) || 0;
      const rawZ = Number(dz) || 0;
      const sx = Math.sign(rawX);
      const sz = Math.sign(rawZ);
      debugMove = {
        dir: sx || sz ? { x: sx, z: sz } : null,
        preferX: Math.abs(rawX) >= Math.abs(rawZ),
      };
    },
    press(action) {
      if (!['attack', 'eat', 'cycle', 'cycleBack', 'clear'].includes(action)) return false;
      input.queueAction(action);
      return true;
    },
    restart(seed) {
      restartRoom(seed);
      render.update(0, player, 1, worldView());
    },
  },
};

// ---- HUD ----

const hudState = { tick: -1, tile: '', input: '', hp: '', food: '', target: '' };
function updateHud() {
  if (ticker.tick !== hudState.tick) {
    hudState.tick = ticker.tick;
    hud.tick.textContent = String(ticker.tick);
  }

  const tile = `(${player.x}, ${player.z})`;
  if (tile !== hudState.tile) {
    hudState.tile = tile;
    hud.tile.textContent = tile;
  }

  if (input.device !== hudState.input) {
    hudState.input = input.device;
    hud.input.textContent = input.device;
    updateHint();
  }

  const hp = Math.max(0, player.hp);
  const hpText = `${hp}/${player.maxHp}`;
  if (hpText !== hudState.hp) {
    hudState.hp = hpText;
    hud.hp.textContent = hpText;
    hud.hpFill.style.width = `${((hp / player.maxHp) * 100).toFixed(1)}%`;
  }

  const foodText = String(player.food);
  if (foodText !== hudState.food) {
    hudState.food = foodText;
    hud.food.textContent = foodText;
  }

  const target = getTarget();
  const targetText = target ? `${target.name} ${target.hp}/${target.maxHp}` : 'No target';
  if (targetText !== hudState.target) {
    hudState.target = targetText;
    hud.target.textContent = targetText;
  }
}

let lastFrameTime = -1;
let ready = false;

function frame(now) {
  requestAnimationFrame(frame);

  if (lastFrameTime < 0) lastFrameTime = now;
  let dt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  if (!Number.isFinite(dt) || dt < 0) dt = 0;
  dt = Math.min(dt, 0.1);

  // Input is always sampled before the ticker, so a tick sees this frame's
  // freshest stick/keyboard state.
  input.pollGamepads();
  input.updateMovement();

  if (!debugManual) ticker.update(now);

  render.update(dt, player, ticker.alpha, worldView());
  fx.update(ticker.tick, { player, enemies: enemies.list });
  render.render();
  updateHud();

  if (!ready) {
    ready = true;
    console.log('[rimefall] ready');
  }
}

room.start(ticker.tick);
updateHint();
requestAnimationFrame(frame);
=== END FILE ===
=== FILE: src/combat.js ===
// Rimefall combat core: weapon table, OSRS-like hit rolls, damage and range.
// Styles are data-driven so ranged/magic weapons can plug in at M3.

export const PLAYER_STATS = {
  maxHp: 40,
  defence: 12,
  foodCount: 4,
  foodHeal: 10,
};

export const WEAPONS = {
  sword: {
    id: 'sword',
    name: 'Iron Sword',
    style: 'melee',
    attackSpeedTicks: 4,
    range: 1,
    maxHit: 6,
    accuracy: 18,
  },
};

export function getWeapon(id) {
  return WEAPONS[id] || null;
}

let warnedNonFiniteRollHit = false;

// OSRS-like: attack roll vs defence roll, each uniform over [0, stat].
// A missing/non-finite stat is treated as zero so a single bad input can never
// turn the whole roll into NaN (which would make every attack silently miss).
export function rollHit(rng, accuracy, defence) {
  let attackStat = Number(accuracy);
  let defenceStat = Number(defence);

  if (!Number.isFinite(attackStat) || !Number.isFinite(defenceStat)) {
    if (!warnedNonFiniteRollHit) {
      warnedNonFiniteRollHit = true;
      console.warn('[rimefall] rollHit received a non-finite stat; treating it as 0.', {
        accuracy,
        defence,
      });
    }
    if (!Number.isFinite(attackStat)) attackStat = 0;
    if (!Number.isFinite(defenceStat)) defenceStat = 0;
  }

  const attackRoll = rng.next() * (attackStat + 1);
  const defenceRoll = rng.next() * (defenceStat + 1);
  return attackRoll > defenceRoll;
}

// Uniform integer 0..maxHit. A hit may roll 0 (shown as a red 0).
export function rollDamage(rng, maxHit) {
  return Math.floor(rng.next() * (maxHit + 1));
}

export function manhattan(ax, az, bx, bz) {
  return Math.abs(ax - bx) + Math.abs(az - bz);
}

// Melee reaches only cardinally adjacent tiles, never diagonals.
export function isCardinalAdjacent(ax, az, bx, bz) {
  return Math.abs(ax - bx) + Math.abs(az - bz) === 1;
}

export function inWeaponRange(weapon, ax, az, bx, bz) {
  const d = manhattan(ax, az, bx, bz);
  if (weapon.style === 'melee') return d === 1;
  return d <= weapon.range;
}
=== END FILE ===
=== FILE: src/enemies.js ===
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
=== END FILE ===
=== FILE: src/fx.js ===
// DOM combat overlays: hitsplats, floating health bars and banners.
// All positions are projected from live, interpolated 3D mesh positions.

const SPLAT_LIFE_MS = 600;
const BAR_TICKS = 10;

export class Fx {
  constructor({ overlay, banner, render }) {
    this.overlay = overlay;
    this.bannerEl = banner;
    this.bannerMain = banner ? banner.querySelector('.main') : null;
    this.bannerSub = banner ? banner.querySelector('.sub') : null;
    this.render = render;

    this.splats = [];
    this.bars = new Map();
    this.bannerTimer = null;
    this.slotTick = null;
    this.slots = new Map();
  }

  banner(main, sub = '', ms = 900) {
    if (!this.bannerEl) return;
    const title = main == null ? '' : String(main);
    const isDeath = /you\s+died|you\s+are\s+dead/i.test(title);
    this.bannerEl.classList.toggle('dead', isDeath);
    if (this.bannerMain) this.bannerMain.textContent = main;
    if (this.bannerSub) this.bannerSub.textContent = sub || '';
    this.bannerEl.classList.add('visible');
    if (this.bannerTimer) {
      clearTimeout(this.bannerTimer);
      this.bannerTimer = null;
    }
    if (ms > 0) {
      this.bannerTimer = setTimeout(() => {
        this.bannerEl.classList.remove('visible');
        this.bannerTimer = null;
      }, ms);
    }
  }

  clearBanner() {
    if (this.bannerTimer) {
      clearTimeout(this.bannerTimer);
      this.bannerTimer = null;
    }
    if (this.bannerEl) {
      this.bannerEl.classList.remove('visible');
      this.bannerEl.classList.remove('dead');
    }
  }

  // ref = { kind: 'player' } or { kind: 'enemy', id }
  splat(ref, kind, text, tick) {
    if (!this.overlay) return;
    const el = document.createElement('div');
    el.className = `splat ${kind}`;
    el.textContent = text;
    el.style.opacity = '1';
    this.overlay.appendChild(el);

    const key = ref.kind === 'enemy' ? ref.id : 'player';
    if (this.slotTick !== tick) {
      this.slotTick = tick;
      this.slots.clear();
    }
    const slot = this.slots.get(key) || 0;
    this.slots.set(key, slot + 1);

    const offsets = [0, -20, 20, -34, 34];
    const ox = offsets[slot % offsets.length];
    const oy = slot >= offsets.length ? -12 : 0;

    this.splats.push({ el, ref, born: performance.now(), ox, oy, last: null });
  }

  clearTransient() {
    for (const s of this.splats) s.el.remove();
    this.splats.length = 0;
    for (const bar of this.bars.values()) bar.el.remove();
    this.bars.clear();
    this.slots.clear();
    this.slotTick = null;
    this.clearBanner();
  }

  _ensureBar(key, isPlayer) {
    let bar = this.bars.get(key);
    if (!bar) {
      const el = document.createElement('div');
      el.className = isPlayer ? 'hpbar player' : 'hpbar enemy';
      const fill = document.createElement('div');
      fill.className = 'fill';
      el.appendChild(fill);
      this.overlay.appendChild(el);
      bar = { el, fill };
      this.bars.set(key, bar);
    }
    return bar;
  }

  update(tick, entities, now = performance.now()) {
    // Hitsplats float up and fade over roughly one tick.
    for (let i = this.splats.length - 1; i >= 0; i--) {
      const s = this.splats[i];
      const age = now - s.born;
      if (age >= SPLAT_LIFE_MS) {
        s.el.remove();
        this.splats.splice(i, 1);
        continue;
      }
      const p = Math.max(0, Math.min(1, age / SPLAT_LIFE_MS));
      const yOffset = s.ref.kind === 'player' ? 2.05 : 1.4;
      const anchor = this.render.entityScreen(s.ref, yOffset);
      if (anchor) s.last = anchor;
      if (!s.last) {
        s.el.style.opacity = '0';
        continue;
      }
      s.el.style.left = `${s.last.x + s.ox}px`;
      s.el.style.top = `${s.last.y + s.oy - 28 * p}px`;
      s.el.style.opacity = String(1 - p * p);
      s.el.style.transform = `translate(-50%, -50%) scale(${(1.12 - 0.12 * p).toFixed(3)})`;
    }

    // Health bars: any entity damaged within the last 10 ticks.
    const active = new Set();
    const entries = [];
    if (entities.player) {
      entries.push({ key: 'player', ref: { kind: 'player' }, ent: entities.player, y: 2.1, isPlayer: true });
    }
    if (entities.enemies) {
      for (const e of entities.enemies) {
        entries.push({ key: e.id, ref: { kind: 'enemy', id: e.id }, ent: e, y: 1.5, isPlayer: false });
      }
    }

    const placed = [];
    for (const it of entries) {
      const ent = it.ent;
      const alive = it.isPlayer ? ent.hp > 0 : ent.alive;
      if (!alive) continue;
      if (ent.damageTick == null) continue;
      if (tick - ent.damageTick > BAR_TICKS) continue;

      active.add(it.key);
      const bar = this._ensureBar(it.key, it.isPlayer);
      const scr = this.render.entityScreen(it.ref, it.y);
      if (!scr) {
        bar.el.style.display = 'none';
        continue;
      }
      bar.el.style.display = 'block';
      bar.el.style.zIndex = it.isPlayer ? '1' : '2';
      const frac = Math.max(0, Math.min(1, ent.hp / ent.maxHp));
      bar.fill.style.width = `${(frac * 100).toFixed(1)}%`;
      placed.push({ bar, x: scr.x, y: scr.y, isPlayer: it.isPlayer });
    }

    // Lay bars out by screen position. A wolf north of the player can be
    // visually hidden behind the player model, so make sure its bar is clearly
    // above the player's bar rather than sharing the same screen row.
    const playerBar = placed.find((p) => p.isPlayer) || null;
    if (playerBar) {
      for (const p of placed) {
        if (p.isPlayer) continue;
        if (Math.abs(p.x - playerBar.x) < 48 && p.y > playerBar.y - 10) {
          p.y = playerBar.y - 10;
        }
      }
    }

    for (const p of placed) {
      p.bar.el.style.left = `${p.x}px`;
      p.bar.el.style.top = `${p.y}px`;
    }

    for (const [key, bar] of Array.from(this.bars.entries())) {
      if (!active.has(key)) {
        bar.el.remove();
        this.bars.delete(key);
      }
    }
  }
}
=== END FILE ===
=== FILE: src/render.js ===
// Three.js presentation layer: room, props, player, enemies, camera, lights, snow.
// It knows nothing about game rules; main.js feeds it state + tick alpha.

import * as THREE from 'three';
import { createEntityMesh } from './entities.js';
import { ROOM_SIZE, MIN, MAX, pillars, brokenWall, SPAWN } from './world.js';

const CENTER = (MIN + MAX) / 2;

// Snow volume around the play area. Flakes that drift within SNOW_SAFE_RADIUS
// of the camera are recycled, so none ever balloon in the foreground.
const SNOW_BOUNDS = {
  minX: -1.5,
  maxX: ROOM_SIZE + 0.5,
  minZ: -1.5,
  maxZ: ROOM_SIZE + 0.5,
  minY: -0.3,
  maxY: 11.0,
};
const SNOW_WIDTH_X = SNOW_BOUNDS.maxX - SNOW_BOUNDS.minX;
const SNOW_WIDTH_Z = SNOW_BOUNDS.maxZ - SNOW_BOUNDS.minZ;
const SNOW_HEIGHT = SNOW_BOUNDS.maxY - SNOW_BOUNDS.minY;
const SNOW_SAFE_RADIUS = 4.6;
const SNOW_SAFE_RADIUS_SQ = SNOW_SAFE_RADIUS * SNOW_SAFE_RADIUS;

const PLAYER_SWING_TIME = 0.36;
const WOLF_SCALE = 1.12;

function mulberry32(seed) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Render {
  constructor(container) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xb9d3e6);
    this.scene.fog = new THREE.Fog(0xb9d3e6, 21, 45);

    // OSRS-style north-facing camera: due south of the player (+z), looking
    // north (-z). Same pitch/distance as milestone 1.1, just yawed.
    this.camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 200);
    this.camOffset = new THREE.Vector3(0, 11.44, Math.hypot(7.26, 7.26));
    this.follow = new THREE.Vector3(SPAWN.x, 0, SPAWN.z);
    this.camPos = this.follow.clone().add(this.camOffset);
    this.camLook = new THREE.Vector3(SPAWN.x, 0.9, SPAWN.z);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    this._tmpA = new THREE.Vector3();
    this._tmpB = new THREE.Vector3();
    this._tmpProj = new THREE.Vector3();
    this._tmpScreen = new THREE.Vector3();

    this.enemyMeshes = new Map();
    this.animTime = 0;
    this.swing = 0;

    this._buildLights();
    this._buildFloor();
    this._buildWalls();
    this._buildProps();
    this._buildPlayer();
    this._buildTileMarker();
    this._buildTargetRing();
    this._buildTargetArrow();
    this._buildSnow();

    this.facingYaw = 0; // model front is +z; spawn faces south

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  _buildLights() {
    // Lower ambient than milestone 1 so pillars/player keep readable shading
    // and the sun casts visible shadows onto the ice floor.
    const hemi = new THREE.HemisphereLight(0xdcecff, 0x273645, 0.82);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2d8, 2.0);
    sun.position.set(9, 17, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -13;
    sun.shadow.camera.right = 13;
    sun.shadow.camera.top = 13;
    sun.shadow.camera.bottom = -13;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 55;
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
    sun.target.position.set(CENTER, 0, CENTER);
    this.scene.add(sun);
    this.scene.add(sun.target);
  }

  _buildFloor() {
    // Darker blue base shows through the tile gaps as subtle grid lines.
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM_SIZE + 0.2, ROOM_SIZE + 0.2),
      new THREE.MeshStandardMaterial({ color: 0x243c50, roughness: 1, metalness: 0 })
    );
    base.rotation.x = -Math.PI / 2;
    base.position.set(CENTER, -0.16, CENTER);
    base.receiveShadow = true;
    this.scene.add(base);

    // Low ice tiles: pale blue-grey with a mix of bluer ice and whiter snow.
    const geo = new THREE.BoxGeometry(0.92, 0.18, 0.92);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      flatShading: true,
      roughness: 0.92,
      metalness: 0.02,
    });
    const tiles = new THREE.InstancedMesh(geo, mat, ROOM_SIZE * ROOM_SIZE);
    tiles.receiveShadow = true;

    const rand = mulberry32(1337);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let i = 0;
    for (let x = MIN; x <= MAX; x++) {
      for (let z = MIN; z <= MAX; z++) {
        dummy.position.set(x, -0.09, z);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        tiles.setMatrixAt(i, dummy.matrix);

        const ice = rand() < 0.38;
        if (ice) {
          color.setHSL(
            0.55 + rand() * 0.02,
            0.3 + rand() * 0.12,
            0.68 + rand() * 0.08,
            THREE.SRGBColorSpace
          );
        } else {
          color.setHSL(
            0.575 + rand() * 0.03,
            0.08 + rand() * 0.08,
            0.8 + rand() * 0.07,
            THREE.SRGBColorSpace
          );
        }
        tiles.setColorAt(i, color);
        i++;
      }
    }
    tiles.instanceMatrix.needsUpdate = true;
    if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
    this.scene.add(tiles);
  }

  _buildWalls() {
    const proto = createEntityMesh('wall');
    const runs = [
      { x: CENTER, z: MIN, rot: 0 },
      { x: CENTER, z: MAX, rot: 0 },
      { x: MIN, z: CENTER, rot: Math.PI / 2 },
      { x: MAX, z: CENTER, rot: Math.PI / 2 },
    ];
    for (const run of runs) {
      const wall = proto.clone();
      wall.position.set(run.x, 0, run.z);
      wall.rotation.y = run.rot;
      wall.scale.set(ROOM_SIZE, 1, 1); // stretch the 1-tile prototype into a run
      this.scene.add(wall);
    }
  }

  _buildProps() {
    for (const p of pillars) {
      const mesh = createEntityMesh('pillar');
      mesh.position.set(p.x, 0, p.z);
      mesh.rotation.y = ((p.x * 7 + p.z * 13) % 8) * (Math.PI / 4);
      this.scene.add(mesh);
    }
    for (const b of brokenWall) {
      const mesh = createEntityMesh('wall');
      mesh.position.set(b.x, 0, b.z);
      mesh.scale.set(1, 0.65, 1); // collapsed / broken height
      this.scene.add(mesh);
    }
  }

  _buildPlayer() {
    this.playerMesh = createEntityMesh('player');
    this.playerMesh.scale.setScalar(1.25); // reads more clearly at this camera distance
    this.playerMesh.position.set(SPAWN.x, 0, SPAWN.z);
    this.playerMesh.rotation.y = 0;
    this.scene.add(this.playerMesh);
  }

  _buildTileMarker() {
    // Thin glowing square on the player's current logical tile.
    const half = 0.42;
    const points = [
      new THREE.Vector3(-half, 0, -half),
      new THREE.Vector3(half, 0, -half),
      new THREE.Vector3(half, 0, half),
      new THREE.Vector3(-half, 0, half),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: 0xffd75e,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.tileMarker = new THREE.LineLoop(geo, mat);
    this.tileMarker.position.set(SPAWN.x, 0.035, SPAWN.z);
    this.scene.add(this.tileMarker);
  }

  _buildTargetRing() {
    // Red tile outline under the current target; follows the interpolated wolf.
    const geo = new THREE.RingGeometry(0.36, 0.5, 4, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff3b30,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    this.targetRing = new THREE.Mesh(geo, mat);
    this.targetRing.rotation.x = -Math.PI / 2;
    this.targetRing.rotation.z = Math.PI / 4;
    this.targetRing.position.set(SPAWN.x, 0.05, SPAWN.z);
    this.targetRing.visible = false;
    this.scene.add(this.targetRing);
  }

  _buildTargetArrow() {
    // Screen-facing red chevron above the current target. depthTest:false and
    // a high renderOrder keep it visible even when the player model hides the
    // wolf itself (the common case when the wolf is directly north).
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const drawChevron = (width, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(22, 28);
      ctx.lineTo(64, 84);
      ctx.lineTo(106, 28);
      ctx.stroke();
    };

    drawChevron(20, 'rgba(0, 0, 0, 0.9)');
    drawChevron(12, '#ff3b30');

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;

    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.targetArrow = new THREE.Sprite(mat);
    this.targetArrow.scale.set(0.78, 0.78, 1);
    this.targetArrow.renderOrder = 999;
    this.targetArrow.visible = false;
    this.scene.add(this.targetArrow);
  }

  _createSnowTexture() {
    // Soft round flake: white core fading to transparent, no external files.
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.92)');
    grad.addColorStop(0.65, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  _buildSnow() {
    this._snowRand = mulberry32(99);
    this._snowScratch = { x: 0, y: 0, z: 0 };
    this.snowTime = 0;

    const sprite = this._createSnowTexture();
    // Three size buckets give gentle per-flake variation without a custom shader.
    const layers = [
      { count: 250, size: 0.07 },
      { count: 350, size: 0.095 },
      { count: 300, size: 0.12 },
    ];

    this.snowLayers = [];
    for (const cfg of layers) {
      const positions = new Float32Array(cfg.count * 3);
      const speeds = new Float32Array(cfg.count);
      const phases = new Float32Array(cfg.count);
      const spawn = { x: 0, y: 0, z: 0 };

      for (let i = 0; i < cfg.count; i++) {
        this._spawnSnowPoint(spawn);
        const i3 = i * 3;
        positions[i3] = spawn.x;
        positions[i3 + 1] = spawn.y;
        positions[i3 + 2] = spawn.z;
        speeds[i] = 0.45 + this._snowRand() * 0.9;
        phases[i] = this._snowRand() * Math.PI * 2;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const mat = new THREE.PointsMaterial({
        map: sprite,
        color: 0xffffff,
        size: cfg.size,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        alphaTest: 0.01,
      });

      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      this.scene.add(points);

      this.snowLayers.push({
        attr: geo.attributes.position,
        positions,
        speeds,
        phases,
        count: cfg.count,
      });
    }
  }

  _spawnSnowPoint(out) {
    const cam = this.camera.position;
    for (let attempt = 0; attempt < 8; attempt++) {
      out.x = SNOW_BOUNDS.minX + this._snowRand() * SNOW_WIDTH_X;
      out.y = SNOW_BOUNDS.minY + this._snowRand() * SNOW_HEIGHT;
      out.z = SNOW_BOUNDS.minZ + this._snowRand() * SNOW_WIDTH_Z;
      const dx = out.x - cam.x;
      const dy = out.y - cam.y;
      const dz = out.z - cam.z;
      if (dx * dx + dy * dy + dz * dz > SNOW_SAFE_RADIUS_SQ) return;
    }
    // Very unlikely fallback: a spot across the room from the camera.
    out.x = CENTER - 3;
    out.y = 3.5;
    out.z = CENTER - 3;
  }

  // ---- screen-space projection helpers ----

  _projectToScreen(v) {
    const el = this.renderer.domElement;
    const w = el.clientWidth || window.innerWidth;
    const h = el.clientHeight || window.innerHeight;
    this.camera.updateMatrixWorld();
    this._tmpScreen.copy(v).project(this.camera);
    return {
      x: (this._tmpScreen.x * 0.5 + 0.5) * w,
      y: (-this._tmpScreen.y * 0.5 + 0.5) * h,
    };
  }

  tileToScreen(x, z) {
    this._tmpProj.set(x, 0, z);
    return this._projectToScreen(this._tmpProj);
  }

  meshScreen() {
    return this._projectToScreen(this.playerMesh.position);
  }

  meshWorld() {
    return {
      x: this.playerMesh.position.x,
      z: this.playerMesh.position.z,
    };
  }

  // Project a live, interpolated entity anchor for DOM overlays.
  // ref = { kind: 'player' } or { kind: 'enemy', id }
  entityScreen(ref, yOffset = 1.2) {
    let mesh = null;
    if (ref && ref.kind === 'player') mesh = this.playerMesh;
    else if (ref && ref.kind === 'enemy') {
      const rec = this.enemyMeshes.get(ref.id);
      mesh = rec ? rec.mesh : null;
    }
    if (!mesh) return null;
    this._tmpProj.set(mesh.position.x, yOffset, mesh.position.z);
    const scr = this._projectToScreen(this._tmpProj);
    if (this._tmpScreen.z > 1 || this._tmpScreen.z < -1) return null;
    return scr;
  }

  triggerPlayerAttack() {
    this.swing = PLAYER_SWING_TIME;
  }

  _syncEnemies(list) {
    const seen = new Set();
    for (const e of list) {
      seen.add(e.id);
      let rec = this.enemyMeshes.get(e.id);
      if (!rec) {
        const mesh = createEntityMesh(e.kind);
        mesh.scale.setScalar(WOLF_SCALE);
        mesh.position.set(e.x, 0, e.z);
        this.scene.add(mesh);
        const mats = [];
        mesh.traverse((o) => {
          if (o.isMesh && o.material) mats.push(o.material);
        });
        rec = { mesh, mats, baseScale: WOLF_SCALE, crouch: 1 };
        this.enemyMeshes.set(e.id, rec);
      }
      rec.enemy = e;
    }

    for (const [id, rec] of Array.from(this.enemyMeshes.entries())) {
      if (seen.has(id)) continue;
      this.scene.remove(rec.mesh);
      rec.mesh.traverse((o) => {
        if (o.isMesh) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) o.material.dispose();
        }
      });
      this.enemyMeshes.delete(id);
    }
  }

  // player: { x, z, prevX, prevZ, facing: {x,z} }
  // alpha: 0..1 progress through the current tick, straight from the ticker.
  // world: { enemies, targetId, tick } (optional combat presentation state)
  update(dt, player, alpha, world = null) {
    const clamped = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
    const t = Math.min(1, Math.max(0, alpha));

    this.animTime += clamped;

    // The player mesh is exactly the linear interpolation of the previous and
    // current logical tiles. No pre-glide, easing, return glide or catch-up.
    const x = player.prevX + (player.x - player.prevX) * t;
    const z = player.prevZ + (player.z - player.prevZ) * t;
    this.playerMesh.position.set(x, 0, z);

    // Turn toward the actual move direction; when idle keep the last facing.
    const targetYaw = Math.atan2(player.facing.x, player.facing.z);
    let delta = targetYaw - this.playerMesh.rotation.y;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.playerMesh.rotation.y += delta * (1 - Math.exp(-18 * clamped));

    // Short procedural lunge on a child group; never touches the logical tile.
    const body = this.playerMesh.userData.body;
    if (body) {
      if (this.swing > 0) {
        this.swing = Math.max(0, this.swing - clamped);
        const p = 1 - this.swing / PLAYER_SWING_TIME;
        const arc = Math.sin(Math.min(1, Math.max(0, p)) * Math.PI);
        body.position.z = arc * 0.3;
        body.position.y = arc * 0.04;
        body.rotation.x = -arc * 0.14;
        body.rotation.y = Math.sin(p * Math.PI * 2) * 0.2 * (1 - p);
      } else {
        body.position.z = 0;
        body.position.y = 0;
        body.rotation.x = 0;
        body.rotation.y = 0;
      }
    }

    // True-tile marker snaps to the logical tile; it never interpolates.
    this.tileMarker.position.set(player.x, 0.035, player.z);

    // ---- enemies ----
    const list = world && world.enemies ? world.enemies : [];
    this._syncEnemies(list);
    const tick = world && Number.isFinite(world.tick) ? world.tick : 0;

    for (const rec of this.enemyMeshes.values()) {
      const e = rec.enemy;
      if (!e) continue;
      const mesh = rec.mesh;

      const ex = e.prevX + (e.x - e.prevX) * t;
      const ez = e.prevZ + (e.z - e.prevZ) * t;
      mesh.position.set(ex, 0, ez);

      const yaw = Math.atan2(e.facing.x, e.facing.z);
      let ed = yaw - mesh.rotation.y;
      ed = Math.atan2(Math.sin(ed), Math.cos(ed));
      mesh.rotation.y += ed * (1 - Math.exp(-16 * clamped));

      const tele = !!e.telegraph && e.alive;
      const crouchTarget = tele ? 0.78 : 1;
      if (clamped > 0) {
        rec.crouch += (crouchTarget - rec.crouch) * (1 - Math.exp(-22 * clamped));
      } else {
        rec.crouch = crouchTarget;
      }

      let fade = 0;
      if (!e.alive && e.deathTick != null) {
        fade = Math.min(1, Math.max(0, tick - e.deathTick + t));
      }

      const s = rec.baseScale * (1 - 0.55 * fade);
      mesh.scale.set(s, s * rec.crouch * (1 - 0.25 * fade), s);
      mesh.visible = fade < 1;

      for (const m of rec.mats) {
        if (fade > 0) {
          m.transparent = true;
          m.opacity = 1 - fade;
        } else if (m.opacity !== 1) {
          m.opacity = 1;
          m.transparent = false;
        }
        if (m.emissive) {
          if (tele) {
            m.emissive.setHex(0x3fa9ff);
            m.emissiveIntensity = 0.55 + 0.45 * Math.sin(this.animTime * 16);
          } else {
            m.emissiveIntensity = 0;
          }
        }
      }
    }

    // ---- target marker ----
    const targetId = world ? world.targetId : null;
    const targetRec = targetId != null ? this.enemyMeshes.get(targetId) : null;
    if (targetRec && targetRec.enemy && targetRec.enemy.alive) {
      this.targetRing.visible = true;
      this.targetRing.position.set(targetRec.mesh.position.x, 0.05, targetRec.mesh.position.z);
      const pulse = 1 + Math.sin(this.animTime * 5) * 0.06;
      this.targetRing.scale.setScalar(pulse);

      this.targetArrow.visible = true;
      const bob = Math.sin(this.animTime * 3.8) * 0.09;
      this.targetArrow.position.set(
        targetRec.mesh.position.x,
        2.35 + bob,
        targetRec.mesh.position.z
      );
    } else {
      this.targetRing.visible = false;
      this.targetArrow.visible = false;
    }

    // Camera glides toward the rendered player position.
    this.follow.lerp(this._tmpA.set(x, 0, z), 1 - Math.exp(-14 * clamped));
    this._tmpB.copy(this.follow).add(this.camOffset);
    this.camPos.lerp(this._tmpB, 1 - Math.exp(-6 * clamped));
    this.camera.position.copy(this.camPos);
    this.camLook.set(this.follow.x, 0.9, this.follow.z);
    this.camera.lookAt(this.camLook);

    // Drifting, swaying snow. Recycle anything that comes too close to the camera.
    this.snowTime += clamped;
    const camX = this.camera.position.x;
    const camY = this.camera.position.y;
    const camZ = this.camera.position.z;
    const out = this._snowScratch;

    for (const layer of this.snowLayers) {
      const p = layer.positions;
      for (let i = 0; i < layer.count; i++) {
        const i3 = i * 3;
        const phase = layer.phases[i];
        let sx = p[i3] + Math.sin(this.snowTime * 0.8 + phase) * 0.16 * clamped;
        let sy = p[i3 + 1] - layer.speeds[i] * clamped;
        let sz = p[i3 + 2] + Math.cos(this.snowTime * 0.65 + phase * 1.7) * 0.11 * clamped;

        if (sy < SNOW_BOUNDS.minY) sy += SNOW_HEIGHT;
        if (sx < SNOW_BOUNDS.minX) sx += SNOW_WIDTH_X;
        else if (sx > SNOW_BOUNDS.maxX) sx -= SNOW_WIDTH_X;
        if (sz < SNOW_BOUNDS.minZ) sz += SNOW_WIDTH_Z;
        else if (sz > SNOW_BOUNDS.maxZ) sz -= SNOW_WIDTH_Z;

        const dx = sx - camX;
        const dy = sy - camY;
        const dz = sz - camZ;
        if (dx * dx + dy * dy + dz * dz < SNOW_SAFE_RADIUS_SQ) {
          this._spawnSnowPoint(out);
          sx = out.x;
          sy = out.y;
          sz = out.z;
        }

        p[i3] = sx;
        p[i3 + 1] = sy;
        p[i3 + 2] = sz;
      }
      layer.attr.needsUpdate = true;
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
=== END FILE ===