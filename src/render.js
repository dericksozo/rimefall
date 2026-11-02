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
