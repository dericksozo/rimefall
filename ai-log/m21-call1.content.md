=== FILE: index.html ===
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Rimefall — Milestone 2.1</title>
  <link rel="stylesheet" href="./style.css" />
  <script type="importmap">
    {
      "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
      }
    }
  </script>
</head>
<body>
  <div id="app"></div>

  <div id="hud">
    <div class="title">RIMEFALL</div>
    <div class="row"><span class="k">HP</span><span class="v" id="hud-hp">40/40</span></div>
    <div class="meter"><div id="hud-hp-fill"></div></div>
    <div class="row"><span class="k">Food</span><span class="v" id="hud-food">4</span></div>
    <div class="row"><span class="k">Tick</span><span class="v" id="hud-tick">0</span></div>
    <div class="row"><span class="k">Tile</span><span class="v" id="hud-tile">(7, 7)</span></div>
    <div class="row"><span class="k">Input</span><span class="v" id="hud-input">keyboard</span></div>
  </div>

  <div id="hint">
    <b>WASD</b> move · <b>Space</b> attack (facing tile) · <b>E</b> eat · <b>Esc</b> pause<br />
    <span>Gamepad: <b>Left stick</b> move · <b>✕/A</b> attack · <b>□/X</b> eat · <b>Options/Start</b> pause</span>
  </div>

  <div id="overlay"></div>
  <div id="banner"><div class="main"></div><div class="sub"></div></div>

  <div id="toast"></div>
  <div id="pause-overlay"><div class="box">PAUSED</div></div>

  <script type="module" src="./src/main.js"></script>
</body>
</html>
=== END FILE ===
=== FILE: src/main.js ===
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
=== END FILE ===
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
    maxHit: 4,
    accuracy: 12,
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
=== FILE: src/input.js ===
// Unified keyboard + standard-gamepad input.
// Movement maps directly to grid directions because the camera faces north.
// Stick processing runs every frame with persistent hysteresis state.

const KEY_DIR = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

const KEY_ACTION = {
  Space: 'attack',
  KeyE: 'eat',
  Digit1: 'swap1', Digit2: 'swap2', Digit3: 'swap3',
  Numpad1: 'swap1', Numpad2: 'swap2', Numpad3: 'swap3',
};

// Standard mapping buttons. D-pad is action-only; it never moves the player.
// 0 ✕/A attack · 2 □/X eat
const PAD_ACTION = {
  0: 'attack',
  2: 'eat',
  14: 'swap1', 12: 'swap2', 15: 'swap3',
};
const PAD_PAUSE_BUTTON = 9;

export const STICK_DEADZONE = 0.35;
export const STICK_RELEASE_DEADZONE = 0.25;

const STICK_ACTIVITY_DELTA = 0.08;
const TAU = Math.PI * 2;
const CARDINAL_HALF_WIDTH = (Math.PI * 35) / 180; // 70-degree cardinals
const DIAGONAL_HALF_WIDTH = Math.PI / 18;         // diagonals only within 10 degrees
const DIRECTION_HYSTERESIS = Math.PI / 15;        // 12 degrees past a boundary

const DIRECTIONS = [
  { x: 0, z: -1, angle: 0, halfAngle: CARDINAL_HALF_WIDTH, diagonal: false },
  { x: 1, z: -1, angle: Math.PI / 4, halfAngle: DIAGONAL_HALF_WIDTH, diagonal: true },
  { x: 1, z: 0, angle: Math.PI / 2, halfAngle: CARDINAL_HALF_WIDTH, diagonal: false },
  { x: 1, z: 1, angle: (3 * Math.PI) / 4, halfAngle: DIAGONAL_HALF_WIDTH, diagonal: true },
  { x: 0, z: 1, angle: Math.PI, halfAngle: CARDINAL_HALF_WIDTH, diagonal: false },
  { x: -1, z: 1, angle: (5 * Math.PI) / 4, halfAngle: DIAGONAL_HALF_WIDTH, diagonal: true },
  { x: -1, z: 0, angle: (3 * Math.PI) / 2, halfAngle: CARDINAL_HALF_WIDTH, diagonal: false },
  { x: -1, z: -1, angle: (7 * Math.PI) / 4, halfAngle: DIAGONAL_HALF_WIDTH, diagonal: true },
];

