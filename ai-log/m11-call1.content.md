=== FILE: index.html ===
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Rimefall — Milestone 1.1</title>
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
    <span>Gamepad: left stick move · A attack · X eat · D-pad swap · Start pause</span>
  </div>

  <div id="toast"></div>
  <div id="pause-overlay"><div class="box">PAUSED</div></div>

  <script type="module" src="./src/main.js"></script>
</body>
</html>
=== END FILE ===
=== FILE: src/input.js ===
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
=== END FILE ===
=== FILE: src/render.js ===
// Three.js presentation layer: room, props, player, camera, lights, snow.
// It knows nothing about game rules; main.js feeds it player state + tick alpha.

import * as THREE from 'three';
import { createEntityMesh } from './entities.js';
import { ROOM_SIZE, MIN, MAX, pillars, brokenWall, SPAWN } from './world.js';

const CENTER = (MIN + MAX) / 2;

// Eight grid directions, clockwise from north/up.
const GRID_DIRS = [
  [0, -1], [1, -1], [1, 0], [1, 1],
  [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

const PREGLIDE_MAX_FRACTION = 0.35; // at most 35% of a tile before the tick
const PREGLIDE_SPEED = 0.8;         // fraction per full tick, before the cap
const RETURN_MS = 140;

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

    // Angled OSRS-like camera looking down at the player from the south-east.
    // Pulled back ~10% from milestone 1 with a slightly tighter FOV.
    this.camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 200);
    this.camOffset = new THREE.Vector3(7.26, 11.44, 7.26);
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

    // Visual movement state. Logical moves stay on tick boundaries; these
    // glides only control where the rendered mesh is.
    this.visX = SPAWN.x;
    this.visZ = SPAWN.z;
    this.moveMode = 'idle'; // 'idle' | 'pre' | 'return' | 'move'
    this.glide = null;
    this.facingYaw = 0; // model front is +z; spawn faces south

    // Glide times use a pause-aware game clock.
    this.paused = false;
    this._pauseStartedAt = 0;
    this.clockOffset = 0;

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

  // Screen angle of every grid step from the given tile, measured from screen
  // up (0) clockwise, with CSS screen y pointing down.
  projectedDirs(tileX, tileZ) {
    const base = this.tileToScreen(tileX, tileZ);
    const out = [];
    for (const [dx, dz] of GRID_DIRS) {
      const p = this.tileToScreen(tileX + dx, tileZ + dz);
      const sx = p.x - base.x;
      const sy = p.y - base.y;
      out.push({ x: dx, z: dz, angle: Math.atan2(sx, -sy) });
    }
    return out;
  }

  // ---- pause-aware visual movement clock ----

  setPaused(paused, nowMs = performance.now()) {
    const now = nowMs / 1000;
    if (paused) {
      if (!this.paused) {
        this.paused = true;
        this._pauseStartedAt = now;
      }
    } else if (this.paused) {
      this.paused = false;
      this.clockOffset += now - this._pauseStartedAt;
    }
  }

  _gameTime(nowMs) {
    return nowMs / 1000 - this.clockOffset;
  }

  _faceTowards(dx, dz) {
    if (dx * dx + dz * dz < 1e-8) return;
    this.facingYaw = Math.atan2(dx, dz);
  }

  _visualAt(timeSec) {
    const g = this.glide;
    if (!g) return { x: this.visX, z: this.visZ };

    const span = Math.max(1e-6, g.end - g.start);
    let t = (timeSec - g.start) / span;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;

    let f;
    if (this.moveMode === 'pre') {
      f = t * g.fraction;
    } else if (this.moveMode === 'return') {
      f = t * t * (3 - 2 * t); // ease back
    } else {
      f = t; // committed move: constant speed, tile-to-tile
    }

    return {
      x: g.fromX + (g.toX - g.fromX) * f,
      z: g.fromZ + (g.toZ - g.fromZ) * f,
    };
  }

  isCommittedMoving() {
    return this.moveMode === 'move';
  }

  /**
   * Start the visual glide for a logical move that committed at boundaryMs.
   * If a pre-glide is active, continue from its ideal position at the tick
   * boundary; otherwise start exactly on the previous logical tile so held
   * movement remains constant-speed and hitch-free across ticks.
   */
  requestMove(toX, toZ, boundaryMs, tickMs, prevX = this.visX, prevZ = this.visZ) {
    const boundary = this._gameTime(boundaryMs);
    const from =
      this.moveMode === 'pre' || this.moveMode === 'return'
        ? this._visualAt(boundary)
        : { x: prevX, z: prevZ };

    this.moveMode = 'move';
    this.glide = {
      fromX: from.x,
      fromZ: from.z,
      toX,
      toZ,
      start: boundary,
      end: boundary + tickMs / 1000,
      fraction: 1,
    };
    this._faceTowards(toX - from.x, toZ - from.z);
  }

  preGlideTo(toX, toZ, nowMs, remainingMs, tickMs) {
    if (this.moveMode === 'move') return;

    if (
      this.moveMode === 'pre' &&
      this.glide &&
      this.glide.toX === toX &&
      this.glide.toZ === toZ
    ) {
      return;
    }

    const remaining = Math.max(0, remainingMs);
    if (remaining <= 0) return;

    const frac = Math.min(
      PREGLIDE_MAX_FRACTION,
      PREGLIDE_SPEED * (remaining / tickMs)
    );
    if (frac <= 0.0001) return;

    const now = this._gameTime(nowMs);
    this.moveMode = 'pre';
    this.glide = {
      fromX: this.visX,
      fromZ: this.visZ,
      toX,
      toZ,
      start: now,
      end: now + remaining / 1000,
      fraction: frac,
    };
    this._faceTowards(toX - this.visX, toZ - this.visZ);
  }

  returnToTile(x, z, nowMs) {
    if (this.moveMode === 'move') return;

    if (
      this.moveMode === 'return' &&
      this.glide &&
      this.glide.toX === x &&
      this.glide.toZ === z
    ) {
      return;
    }

    const dx = this.visX - x;
    const dz = this.visZ - z;
    if (dx * dx + dz * dz < 1e-8) {
      this.moveMode = 'idle';
      this.glide = null;
      return;
    }

    const now = this._gameTime(nowMs);
    this.moveMode = 'return';
    this.glide = {
      fromX: this.visX,
      fromZ: this.visZ,
      toX: x,
      toZ: z,
      start: now,
      end: now + RETURN_MS / 1000,
      fraction: 1,
    };
    // Keep the last gameplay facing while easing back to the tile.
  }

  // player: { x, z, prevX, prevZ, facing: {x,z} }
  // alpha: 0..1 progress through the current tick; moving: did the last tick move?
  update(dt, player, alpha, moving, nowMs) {
    const clamped = Math.min(dt, 0.1);
    const now = this._gameTime(typeof nowMs === 'number' ? nowMs : performance.now());

    if (!this.paused && this.glide) {
      const g = this.glide;
      const p = this._visualAt(now);
      this.visX = p.x;
      this.visZ = p.z;

      const span = Math.max(1e-6, g.end - g.start);
      const t = (now - g.start) / span;
      if (t >= 1 && this.moveMode !== 'pre') {
        this.visX = g.toX;
        this.visZ = g.toZ;
        this.moveMode = 'idle';
        this.glide = null;
      }
    }

    // Single straight lerp on x and z together. No per-tile bob reset hitch.
    this.playerMesh.position.set(this.visX, 0, this.visZ);

    // Turn toward the actual movement vector; when idle keep the last facing.
    let delta = this.facingYaw - this.playerMesh.rotation.y;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.playerMesh.rotation.y += delta * (1 - Math.exp(-18 * clamped));

    // True-tile marker snaps to the logical tile; it never interpolates.
    this.tileMarker.position.set(player.x, 0.035, player.z);

    // Camera glides toward the rendered player position.
    this.follow.lerp(this._tmpA.set(this.visX, 0, this.visZ), 1 - Math.exp(-14 * clamped));
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
        let x = p[i3] + Math.sin(this.snowTime * 0.8 + phase) * 0.16 * clamped;
        let y = p[i3 + 1] - layer.speeds[i] * clamped;
        let z = p[i3 + 2] + Math.cos(this.snowTime * 0.65 + phase * 1.7) * 0.11 * clamped;

        if (y < SNOW_BOUNDS.minY) y += SNOW_HEIGHT;
        if (x < SNOW_BOUNDS.minX) x += SNOW_WIDTH_X;
        else if (x > SNOW_BOUNDS.maxX) x -= SNOW_WIDTH_X;
        if (z < SNOW_BOUNDS.minZ) z += SNOW_WIDTH_Z;
        else if (z > SNOW_BOUNDS.maxZ) z -= SNOW_WIDTH_Z;

        const dx = x - camX;
        const dy = y - camY;
        const dz = z - camZ;
        if (dx * dx + dy * dy + dz * dz < SNOW_SAFE_RADIUS_SQ) {
          this._spawnSnowPoint(out);
          x = out.x;
          y = out.y;
          z = out.z;
        }

        p[i3] = x;
        p[i3 + 1] = y;
        p[i3 + 2] = z;
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
=== FILE: src/main.js ===
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
=== END FILE ===

Notes:
- `pickGridDir(screenAngle, projectedDirs)` is exported from `src/input.js`; entries are `{x, z, angle}` with angle 0 = screen up, clockwise.
- `Render` now owns a pause-aware visual clock so pre-glides/return glides freeze while paused and resume without jumping.
- Pre-glide covers at most 35% of a tile; the committed glide then finishes at the tick boundary from the predicted visual position.
- Test hooks `tileToScreen`, `meshScreen`, `meshWorld`, `hintText`, and `lastMoveDir` are added; all existing `__rimefall` fields remain.