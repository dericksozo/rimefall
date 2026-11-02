// Unified keyboard + standard-gamepad input.
// Movement is read at tick time; button presses are queueued as actions
// and consumed on the next tick (pause applies immediately).

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

// 8 sectors, clockwise from "up" (-z).
const PAD_DIRS = [
  [0, -1], [1, -1], [1, 0], [1, 1],
  [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

// Gamepad face/D-pad buttons (spec mapping for later milestones).
const PAD_ACTION = { 0: 'attack', 2: 'eat', 14: 'swap1', 12: 'swap2', 15: 'swap3' };
const PAD_PAUSE_BUTTON = 9;
const DEADZONE = 0.3;

export class Input {
  constructor(hooks = {}) {
    this.onPause = hooks.onPause || (() => {});
    this.onToast = hooks.onToast || (() => {});

    this.device = 'keyboard';
    this.keys = new Set();
    this.actions = [];
    this.padDir = null;
    this.padButtonState = new Map(); // pad index -> previous button booleans
    this.connectedIds = new Set();

    this._bindKeyboard();

    // Gamepads may appear via event or only after polling; poll on both.
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
    return x || z ? { x, z } : null;
  }

  // Latest device to produce input wins; fall back to the other device if idle.
  getDirection() {
    const kb = this.keyboardDir();
    const pad = this.padDir;
    if (this.device.startsWith('gamepad')) return pad || kb;
    return kb || pad;
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
    let dir = null;

    for (let i = 0; i < pads.length; i++) {
      const gp = pads[i];
      if (!gp || !gp.connected) {
        this.padButtonState.delete(i);
        continue;
      }
      seen.add(gp.id);
      if (!this.connectedIds.has(gp.id)) {
        this.connectedIds.add(gp.id);
        this.onToast(`🎮 Controller connected: ${gp.id}`);
      }

      // Left stick: radial deadzone, snap to 45-degree sectors.
      const ax = gp.axes[0] || 0;
      const ay = gp.axes[1] || 0;
      if (!dir && Math.hypot(ax, ay) >= DEADZONE) {
        const angle = Math.atan2(ax, -ay); // 0 = up, clockwise
        const sector = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
        dir = { x: PAD_DIRS[sector][0], z: PAD_DIRS[sector][1] };
        this.device = `gamepad: ${gp.id}`;
      }

      // Buttons: edge-detect presses.
      let prev = this.padButtonState.get(i);
      if (!prev || prev.length !== gp.buttons.length) {
        prev = new Array(gp.buttons.length).fill(false);
        this.padButtonState.set(i, prev);
      }
      for (const key of Object.keys(PAD_ACTION)) {
        const idx = Number(key);
        const pressed = !!(gp.buttons[idx] && gp.buttons[idx].pressed);
        if (pressed && !prev[idx]) {
          this.device = `gamepad: ${gp.id}`;
          this.actions.push(PAD_ACTION[idx]);
        }
        prev[idx] = pressed;
      }
      const pausePressed = !!(gp.buttons[PAD_PAUSE_BUTTON] && gp.buttons[PAD_PAUSE_BUTTON].pressed);
      if (pausePressed && !prev[PAD_PAUSE_BUTTON]) {
        this.device = `gamepad: ${gp.id}`;
        this.onPause();
      }
      prev[PAD_PAUSE_BUTTON] = pausePressed;
    }

    // Disconnects (detected by id so index shuffles don't false-positive).
    for (const id of Array.from(this.connectedIds)) {
      if (!seen.has(id)) {
        this.connectedIds.delete(id);
        this.onToast('Controller disconnected');
        if (this.device === `gamepad: ${id}`) this.device = 'keyboard';
      }
    }

    this.padDir = dir;
  }
}
