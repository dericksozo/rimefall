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
