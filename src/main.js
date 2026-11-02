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
