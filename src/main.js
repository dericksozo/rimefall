// Rimefall milestone 1: grid, fixed ticks, movement, input, placeholder visuals.

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
function tryMove(dx, dz) {
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

ticker.subscribe(() => {
  // Interpolation runs from the tile we were on at the start of this tick.
  player.prevX = player.x;
  player.prevZ = player.z;
  player.moved = false;

  for (const action of input.consumeActions()) {
    // Combat / gear / food arrive in later milestones.
    console.log(`[rimefall] action buffered: ${action} (milestone 1 has no combat)`);
  }

  const dir = input.getDirection();
  if (dir) {
    player.facing = { x: dir.x, z: dir.z }; // last attempted direction
    player.moved = tryMove(dir.x, dir.z);
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

// Test hook for the automated director.
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
  ticker.update(now);
  render.update(dt, player, ticker.alpha, player.moved);
  render.render();
  updateHud();

  if (!ready) {
    ready = true;
    console.log('[rimefall] ready');
  }
}

requestAnimationFrame(frame);
