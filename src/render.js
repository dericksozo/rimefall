// Three.js presentation layer: room, props, player, camera, lights, snow.
// It knows nothing about game rules; main.js feeds it player state + tick alpha.

import * as THREE from 'three';
import { createEntityMesh } from './entities.js';
import { ROOM_SIZE, MIN, MAX, pillars, brokenWall } from './world.js';

const CENTER = (MIN + MAX) / 2;

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
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xb9d3e6);
    this.scene.fog = new THREE.Fog(0xb9d3e6, 21, 45);

    // Angled OSRS-like camera looking down at the player from the south-east.
    this.camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 200);
    this.camOffset = new THREE.Vector3(6.6, 10.4, 6.6); // distance ~14, pitch ~49 degrees
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
    this._buildSnow();

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  _buildLights() {
    const hemi = new THREE.HemisphereLight(0xdcecff, 0x2c3a4a, 1.15);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2d8, 2.1);
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
    // Dark base plane shows through tile gaps as thin grid lines.
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM_SIZE + 0.2, ROOM_SIZE + 0.2),
      new THREE.MeshStandardMaterial({ color: 0x22384a, roughness: 1, metalness: 0 })
    );
    base.rotation.x = -Math.PI / 2;
    base.position.set(CENTER, -0.16, CENTER);
    base.receiveShadow = true;
    this.scene.add(base);

    // Slightly bevelled low ice tiles, one instance per tile.
    const geo = new THREE.BoxGeometry(0.94, 0.18, 0.94);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      flatShading: true,
      roughness: 0.94,
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
        const t = rand();
        color.setHSL(0.56 + t * 0.03, 0.16 + rand() * 0.14, 0.76 + rand() * 0.1, THREE.SRGBColorSpace);
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
    this.playerMesh.position.set(CENTER, 0, CENTER);
    this.scene.add(this.playerMesh);
  }

  _buildSnow() {
    const count = 900;
    const positions = new Float32Array(count * 3);
    this.snowSpeeds = new Float32Array(count);
    const rand = mulberry32(99);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = -1 + rand() * 17;
      positions[i * 3 + 1] = rand() * 13;
      positions[i * 3 + 2] = -1 + rand() * 17;
      this.snowSpeeds[i] = 0.6 + rand() * 1.1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.14,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.snow = new THREE.Points(geo, mat);
    this.snow.frustumCulled = false;
    this.snowCount = count;
    this.scene.add(this.snow);
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

    // Camera glides toward the interpolated player position.
    this.follow.lerp(this._tmpA.set(ix, 0, iz), 1 - Math.exp(-14 * clamped));
    this._tmpB.copy(this.follow).add(this.camOffset);
    this.camPos.lerp(this._tmpB, 1 - Math.exp(-6 * clamped));
    this.camera.position.copy(this.camPos);
    this.camLook.set(this.follow.x, 0.9, this.follow.z);
    this.camera.lookAt(this.camLook);

    // Drifting snow.
    const attr = this.snow.geometry.attributes.position;
    for (let i = 0; i < this.snowCount; i++) {
      let y = attr.getY(i) - this.snowSpeeds[i] * clamped;
      let x = attr.getX(i) + clamped * 0.35;
      if (y < -0.2) y += 13.5;
      if (x > 16) x -= 17;
      attr.setX(i, x);
      attr.setY(i, y);
    }
    attr.needsUpdate = true;
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