function normalizeAngle(a) {
  a %= TAU;
  return a < 0 ? a + TAU : a;
}

function angleDistance(a, b) {
  const d = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(d, TAU - d);
}

function signedAngleDifference(a, b) {
  let d = normalizeAngle(a) - normalizeAngle(b);
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

function directionInfo(x, z) {
  for (const dir of DIRECTIONS) {
    if (dir.x === x && dir.z === z) return dir;
  }
  return null;
}

/**
 * Pure angle -> grid-direction snapping.
 * 0 = north/up, PI/2 = east/right, PI = south/down, 3PI/2 = west/left.
 * Cardials own 70-degree sectors; diagonals exist only within 10 degrees of
 * 45/135/225/315.
 */
export function pickGridDir(angle) {
  if (typeof angle !== 'number' || !Number.isFinite(angle)) return null;

  const a = normalizeAngle(angle);
  let bestDiagonal = null;
  let bestDiagonalDist = Infinity;
  let bestCardinal = null;
  let bestCardinalDist = Infinity;

  for (const dir of DIRECTIONS) {
    const dist = angleDistance(a, dir.angle);
    if (dir.diagonal) {
      if (dist < bestDiagonalDist) {
        bestDiagonalDist = dist;
        bestDiagonal = dir;
      }
    } else if (dist < bestCardinalDist) {
      bestCardinalDist = dist;
      bestCardinal = dir;
    }
  }

  const chosen =
    bestDiagonal && bestDiagonalDist <= DIAGONAL_HALF_WIDTH + 1e-9
      ? bestDiagonal
      : bestCardinal;

  return chosen ? { x: chosen.x, z: chosen.z } : null;
}

export class Input {
  constructor(hooks = {}) {
    this.onPause = hooks.onPause || (() => {});
    this.onToast = hooks.onToast || (() => {});

    this.device = 'keyboard';
    this.keys = new Set();
    this.actions = [];

    this.padAxes = { x: 0, y: 0 };
    this.padButtonState = new Map();
    this.connectedIds = new Set();
    this.notifiedIds = new Set();

    this.stickHeld = null;    // persistent snapped stick direction
    this.heldDir = null;      // final current direction for this frame
    this.currentIntent = null;

    this._padStickActive = false;
    this._activePadId = null;

    this._bindKeyboard();

    const poll = () => this.pollGamepads();
    window.addEventListener('gamepadconnected', poll);
    window.addEventListener('gamepaddisconnected', poll);
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        if (!e.repeat) {
          this.device = 'keyboard';
          this.onPause();
        }
        return;
      }

      if (KEY_DIR[e.code]) {
        e.preventDefault();
        if (!e.repeat) this.device = 'keyboard';
        this.keys.add(e.code);
        return;
      }

      const action = KEY_ACTION[e.code];
      if (action) {
        e.preventDefault();
        if (!e.repeat) {
          this.device = 'keyboard';
          this.actions.push(action);
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (KEY_DIR[e.code]) this.keys.delete(e.code);
    });

    // Avoid "stuck" keys when the window loses focus.
    window.addEventListener('blur', () => this.keys.clear());
  }

  keyboardDir() {
    let x = 0;
    let z = 0;
    for (const code of this.keys) {
      const d = KEY_DIR[code];
      if (!d) continue;
      x += d[0];
      z += d[1];
    }
    x = Math.sign(x);
    z = Math.sign(z);
    if (!x && !z) return null;
    return { x, z };
  }

  // Persistent stick snapping + deadzone/hysteresis, evaluated every frame.
  _updateStickHeld() {
    const ax = Number.isFinite(this.padAxes.x) ? this.padAxes.x : 0;
    const ay = Number.isFinite(this.padAxes.y) ? this.padAxes.y : 0;
    const magnitude = Math.hypot(ax, ay);

    if (this.stickHeld) {
      if (magnitude < STICK_RELEASE_DEADZONE) {
        this.stickHeld = null;
        return;
      }

      const angle = Math.atan2(ax, -ay);
      const delta = signedAngleDifference(angle, this.stickHeld.angle);

      // Keep the held direction until the angle passes more than 12 degrees
      // beyond its sector boundary, then snap to the sector it is in.
      if (Math.abs(delta) > this.stickHeld.halfAngle + DIRECTION_HYSTERESIS + 1e-9) {
        const next = pickGridDir(angle);
        if (next) {
          const info = directionInfo(next.x, next.z);
          if (info) this.stickHeld = info;
        }
      }
      return;
    }

    if (magnitude >= STICK_DEADZONE) {
      const angle = Math.atan2(ax, -ay);
      const next = pickGridDir(angle);
      if (next) this.stickHeld = directionInfo(next.x, next.z);
    }
  }

  // Called once per rendered frame, after pollGamepads and before ticker.update.
  updateMovement() {
    this._updateStickHeld();

    const kb = this.keyboardDir();
    const padDevice = this.device.startsWith('gamepad');
    let dir = null;
    let source = null;

    if (padDevice) {
      if (this.stickHeld) {
        dir = this.stickHeld;
        source = 'stick';
      } else if (kb) {
        dir = kb;
        source = 'keyboard';
      }
    } else {
      if (kb) {
        dir = kb;
        source = 'keyboard';
      } else if (this.stickHeld) {
        dir = this.stickHeld;
        source = 'stick';
      }
    }

    let preferX = true;
    if (dir && source === 'stick' && dir.x !== 0 && dir.z !== 0) {
      preferX = Math.abs(this.padAxes.x) >= Math.abs(this.padAxes.y);
    }

    this.heldDir = dir ? { x: dir.x, z: dir.z } : null;
    this.currentIntent = dir
      ? {
          dir: { x: dir.x, z: dir.z },
          preferX,
          source,
        }
      : null;
  }

  getDirection() {
    return this.heldDir ? { x: this.heldDir.x, z: this.heldDir.z } : null;
  }

  getMoveIntent() {
    return this.currentIntent;
  }

  consumeActions() {
    const queued = this.actions;
    this.actions = [];
    return queued;
  }

  // Used by the automated test hooks: identical to a real button press.
  queueAction(action) {
    if (action) this.actions.push(action);
  }

  pollGamepads() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) {
      this.padAxes = { x: 0, y: 0 };
      this._padStickActive = false;
      this._activePadId = null;
      return;
    }

    const pads = navigator.getGamepads();
    if (!pads) {
      this.padAxes = { x: 0, y: 0 };
      this._padStickActive = false;
      this._activePadId = null;
      return;
    }

    const seen = new Set();
    const candidates = [];

    for (let i = 0; i < pads.length; i++) {
      const gp = pads[i];
      if (!gp || !gp.connected) {
        this.padButtonState.delete(i);
        continue;
      }

      seen.add(gp.id);

      if (!this.connectedIds.has(gp.id)) {
        this.connectedIds.add(gp.id);
        if (!this.notifiedIds.has(gp.id)) {
          this.notifiedIds.add(gp.id);
          this.onToast(`🎮 Controller connected: ${gp.id}`);
        }
      }

      const buttons = gp.buttons || [];
      let prev = this.padButtonState.get(i);
      if (!prev || prev.length !== buttons.length) {
        prev = new Array(buttons.length).fill(false);
        this.padButtonState.set(i, prev);
      }

      // Face buttons and D-pad. D-pad queues swaps only; it never moves.
      for (const key of Object.keys(PAD_ACTION)) {
        const idx = Number(key);
        const btn = buttons[idx];
        const pressed = !!(btn && btn.pressed);
        if (pressed && !prev[idx]) {
          this.device = `gamepad: ${gp.id}`;
          this.actions.push(PAD_ACTION[idx]);
        }
        prev[idx] = pressed;
      }

      const pauseBtn = buttons[PAD_PAUSE_BUTTON];
      const pausePressed = !!(pauseBtn && pauseBtn.pressed);
      if (pausePressed && !prev[PAD_PAUSE_BUTTON]) {
        this.device = `gamepad: ${gp.id}`;
        this.onPause();
      }
      prev[PAD_PAUSE_BUTTON] = pausePressed;

      const axes = gp.axes || [];
      const ax = axes.length > 0 ? (axes[0] || 0) : 0;
      const ay = axes.length > 1 ? (axes[1] || 0) : 0;
      candidates.push({
        id: gp.id,
        ax,
        ay,
        magnitude: Math.hypot(ax, ay),
      });
    }

    const previousAx = this.padAxes.x;
    const previousAy = this.padAxes.y;
    const activeThreshold = this.stickHeld
      ? STICK_RELEASE_DEADZONE
      : STICK_DEADZONE;

    let chosen = null;
    if (this._activePadId !== null) {
      const active = candidates.find((c) => c.id === this._activePadId);
      if (active && active.magnitude >= activeThreshold) chosen = active;
    }

    if (!chosen) {
      let best = null;
      for (const c of candidates) {
        if (c.magnitude < STICK_DEADZONE) continue;
        if (!best || c.magnitude > best.magnitude) best = c;
      }
      chosen = best;
    }

    if (chosen) {
      this.padAxes = { x: chosen.ax, y: chosen.ay };

      const changedPad = this._activePadId !== chosen.id;
      this._activePadId = chosen.id;

      const threshold = this.stickHeld
        ? STICK_RELEASE_DEADZONE
        : STICK_DEADZONE;
      const active = chosen.magnitude >= threshold;
      const delta = Math.hypot(chosen.ax - previousAx, chosen.ay - previousAy);

      // Only actual new stick activity steals the input device. Holding a
      // steady stick does not override a more recent keyboard press.
      if (active && (!this._padStickActive || changedPad || delta > STICK_ACTIVITY_DELTA)) {
        this.device = `gamepad: ${chosen.id}`;
      }
      this._padStickActive = active;
    } else {
      this.padAxes = { x: 0, y: 0 };
      this._padStickActive = false;
      this._activePadId = null;
    }

    for (const id of Array.from(this.connectedIds)) {
      if (!seen.has(id)) {
        this.connectedIds.delete(id);
        this.onToast('Controller disconnected');
        if (this.device === `gamepad: ${id}`) this.device = 'keyboard';
        if (this._activePadId === id) {
          this._padStickActive = false;
          this._activePadId = null;
          this.padAxes = { x: 0, y: 0 };
        }
      }
    }
  }
}
=== END FILE ===
=== FILE: src/room.js ===
// Room flow: countdown, wolf spawns, cleared state, death, restart and crafted
// test scenarios. Combat cadence itself lives in enemies.js.

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

  // Crafted-scenario reset: no countdown, no spawn logs, exact placements.
  setup(tick, config = {}) {
    const { enemies, player, fx } = this.ctx;
    const cfg = config && typeof config === 'object' ? config : {};
    const pc = cfg.player && typeof cfg.player === 'object' ? cfg.player : {};

    const px = Number.isFinite(Number(pc.x)) ? Number(pc.x) : SPAWN.x;
    const pz = Number.isFinite(Number(pc.z)) ? Number(pc.z) : SPAWN.z;
    let facing = { x: 0, z: 1 };
    if (
      pc.facing &&
      Number.isFinite(Number(pc.facing.x)) &&
      Number.isFinite(Number(pc.facing.z))
    ) {
      facing = { x: Number(pc.facing.x), z: Number(pc.facing.z) };
    }

    player.x = px;
    player.z = pz;
    player.prevX = px;
    player.prevZ = pz;
    player.facing = facing;
    player.moved = false;
    player.nextAttackTick = 0;
    player.damageTick = -9999;

    const hpValue = Number(cfg.hp);
    player.hp = Number.isFinite(hpValue)
      ? Math.max(0, Math.min(player.maxHp, hpValue))
      : player.maxHp;

    const foodValue = Number(cfg.food);
    player.food = Number.isFinite(foodValue)
      ? Math.max(0, Math.floor(foodValue))
      : player.maxFood;

    enemies.clear();

    const wolfList = Array.isArray(cfg.wolves) ? cfg.wolves : [];
    for (const w of wolfList) {
      const wx = w && Number.isFinite(Number(w.x)) ? Number(w.x) : player.x;
      const wz = w && Number.isFinite(Number(w.z)) ? Number(w.z) : player.z;
      const enemy = enemies.spawn('ice_wolf', wx, wz, tick);
      enemy.nextAttackTick = 0;
      enemy.waitUntilTick = 0;
      enemy.telegraph = false;
      enemy.damageTick = -9999;
      if (wx !== player.x || wz !== player.z) {
        enemy.facing = {
          x: Math.sign(player.x - wx),
          z: Math.sign(player.z - wz),
        };
      }
    }

    fx.clearTransient();

    this.state = 'fighting';
    this.countdownLeft = 0;
    this.startedAtTick = tick;
    this.spawned = true;
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
const PLAYER_WHIFF_TIME = 0.2;
const WHOOSH_FX_TIME = 0.22;
const ENEMY_BITE_TIME = 0.24;
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
    this.whiffSwing = 0;
    this.whooshTime = 0;

    this._buildLights();
    this._buildFloor();
    this._buildWalls();
    this._buildProps();
    this._buildPlayer();
    this._buildTileMarker();
    this._buildFacingIndicator();
    this._buildWhoosh();
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

  _buildFacingIndicator() {
    // Faint pale-yellow wedge on the logical facing tile. Snaps with the tile
    // and facing, never with the interpolated mesh.
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          0, 0, 0.28,
          0.2, 0, -0.12,
          0, 0, -0.02,
          0, 0, 0.28,
          0, 0, -0.02,
          -0.2, 0, -0.12,
        ],
        3
      )
    );
    geo.computeVertexNormals();

    const mat = new THREE.MeshBasicMaterial({
      color: 0xfff1a8,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });

    this.facingIndicator = new THREE.Mesh(geo, mat);
    this.facingIndicator.position.set(SPAWN.x, 0.044, SPAWN.z + 1);
    this.facingIndicator.renderOrder = 2;
    this.scene.add(this.facingIndicator);
  }

  _buildWhoosh() {
    const geo = new THREE.RingGeometry(0.16, 0.37, 20, 1, 0, Math.PI * 1.35);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });

    this.whoosh = new THREE.Mesh(geo, mat);
    this.whoosh.rotation.x = -Math.PI / 2;
    this.whoosh.position.set(SPAWN.x, 0.055, SPAWN.z + 1);
    this.whoosh.renderOrder = 3;
    this.whoosh.visible = false;
    this.scene.add(this.whoosh);
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

  triggerPlayerAttack(whiff = false, playerState = null) {
    if (whiff) {
      this.swing = 0;
      this.whiffSwing = PLAYER_WHIFF_TIME;

      const facing =
        playerState && playerState.facing ? playerState.facing : { x: 0, z: 1 };
      const px =
        playerState && Number.isFinite(playerState.x)
          ? playerState.x
          : this.playerMesh.position.x;
      const pz =
        playerState && Number.isFinite(playerState.z)
          ? playerState.z
          : this.playerMesh.position.z;

      this.whoosh.position.set(px + facing.x, 0.055, pz + facing.z);
      this.whoosh.rotation.z = -Math.atan2(facing.x, facing.z);
      this.whoosh.scale.setScalar(0.82);
      this.whoosh.material.opacity = 0.8;
      this.whoosh.visible = true;
      this.whooshTime = WHOOSH_FX_TIME;
    } else {
      this.whiffSwing = 0;
      this.swing = PLAYER_SWING_TIME;
      this.whooshTime = 0;
      this.whoosh.visible = false;
    }
  }

  triggerEnemyAttack(id, whiff = false) {
    const rec = this.enemyMeshes.get(id);
    if (!rec) return;
    rec.attackTimer = ENEMY_BITE_TIME;
    rec.attackWhiff = !!whiff;
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
        rec = {
          mesh,
          mats,
          baseScale: WOLF_SCALE,
          crouch: 1,
          attackTimer: 0,
          attackWhiff: false,
        };
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
  // world: { enemies, tick } (optional combat presentation state)
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
    // Whiffs use a faster, much wider sweep so they read differently from hits.
    const body = this.playerMesh.userData.body;
    if (body) {
      if (this.whiffSwing > 0) {
        this.whiffSwing = Math.max(0, this.whiffSwing - clamped);
        const p = 1 - this.whiffSwing / PLAYER_WHIFF_TIME;
        const arc = Math.sin(Math.min(1, Math.max(0, p)) * Math.PI);
        body.position.z = arc * 0.1;
        body.position.y = arc * 0.03;
        body.rotation.x = -arc * 0.08;
        body.rotation.y = -arc * 1.15;
      } else if (this.swing > 0) {
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

    // Whiff-only white arc on the facing tile.
    if (this.whooshTime > 0) {
      this.whooshTime = Math.max(0, this.whooshTime - clamped);
      const p = 1 - this.whooshTime / WHOOSH_FX_TIME;
      this.whoosh.material.opacity = 0.8 * (1 - p);
      this.whoosh.scale.setScalar(0.82 + 0.55 * p);
      this.whoosh.visible = this.whooshTime > 0;
    } else {
      this.whoosh.visible = false;
    }

    // True-tile marker snaps to the logical tile; it never interpolates.
    this.tileMarker.position.set(player.x, 0.035, player.z);

    // Facing wedge snaps to the logical facing tile.
    const facing = player.facing || { x: 0, z: 1 };
    this.facingIndicator.position.set(
      player.x + facing.x,
      0.044,
      player.z + facing.z
    );
    this.facingIndicator.rotation.y = Math.atan2(facing.x, facing.z);
    this.facingIndicator.visible = facing.x !== 0 || facing.z !== 0;

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

      // Bite lunge is visual only and is added after interpolation.
      if (rec.attackTimer > 0) {
        const p = Math.min(
          1,
          Math.max(0, 1 - rec.attackTimer / ENEMY_BITE_TIME)
        );
        const lunge =
          Math.sin(p * Math.PI) * (rec.attackWhiff ? 0.14 : 0.3);
        mesh.position.x += e.facing.x * lunge;
        mesh.position.z += e.facing.z * lunge;
        rec.attackTimer = Math.max(0, rec.attackTimer - clamped);
      }

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

Notes:
- Movement remains the 1.2 path: ticker, camera, stick snapping/hysteresis, tile lerp and wall/pillar slides are unchanged.
- Wolves now use one-step naive diagonal→x→z movement with current-position occupancy, never BFS.
- Attacks are facing-tile only, edge-triggered, cooldown-consuming; eat has priority in the same tick.
- Test hooks add setup/tune and expose wolf waitUntilTick; target-related hooks and controls are removed.