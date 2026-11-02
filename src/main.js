// Rimefall milestone 1.1: camera-relative movement, pre-glide feel fixes.

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

// One tile per tick; diagonals need target + both orthogonal neighbours free.
function canMove(dx, dz) {
  const nx = player.x + dx;
  const nz = player.z + dz;
  if (!isWalkable(nx, nz)) return false;
  if (dx !== 0 && dz !== 0) {
    if (!isWalkable(player.x + dx, player.z)) return false;
    if (!isWalkable(player.x, player.z + dz)) return false;
  }
  return true;
}

function tryMove(dx, dz) {
  if (!canMove(dx, dz)) return false;
  player.x += dx;
  player.z += dz;
  return true;
}

let lastMoveDir = null;
let movedThisFrame = false;

ticker.subscribe(() => {
  // Interpolation starts from the tile we were on at the start of this tick.
  player.prevX = player.x;
  player.prevZ = player.z;
  player.moved = false;

  for (const action of input.consumeActions()) {
    // Combat / gear / food arrive in later milestones.
    console.log(`[rimefall] action buffered: ${action} (milestone 1.1 has no combat)`);
  }

  // Direction picking happens against the camera at tick time. The stick is
  // sampled from the latest polled axes; releasing it before this tick = no move.
  const dirs = render.projectedDirs(player.x, player.z);
  const dir = input.getDirection(dirs);
  lastMoveDir = dir ? { x: dir.x, z: dir.z } : null;

  if (dir) {
    player.facing = { x: dir.x, z: dir.z }; // last attempted direction
    player.moved = tryMove(dir.x, dir.z);
    if (player.moved) movedThisFrame = true;
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
    s.includes('054c')
  );
}

let hintKey = 'keyboard';
function updateHint() {
  const device = input.device;

  if (device.startsWith('gamepad')) {
    const id = device.slice('gamepad: '.length);
    const playstation = isPlayStationId(id);
    const key = playstation ? 'pad-playstation' : 'pad-xbox';
    if (hintKey !== key) {
      hintEl.textContent = playstation
        ? 'Left stick move · ✕ attack · □ eat · D-pad swap gear · Options pause'
        : 'Left stick move · A attack · X eat · D-pad swap gear · Start pause';
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

// Start-of-tick pre-glide: if the player is idle and movement input begins
// mid-tick, move the mesh a little toward the predicted neighbour immediately.
function updatePreGlide(now) {
  if (ticker.paused) return;
  if (player.moved || render.isCommittedMoving()) return;

  const dirs = render.projectedDirs(player.x, player.z);
  const dir = input.getDirection(dirs);

  if (dir && canMove(dir.x, dir.z)) {
    const remainingMs = Math.max(0, ticker.tickMs - ticker.acc);
    render.preGlideTo(
      player.x + dir.x,
      player.z + dir.z,
      now,
      remainingMs,
      ticker.tickMs
    );
  } else {
    render.returnToTile(player.x, player.z, now);
  }
}

let last = -1;
let ready = false;

function frame(now) {
  requestAnimationFrame(frame);

  if (last < 0) last = now;
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  input.pollGamepads();
  render.setPaused(ticker.paused, now);

  movedThisFrame = false;
  ticker.update(now);

  if (movedThisFrame) {
    const boundaryMs = now - ticker.acc;
    render.requestMove(
      player.x,
      player.z,
      boundaryMs,
      ticker.tickMs,
      player.prevX,
      player.prevZ
    );
  }

  render.update(dt, player, ticker.alpha, player.moved, now);

  if (!ticker.paused) updatePreGlide(now);

  render.render();
  updateHud();

  if (!ready) {
    ready = true;
    console.log('[rimefall] ready');
  }
}

updateHint();
requestAnimationFrame(frame);
