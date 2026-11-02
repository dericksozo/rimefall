// Rimefall milestone 1.2: north-facing camera and OSRS-style mechanical movement.

import { Input } from './input.js';
import { Ticker } from './tick.js';
import { Render } from './render.js';
import { SPAWN, blockers, isWalkable } from './world.js';

const hud = {
  tick: document.getElementById('hud-tick'),
  tile: document.getElementById('hud-tile'),
  input: document.getElementById('hud-input'),
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

const ticker = new Ticker();
const render = new Render(document.getElementById('app'));

const player = {
  x: SPAWN.x,
  z: SPAWN.z,
  prevX: SPAWN.x,
  prevZ: SPAWN.z,
  facing: { x: 0, z: 1 }, // facing south (+z) at spawn
  moved: false,
};

const input = new Input({ onPause: togglePause, onToast: showToast });

function togglePause() {
  ticker.setPaused(!ticker.paused);
  hud.pause.classList.toggle('visible', ticker.paused);
}

// A single logical step. Diagonals cannot cut through a blocked corner.
function step(dx, dz) {
  const nx = player.x + dx;
  const nz = player.z + dz;
  if (!isWalkable(nx, nz)) return false;
  if (dx !== 0 && dz !== 0) {
    if (!isWalkable(player.x + dx, player.z)) return false;
    if (!isWalkable(player.x, player.z + dz)) return false;
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

ticker.subscribe((tick) => {
  const fromX = player.x;
  const fromZ = player.z;
  player.prevX = fromX;
  player.prevZ = fromZ;
  player.moved = false;

  for (const action of input.consumeActions()) {
    // Combat / gear / food arrive in later milestones.
    console.log(`[rimefall] action buffered: ${action} (milestone 1.2 has no combat)`);
  }

  // useMovement() has already been evaluated this frame, before the ticker ran.
  const intent = input.getMoveIntent();
  let actual = null;

  if (intent && intent.dir) {
    actual = tryMove(intent.dir.x, intent.dir.z, intent.preferX);
  }

  lastMoveDir = actual ? { x: actual.x, z: actual.z } : null;

  if (actual) {
    player.facing = { x: actual.x, z: actual.z };
    player.moved = true;
  }

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
});

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
        ? '<b>Left stick</b> move · <b>✕</b> attack · <b>□</b> eat · <b>D-pad</b> swap gear · <b>Options</b> pause'
        : '<b>Left stick</b> move · <b>A</b> attack · <b>X</b> eat · <b>D-pad</b> swap gear · <b>Start</b> pause';
      hintKey = key;
    }
  } else if (hintKey !== 'keyboard') {
    hintEl.innerHTML = KEYBOARD_HINT_HTML;
    hintKey = 'keyboard';
  }
}

// Test hooks for the automated director.
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
};

const hudState = { tick: -1, tile: '', input: '' };
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

  ticker.update(now);
  render.update(dt, player, ticker.alpha);
  render.render();
  updateHud();

  if (!ready) {
    ready = true;
    console.log('[rimefall] ready');
  }
}

updateHint();
requestAnimationFrame(frame);
