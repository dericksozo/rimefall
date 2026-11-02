// Rimefall — Milestone 2.1: OSRS-style faceted melee combat.
//
// TICK ORDER (every game tick, deterministic for a given RNG seed):
//   1) Player input: successful EAT, else ATTACK, else MOVE.
//      - Eat consumes the tick and delays the next attack.
//      - Attack is edge-triggered and resolves against the facing tile.
//      - Move may slide exactly as in movement milestone 1.2.
//   2) NPCs act in spawn order (ice wolves, rule 8 naive OSRS movement).
//   3) Resolve deaths and room state (death banners, clear detection).
//
// Movement feel is intentionally unchanged from 1.2: tick.js, camera,
// stick/keyboard direction mapping, hysteresis, one-tile linear interpolation,
// and wall/pillar corner sliding are untouched.

import { Input } from './input.js';
import { Ticker } from './tick.js';
import { Render } from './render.js';
import { SPAWN, blockers, isWalkable } from './world.js';
import { RNG } from './rng.js';
import { Fx } from './fx.js';
import { Enemies, ENEMY_DEFS } from './enemies.js';
import { Room } from './room.js';
import {
  WEAPONS,
  PLAYER_STATS,
  rollHit,
  rollDamage,
  isCardinalAdjacent,
} from './combat.js';

const hud = {
  tick: document.getElementById('hud-tick'),
  tile: document.getElementById('hud-tile'),
  input: document.getElementById('hud-input'),
  hp: document.getElementById('hud-hp'),
  hpFill: document.getElementById('hud-hp-fill'),
  food: document.getElementById('hud-food'),
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
    hit: entry.hit === undefined ? false : !!entry.hit,
    whiff: entry.whiff === undefined ? false : !!entry.whiff,
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

// ---- combat definition tuning ----

let pendingTune = null;

function queueTune(overrides) {
  if (!overrides || typeof overrides !== 'object') return false;
  for (const key of ['wolf', 'player', 'sword']) {
    const part = overrides[key];
    if (!part || typeof part !== 'object') continue;
    if (!pendingTune) pendingTune = {};
    pendingTune[key] = Object.assign({}, pendingTune[key] || {}, part);
  }
  return true;
}

function applyPendingTune() {
  if (!pendingTune) {
    player.weapon = WEAPONS.sword;
    return;
  }

  if (pendingTune.wolf) {
    Object.assign(ENEMY_DEFS.ice_wolf, pendingTune.wolf);
  }

  if (pendingTune.player) {
    const p = pendingTune.player;
    if (Object.prototype.hasOwnProperty.call(p, 'maxHp')) {
      PLAYER_STATS.maxHp = p.maxHp;
      player.maxHp = p.maxHp;
    }
    if (Object.prototype.hasOwnProperty.call(p, 'defence')) {
      PLAYER_STATS.defence = p.defence;
      player.defence = p.defence;
    }
  }

  if (pendingTune.sword) {
    Object.assign(WEAPONS.sword, pendingTune.sword);
  }

  pendingTune = null;
  player.weapon = WEAPONS.sword;
}

// ---- facing / target-tile helpers ----

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

function facingTile() {
  return {
    x: player.x + player.facing.x,
    z: player.z + player.facing.z,
  };
}

function enemyAt(x, z) {
  for (const e of enemies.list) {
    if (e.alive && e.x === x && e.z === z) return e;
  }
  return null;
}

// ---- player movement (unchanged 1.2 slide rules; enemies are extra walls) ----

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

// ---- debug state ----

let debugManual = false;
let debugMove = null;
let fatalWolfId = null;
let fatalDmg = 0;

// ---- player actions ----

function tryEat(tick) {
  if (player.food <= 0) {
    showToast('No food left', 1400);
    return false;
  }
  if (player.hp >= player.maxHp) {
    showToast('Already at full health', 1400);
    return false;
  }

  const heal = Math.min(PLAYER_STATS.foodHeal, player.maxHp - player.hp);
  player.food -= 1;
  player.hp += heal;
  player.nextAttackTick = Math.max(player.nextAttackTick, tick + 3);

  fx.splat({ kind: 'player' }, 'heal', `+${heal}`, tick);
  logEvent({
    tick,
    type: 'eat',
    src: 'player',
    dst: 'player',
    hit: false,
    whiff: false,
    dmg: heal,
    x: player.x,
    z: player.z,
  });
  return true;
}

function doPlayerAttack(tick) {
  const ft = facingTile();

  if (tick < player.nextAttackTick) {
    logEvent({
      tick,
      type: 'attack_discarded',
      src: 'player',
      dst: null,
      hit: false,
      whiff: true,
      dmg: 0,
      x: ft.x,
      z: ft.z,
    });
    return false;
  }

  const weapon = player.weapon;
  player.nextAttackTick = tick + weapon.attackSpeedTicks;

  const cardinal = isCardinalAdjacent(player.x, player.z, ft.x, ft.z);
  const target = cardinal ? enemyAt(ft.x, ft.z) : null;

  if (!target) {
    // Diagonal swings, empty tiles and cardinal swings with no enemy are
    // deliberate whiffs. They consume the cooldown but show no hitsplat.
    render.triggerPlayerAttack(true, {
      x: player.x,
      z: player.z,
      facing: { x: player.facing.x, z: player.facing.z },
    });
    logEvent({
      tick,
      type: 'player_attack',
      src: 'player',
      dst: null,
      hit: false,
      whiff: true,
      dmg: 0,
      x: ft.x,
      z: ft.z,
    });
    return true;
  }

  render.triggerPlayerAttack(false);

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
    whiff: false,
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
      whiff: false,
      dmg: 0,
      x: target.x,
      z: target.z,
    });
  }

  return true;
}

