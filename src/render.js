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
