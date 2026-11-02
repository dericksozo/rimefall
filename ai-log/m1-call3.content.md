=== FILE: src/render.js ===
// Three.js presentation layer: room, props, player, camera, lights, snow.
// It knows nothing about game rules; main.js feeds it player state + tick alpha.

import * as THREE from 'three';
import { createEntityMesh } from './entities.js';
import { ROOM_SIZE, MIN, MAX, pillars, brokenWall } from './world.js';

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

    // Angled OSRS-like camera looking down at the player from the south-east.
    // Pulled back ~10% from milestone 1 with a slightly tighter FOV.
    this.camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 200);
    this.camOffset = new THREE.Vector3(7.26, 11.44, 7.26);
    this.follow = new THREE.Vector3(CENTER, 0, CENTER);
    this.camPos = this.follow.clone().add(this.camOffset);
    this.camLook = new THREE.Vector3(CENTER, 0.9, CENTER);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    this._tmpA = new THREE.Vector3();
    this._tmpB = new THREE.Vector3();

    this._buildLights();
    this._buildFloor();
    this._buildWalls();
    this._buildProps();
    this._buildPlayer();
    this._buildTileMarker();
    this._buildSnow();

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
    this.playerMesh.position.set(CENTER, 0, CENTER);
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
    this.tileMarker.position.set(CENTER, 0.035, CENTER);
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

  // player: { x, z, prevX, prevZ, facing: {x,z} }
  // alpha: 0..1 progress through the current tick; moving: did the last tick move?
  update(dt, player, alpha, moving) {
    const clamped = Math.min(dt, 0.1);

    const ix = player.prevX + (player.x - player.prevX) * alpha;
    const iz = player.prevZ + (player.z - player.prevZ) * alpha;
    const bob = moving ? Math.sin(alpha * Math.PI) * 0.11 : 0;
    this.playerMesh.position.set(ix, bob, iz);

    // Smoothly turn toward the facing direction (model front is +z).
    const targetYaw = Math.atan2(player.facing.x, player.facing.z);
    let delta = targetYaw - this.playerMesh.rotation.y;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.playerMesh.rotation.y += delta * (1 - Math.exp(-16 * clamped));

    // True-tile marker snaps to the logical tile; it never interpolates.
    this.tileMarker.position.set(player.x, 0.035, player.z);

    // Camera glides toward the interpolated player position.
    this.follow.lerp(this._tmpA.set(ix, 0, iz), 1 - Math.exp(-14 * clamped));
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
=== FILE: src/entities.js ===
// All entity visuals come from createEntityMesh(kind).
// Later milestones replace the internals with GLB models; callers stay unchanged.

import * as THREE from 'three';

function material(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: 0.88,
    metalness: 0.04,
    ...opts,
  });
}

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cyl(rTop, rBottom, h, color, segments = 8) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material(color));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildPlayer(group) {
  const tunic = 0x3f74d6;
  const tunicDark = 0x2c5099;
  const trim = 0x1f3457;
  const skin = 0xf0c49a;
  const hood = 0x5a4430;
  const fur = 0xefe6d3;
  const dark = 0x24313f;

  // Chunky legs, torso, belt and a fur mantle for contrast against the tunic.
  group.add(box(0.22, 0.36, 0.24, dark, -0.15, 0.18, 0));
  group.add(box(0.22, 0.36, 0.24, dark, 0.15, 0.18, 0));

  group.add(box(0.62, 0.66, 0.42, tunic, 0, 0.68, 0));
  group.add(box(0.28, 0.34, 0.44, tunicDark, 0, 0.78, 0)); // tabard stripe
  group.add(box(0.64, 0.12, 0.44, trim, 0, 0.43, 0));       // belt
  group.add(box(0.74, 0.13, 0.48, fur, 0, 1.0, 0));         // fur mantle

  // Arms with skin-tone hands.
  group.add(box(0.2, 0.46, 0.22, tunic, -0.4, 0.7, 0));
  group.add(box(0.2, 0.46, 0.22, tunic, 0.4, 0.7, 0));
  group.add(box(0.16, 0.12, 0.18, skin, -0.4, 0.43, 0));
  group.add(box(0.16, 0.12, 0.18, skin, 0.4, 0.43, 0));

  // Skin-tone head inside a low-poly brown hood with a cream fur face ring.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 7, 5), material(skin));
  head.position.set(0, 1.2, 0);
  head.castShadow = true;
  group.add(head);

  const hoodMesh = new THREE.Mesh(new THREE.SphereGeometry(0.27, 8, 6), material(hood));
  hoodMesh.position.set(0, 1.22, -0.03);
  hoodMesh.castShadow = true;
  group.add(hoodMesh);

  group.add(box(0.24, 0.2, 0.12, skin, 0, 1.17, 0.22)); // protruding face

  const furRim = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.045, 5, 10), material(fur));
  furRim.position.set(0, 1.17, 0.275);
  furRim.castShadow = true;
  group.add(furRim);

  group.add(box(0.055, 0.045, 0.035, dark, -0.06, 1.2, 0.285)); // eyes
  group.add(box(0.055, 0.045, 0.035, dark, 0.06, 1.2, 0.285));

  // Shield on the left arm, with a dark trim ring.
  const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 8), material(0x8fb6d6));
  shield.rotation.z = Math.PI / 2; // disc faces sideways
  shield.position.set(-0.52, 0.74, 0);
  shield.castShadow = true;
  group.add(shield);

  const shieldRim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 5, 8), material(trim));
  shieldRim.rotation.y = Math.PI / 2;
  shieldRim.position.set(-0.535, 0.74, 0);
  shieldRim.castShadow = true;
  group.add(shieldRim);
}

function buildPillar(group) {
  const stone = 0x9db4c8;
  const dark = 0x7c93a8;
  const snow = 0xf3f9ff;

  const base = cyl(0.44, 0.5, 0.22, dark);
  base.position.y = 0.11;
  group.add(base);

  const shaft = cyl(0.32, 0.4, 1.35, stone);
  shaft.position.y = 0.9;
  group.add(shaft);

  const cap = cyl(0.36, 0.4, 0.16, stone);
  cap.position.y = 1.64;
  group.add(cap);

  const snowCap = cyl(0.34, 0.39, 0.15, snow);
  snowCap.position.y = 1.76;
  group.add(snowCap);

  const chip = box(0.22, 0.16, 0.3, dark, 0.24, 1.55, 0.08); // broken chunk
  group.add(chip);
}

function buildWall(group) {
  group.add(box(1.0, 1.05, 0.5, 0x93aabe, 0, 0.525, 0));      // block
  group.add(box(1.0, 0.14, 0.56, 0x6f869a, 0, 0.07, 0));      // base trim
  group.add(box(1.04, 0.12, 0.56, 0xf3f9ff, 0, 1.1, 0));      // snow
}

export function createEntityMesh(kind) {
  const group = new THREE.Group();
  if (kind === 'player') buildPlayer(group);
  else if (kind === 'pillar') buildPillar(group);
  else if (kind === 'wall') buildWall(group);
  else throw new Error(`Unknown entity kind: ${kind}`);
  group.userData.kind = kind;
  return group;
}
=== END FILE ===

Notes:
- Snow now uses a generated soft CanvasTexture sprite in three size/opacity layers; flakes within 4.6 units of the camera are recycled.
- Floor palette mixed bluer ice / whiter packed snow, tighter grid contrast, and dimmer hemisphere lighting for readable shadows.
- Player is scaled 1.25x with a skin-tone face, brown hood, cream fur trim, and fur mantle; the yellow true-tile marker lives in render.js and snaps to player.x/z.