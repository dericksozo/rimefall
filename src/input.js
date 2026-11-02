// Unified keyboard + standard-gamepad input.
// Movement intent is expressed in SCREEN space and mapped onto the grid using
// the renderer's projected grid directions. Sticks are sampled at tick time.

const KEY_SCREEN = {
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

// Standard mapping buttons used by milestone 1.1.
const PAD_ACTION = { 0: 'attack', 2: 'eat', 14: 'swap1', 12: 'swap2', 15: 'swap3' };
const PAD_PAUSE_BUTTON = 9;

export const STICK_DEADZONE = 0.35;

const TAU = Math.PI * 2;

// Fallback used when a caller does not supply camera-projected directions.
// This keeps pickGridDir/Input useful in isolation (identity screen = grid axes).
const DEFAULT_PROJECTED_DIRS = [
  { x: 0, z: -1, angle: 0 },
  { x: 1, z: -1, angle: Math.PI / 4 },
  { x: 1, z: 0, angle: Math.PI / 2 },
  { x: 1, z: 1, angle: (3 * Math.PI) / 4 },
  { x: 0, z: 1, angle: Math.PI },
  { x: -1, z: 1, angle: (5 * Math.PI) / 4 },
  { x: -1, z: 0, angle: (3 * Math.PI) / 2 },
  { x: -1, z: -1, angle: (7 * Math.PI) / 4 },
];

function normalizeAngle(a) {
  a %= TAU;
  return a < 0 ? a + TAU : a;
}

function angleDistance(a, b) {
  const d = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(d, TAU - d);
}

function normalizeProjectedDirs(projectedDirs) {
  let list = null;

  if (Array.isArray(projectedDirs)) {
    list = projectedDirs;
  } else if (projectedDirs && typeof projectedDirs === 'object') {
    // Also tolerate a {"x,z": angle} map.
    list = [];
    for (const key of Object.keys(projectedDirs)) {
      const m = /^(-?\d+),(-?\d+)$/.exec(key);
      if (!m) continue;
      const value = projectedDirs[key];
      const angle = typeof value === 'number' ? value : value && value.angle;
      list.push({ x: Number(m[1]), z: Number(m[2]), angle });
    }
  }

  if (!list || list.length === 0) return DEFAULT_PROJECTED_DIRS.slice();

  const out = [];
  for (const entry of list) {
    if (!entry) continue;

    let x = entry.x;
    let z = entry.z;
    let angle = entry.angle;

    if (entry.dir) {
      if (Array.isArray(entry.dir)) {
        x = entry.dir[0];
        z = entry.dir[1];
      } else {
        x = entry.dir.x;
        z = entry.dir.z;
      }
    }

    if (typeof x !== 'number' || typeof z !== 'number') continue;
    if (typeof angle !== 'number') angle = Math.atan2(x, -z);
    out.push({ x, z, angle });
  }

  return out.length ? out : DEFAULT_PROJECTED_DIRS.slice();
}

function classifyProjectedDirs(dirs) {
  const cardinals = [];
  const used = new Set();

  // Greedily assign the four grid dirs closest to screen up/right/down/left.
  for (let k = 0; k < 4; k++) {
    const ref = (k * Math.PI) / 2;
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < dirs.length; i++) {
      if (used.has(i)) continue;
      const dist = angleDistance(dirs[i].angle, ref);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    if (best >= 0) {
      used.add(best);
      cardinals.push(dirs[best]);
    }
  }

  const diagonals = [];
  for (let i = 0; i < dirs.length; i++) {
    if (!used.has(i)) diagonals.push(dirs[i]);
  }

  return { cardinals, diagonals };
}

/**
 * Pure screen-angle -> grid-direction snapping.
 *
 * screenAngle: radians, 0 = screen up, PI/2 = screen right, clockwise.
 * projectedDirs: array of { x, z, angle } where angle is the projected screen
 * angle of that grid direction measured the same way.
 *
 * Screen diagonals own 30-degree sectors centred on 45/135/225/315 degrees;
 * screen cardinals own the remaining 60-degree sectors.
 */
export function pickGridDir(screenAngle, projectedDirs) {
  const dirs = normalizeProjectedDirs(projectedDirs);
  if (!dirs.length || typeof screenAngle !== 'number' || !Number.isFinite(screenAngle)) {
    return null;
  }

  const { cardinals, diagonals } = classifyProjectedDirs(dirs);
  const angle = normalizeAngle(screenAngle);

  const diagRefs = [
    Math.PI / 4,
    (3 * Math.PI) / 4,
    (5 * Math.PI) / 4,
    (7 * Math.PI) / 4,
  ];

  let diagRef = diagRefs[0];
  let diagDist = Infinity;
  for (const ref of diagRefs) {
    const dist = angleDistance(angle, ref);
    if (dist < diagDist) {
      diagDist = dist;
      diagRef = ref;
    }
  }

  const useDiagonal = diagDist <= Math.PI / 12 + 1e-9;
  const pool = useDiagonal ? (diagonals.length ? diagonals : cardinals) : cardinals;
  const target = useDiagonal ? diagRef : angle;

  let best = null;
  let bestDist = Infinity;
  for (const d of pool) {
    const dist = angleDistance(d.angle, target);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }

  return best ? { x: best.x, z: best.z } : null;
}

export class Input {
  constructor(hooks = {}) {
    this.onPause = hooks.onPause || (() => {});
    this.onToast = hooks.onToast || (() => {});

    this.device = 'keyboard';
    this.keys = new Set();
    this.actions = [];

    // Latest polled left-stick axes (axis 1 positive = screen down).
    this.padAxes = { x: 0, y: 0 };
    this.padButtonState = new Map();
    this.connectedIds = new Set();
    this.notifiedIds = new Set();
    this._padStickActive = false;
    this._activePadId = null;

    this._bindKeyboard();

    // Pads may be present before load (no gamepadconnected event) or connect
    // later. The frame loop also polls, but listening keeps this responsive.
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

      if (KEY_SCREEN[e.code]) {
        e.preventDefault();
        this.device = 'keyboard';
        this.keys.add(e.code);
        return;
      }

      const action = KEY_ACTION[e.code];
      if (action) {
        e.preventDefault();
        this.device = 'keyboard';
        if (!e.repeat) this.actions.push(action);
      }
    });

    window.addEventListener('keyup', (e) => {
      if (KEY_SCREEN[e.code]) this.keys.delete(e.code);
    });

    // Avoid "stuck" keys when the window loses focus.
    window.addEventListener('blur', () => this.keys.clear());
  }

  // WASD/arrows are screen-relative: W = screen up, D = screen right, etc.
  keyboardScreenAngle() {
    let x = 0;
    let y = 0;
    for (const code of this.keys) {
      const d = KEY_SCREEN[code];
      if (!d) continue;
      x += d[0];
      y += d[1];
    }
    x = Math.sign(x);
    y = Math.sign(y);
    if (!x && !y) return null;
    return Math.atan2(x, -y);
  }

  stickScreenAngle() {
    const ax = this.padAxes.x;
    const ay = this.padAxes.y;
    if (Math.hypot(ax, ay) < STICK_DEADZONE) return null;
    return Math.atan2(ax, -ay);
  }

  getDirection(projectedDirs) {
    const kb = this.keyboardScreenAngle();
    const pad = this.stickScreenAngle();

    let angle = null;
    if (this.device.startsWith('gamepad')) {
      angle = pad !== null ? pad : kb;
    } else {
      angle = kb !== null ? kb : pad;
    }

    if (angle === null) return null;
    return pickGridDir(angle, projectedDirs);
  }

  consumeActions() {
    const queued = this.actions;
    this.actions = [];
    return queued;
  }

  pollGamepads() {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    const seen = new Set();

    let sawActiveStick = false;
    let activePadId = null;
    let activeAxes = null;

    for (let i = 0; i < pads.length; i++) {
      const gp = pads[i];
      if (!gp || !gp.connected) {
        this.padButtonState.delete(i);
        continue;
      }

      seen.add(gp.id);

      if (!this.connectedIds.has(gp.id)) {
        this.connectedIds.add(gp.id);
        // Exactly once per id, including pads first discovered by polling.
        if (!this.notifiedIds.has(gp.id)) {
          this.notifiedIds.add(gp.id);
          this.onToast(`🎮 Controller connected: ${gp.id}`);
        }
      }

      const axes = gp.axes || [];
      const ax = axes.length > 0 ? (axes[0] || 0) : 0;
      const ay = axes.length > 1 ? (axes[1] || 0) : 0;

      if (!sawActiveStick && Math.hypot(ax, ay) >= STICK_DEADZONE) {
        sawActiveStick = true;
        activePadId = gp.id;
        activeAxes = { x: ax, y: ay };
      }

      const buttons = gp.buttons || [];
      let prev = this.padButtonState.get(i);
      if (!prev || prev.length !== buttons.length) {
        prev = new Array(buttons.length).fill(false);
        this.padButtonState.set(i, prev);
      }

      // Face buttons and D-pad. D-pad is action-only; it never moves the player.
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
    }

    if (sawActiveStick) {
      // Only switch the device on stick activation (or pad change), so simply
      // holding a stick does not steal the hint back after keyboard use.
      if (!this._padStickActive || this._activePadId !== activePadId) {
        this.device = `gamepad: ${activePadId}`;
      }
      this._padStickActive = true;
      this._activePadId = activePadId;
      this.padAxes = activeAxes;
    } else {
      this._padStickActive = false;
      this._activePadId = null;
      this.padAxes = { x: 0, y: 0 };
    }

    // Disconnects (detected by id so index shuffles don't false-positive).
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