function handleEnemyBite(tick, wolf, hit, dmg, whiff) {
  const missedDueToRange = !!whiff;

  if (!missedDueToRange) {
    if (hit) {
      player.hp = Math.max(0, player.hp - dmg);
      player.damageTick = tick;
      if (player.hp <= 0) {
        fatalWolfId = wolf.id;
        fatalDmg = dmg;
      }
    }
    fx.splat({ kind: 'player' }, hit ? 'hit' : 'miss', String(dmg), tick);
  }

  render.triggerEnemyAttack(wolf.id, missedDueToRange);

  logEvent({
    tick,
    type: 'enemy_attack',
    src: wolf.id,
    dst: 'player',
    hit: missedDueToRange ? false : hit,
    whiff: missedDueToRange,
    dmg: missedDueToRange ? 0 : dmg,
    x: player.x,
    z: player.z,
  });
}

function restartRoom(seed) {
  applyPendingTune();
  room.restart(ticker.tick, seed);
  player.defence = PLAYER_STATS.defence;
  player.weapon = WEAPONS.sword;
  lastMoveDir = null;
  fatalWolfId = null;
  fatalDmg = 0;
}

function setupScenario(config) {
  applyPendingTune();
  player.defence = PLAYER_STATS.defence;
  player.weapon = WEAPONS.sword;

  room.setup(ticker.tick, config || {});
  combatLog.length = 0;
  lastMoveDir = null;
  fatalWolfId = null;
  fatalDmg = 0;
  debugMove = null;

  render.update(0, player, 1, worldView());
}

// ---- the one game tick ----

function gameTick(tick) {
  const fromX = player.x;
  const fromZ = player.z;
  player.prevX = fromX;
  player.prevZ = fromZ;
  player.moved = false;
  lastMoveDir = null;

  fatalWolfId = null;
  fatalDmg = 0;

  enemies.beginTick(tick);

  const actions = input.consumeActions();
  const busy = room.state === 'cleared' || room.state === 'dead';

  if (busy) {
    if (actions.includes('attack')) {
      restartRoom();
    }
    lastMoveDir = null;
    room.tick(tick);
    moveLog.push({ tick, fromX, fromZ, toX: player.x, toZ: player.z });
    if (moveLog.length > MAX_MOVE_LOG) moveLog.splice(0, moveLog.length - MAX_MOVE_LOG);
    return;
  }

  // 1) Player action priority: eat -> attack -> move.
  let tickConsumed = false;

  if (actions.includes('eat')) {
    tickConsumed = tryEat(tick);
  }

  if (!tickConsumed && actions.includes('attack')) {
    tickConsumed = doPlayerAttack(tick);
  }

  if (!tickConsumed) {
    const intent = debugMove !== null ? debugMove : input.getMoveIntent();
    if (intent && intent.dir) {
      const dx = intent.dir.x;
      const dz = intent.dir.z;
      const inputFacing = { x: dx, z: dz };
      const nx = player.x + dx;
      const nz = player.z + dz;

      // A tile occupied by an enemy is a facing-only move: no slide at all.
      let actual = null;
      if (!enemies.isOccupied(nx, nz)) {
        actual = tryMove(dx, dz, intent.preferX);
      }

      if (actual) {
        player.facing = { x: actual.x, z: actual.z };
        player.moved = true;
        lastMoveDir = { x: actual.x, z: actual.z };
      } else {
        // Walls, pillars, occupied tiles and failed slides still turn the
        // player toward the requested input direction.
        player.facing = inputFacing;
      }
    }
  }

  // 2) NPC phase: fixed spawn order, one wolf action each.
  if (room.state === 'fighting') {
    enemies.tick(tick, player, {
      isPlayerAlive: () => player.hp > 0,
      onBite: (wolf, hit, dmg, whiff) => handleEnemyBite(tick, wolf, hit, dmg, whiff),
    });

    if (player.hp <= 0) {
      room.playerDied(tick, fatalWolfId, fatalDmg);
    }
  }

  // 3) Room flow / clear detection happens after all NPC actions.
  room.tick(tick);

  moveLog.push({ tick, fromX, fromZ, toX: player.x, toZ: player.z });
  if (moveLog.length > MAX_MOVE_LOG) moveLog.splice(0, moveLog.length - MAX_MOVE_LOG);
}

ticker.subscribe((tick) => gameTick(tick));

function worldView() {
  return { enemies: enemies.list, tick: ticker.tick };
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
        ? '<b>Left stick</b> move · <b>✕</b> attack · <b>□</b> eat · <b>Options</b> pause'
        : '<b>Left stick</b> move · <b>A</b> attack · <b>X</b> eat · <b>Start</b> pause';
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

  get hp() {
    return player.hp;
  },
  get maxHp() {
    return player.maxHp;
  },
  get food() {
    return player.food;
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
      waitUntilTick: e.waitUntilTick,
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
      if (action !== 'attack' && action !== 'eat') return false;
      input.queueAction(action);
      return true;
    },
    restart(seed) {
      restartRoom(seed);
      render.update(0, player, 1, worldView());
    },
    setup(config) {
      setupScenario(config);
    },
    tune(overrides) {
      return queueTune(overrides);
    },
  },
};

// ---- HUD ----

const hudState = { tick: -1, tile: '', input: '', hp: '', food: '' };
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
