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
