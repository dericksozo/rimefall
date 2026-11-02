=== FILE: index.html ===
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Rimefall — Milestone 1.2</title>
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
    <div class="row"><span class="k">Tick</span><span class="v" id="hud-tick">0</span></div>
    <div class="row"><span class="k">Tile</span><span class="v" id="hud-tile">(7, 7)</span></div>
    <div class="row"><span class="k">Input</span><span class="v" id="hud-input">keyboard</span></div>
  </div>

  <div id="hint">
    <b>WASD</b> move · <b>Space</b> attack · <b>E</b> eat · <b>1/2/3</b> gear · <b>Esc</b> pause<br />
    <span>Gamepad: <b>Left stick</b> move · <b>A</b> attack · <b>X</b> eat · <b>D-pad</b> swap gear · <b>Start</b> pause</span>
  </div>

  <div id="toast"></div>
  <div id="pause-overlay"><div class="box">PAUSED</div></div>

  <script type="module" src="./src/main.js"></script>
</body>
</html>
=== END FILE ===
=== FILE: src/main.js ===
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
=== END FILE ===
=== FILE: src/tick.js ===
// Fixed game tick clock, decoupled from rendering.
// alpha is the 0..1 progress through the current tick (for interpolation).

export const TICK_MS = 600;

export class Ticker {
  constructor(tickMs = TICK_MS) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

    this.tickMs = tickMs;
    this.tick = 0;
    this.paused = false;
    this.callbacks = [];

    this.lastTickTime = now;
    this.nextTickTime = now + this.tickMs;
    this.alpha = 0;

    this._onVisibilityChange = () => {
      if (!document.hidden) this.resync();
    };
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', this._onVisibilityChange);
    }
  }

  subscribe(fn) {
    this.callbacks.push(fn);
    return () => {
      const i = this.callbacks.indexOf(fn);
      if (i >= 0) this.callbacks.splice(i, 1);
    };
  }

  // Resync rather than consuming a backlog after a pause, tab switch or stall.
  // Alpha is held at 1 until the next scheduled tick so the mesh does not snap
  // backward to the previous tile after a resumed tab.
  resync(now = (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
    this.lastTickTime = now - this.tickMs;
    this.nextTickTime = now + this.tickMs;
    this.alpha = 1;
  }

  setPaused(value) {
    const v = !!value;
    if (this.paused === v) return;
    this.paused = v;
    this.resync();
  }

  // Called once per rendered frame with a DOMHighResTimeStamp.
  update(now) {
    if (this.paused) return;
    if (!Number.isFinite(now)) return;

    if (now < this.lastTickTime) {
      this.resync(now);
      return;
    }

    if (now >= this.nextTickTime) {
      const due = Math.floor((now - this.nextTickTime) / this.tickMs) + 1;

      // More than two missed ticks means a hidden tab or long stall: resync
      // instead of bursting through the backlog.
      if (due > 2) {
        this.resync(now);
        return;
      }

      for (let i = 0; i < due; i++) {
        this.lastTickTime = this.nextTickTime;
        this.nextTickTime += this.tickMs;
        this.tick++;
        for (const cb of this.callbacks) cb(this.tick);
      }
    }

    this.alpha = Math.min(1, Math.max(0, (now - this.lastTickTime) / this.tickMs));
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
const PAD_ACTION = { 0: 'attack', 2: 'eat', 14: 'swap1', 12: 'swap2', 15: 'swap3' };
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
=== FILE: src/render.js ===
// Three.js presentation layer: room, props, player, camera, lights, snow.
// It knows nothing about game rules; main.js feeds it player state + tick alpha.

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

    this._buildLights();
    this._buildFloor();
    this._buildWalls();
    this._buildProps();
    this._buildPlayer();
    this._buildTileMarker();
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

  // player: { x, z, prevX, prevZ, facing: {x,z} }
  // alpha: 0..1 progress through the current tick, straight from the ticker.
  update(dt, player, alpha) {
    const clamped = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
    const t = Math.min(1, Math.max(0, alpha));

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

    // True-tile marker snaps to the logical tile; it never interpolates.
    this.tileMarker.position.set(player.x, 0.035, player.z);

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