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

  // Everything visible lives in a child "body" group so combat can lunge it
  // without touching the parent's logical/interpolated position.
  const body = new THREE.Group();
  body.name = 'player-body';
  group.add(body);
  group.userData.body = body;

  // Chunky legs, torso, belt and a fur mantle for contrast against the tunic.
  body.add(box(0.22, 0.36, 0.24, dark, -0.15, 0.18, 0));
  body.add(box(0.22, 0.36, 0.24, dark, 0.15, 0.18, 0));

  body.add(box(0.62, 0.66, 0.42, tunic, 0, 0.68, 0));
  body.add(box(0.28, 0.34, 0.44, tunicDark, 0, 0.78, 0)); // tabard stripe
  body.add(box(0.64, 0.12, 0.44, trim, 0, 0.43, 0));       // belt
  body.add(box(0.74, 0.13, 0.48, fur, 0, 1.0, 0));         // fur mantle

  // Arms with skin-tone hands.
  body.add(box(0.2, 0.46, 0.22, tunic, -0.4, 0.7, 0));
  body.add(box(0.2, 0.46, 0.22, tunic, 0.4, 0.7, 0));
  body.add(box(0.16, 0.12, 0.18, skin, -0.4, 0.43, 0));
  body.add(box(0.16, 0.12, 0.18, skin, 0.4, 0.43, 0));

  // Skin-tone head inside a low-poly brown hood with a cream fur face ring.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 7, 5), material(skin));
  head.position.set(0, 1.2, 0);
  head.castShadow = true;
  body.add(head);

  const hoodMesh = new THREE.Mesh(new THREE.SphereGeometry(0.27, 8, 6), material(hood));
  hoodMesh.position.set(0, 1.22, -0.03);
  hoodMesh.castShadow = true;
  body.add(hoodMesh);

  body.add(box(0.24, 0.2, 0.12, skin, 0, 1.17, 0.22)); // protruding face

  const furRim = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.045, 5, 10), material(fur));
  furRim.position.set(0, 1.17, 0.275);
  furRim.castShadow = true;
  body.add(furRim);

  body.add(box(0.055, 0.045, 0.035, dark, -0.06, 1.2, 0.285)); // eyes
  body.add(box(0.055, 0.045, 0.035, dark, 0.06, 1.2, 0.285));

  // Shield on the left arm, with a dark trim ring.
  const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 8), material(0x8fb6d6));
  shield.rotation.z = Math.PI / 2; // disc faces sideways
  shield.position.set(-0.52, 0.74, 0);
  shield.castShadow = true;
  body.add(shield);

  const shieldRim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 5, 8), material(trim));
  shieldRim.rotation.y = Math.PI / 2;
  shieldRim.position.set(-0.535, 0.74, 0);
  shieldRim.castShadow = true;
  body.add(shieldRim);

  // Sword in the right hand (pivot at the grip so the swing can rotate it).
  const sword = new THREE.Group();
  sword.position.set(0.46, 0.48, 0.1);
  sword.rotation.x = -0.28;
  const blade = box(0.07, 0.72, 0.1, 0xd7e2ee, 0, 0.42, 0);
  const guard = box(0.22, 0.06, 0.12, 0xc9a24a, 0, 0.06, 0);
  const grip = box(0.08, 0.16, 0.09, 0x4a3520, 0, -0.04, 0);
  sword.add(blade);
  sword.add(guard);
  sword.add(grip);
  body.add(sword);
  group.userData.sword = sword;
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

function buildIceWolf(group) {
  const fur = 0xbfe0f2;
  const furDark = 0x86b3cf;
  const belly = 0xe8f6ff;
  const dark = 0x2b3a47;

  // Chunky box body, pale ice-blue with a lighter belly and darker legs.
  group.add(box(0.56, 0.44, 0.86, fur, 0, 0.56, -0.02));
  group.add(box(0.5, 0.2, 0.78, furDark, 0, 0.36, -0.02));
  group.add(box(0.44, 0.16, 0.56, belly, 0, 0.36, 0.08));

  group.add(box(0.5, 0.42, 0.34, fur, 0, 0.62, 0.32)); // chest
  group.add(box(0.38, 0.34, 0.36, fur, 0, 0.82, 0.5)); // head
  group.add(box(0.2, 0.16, 0.26, furDark, 0, 0.72, 0.74)); // snout
  group.add(box(0.1, 0.08, 0.08, dark, 0, 0.74, 0.88));    // nose

  group.add(box(0.1, 0.17, 0.08, furDark, -0.13, 1.02, 0.44));
  group.add(box(0.1, 0.17, 0.08, furDark, 0.13, 1.02, 0.44));

  group.add(box(0.06, 0.05, 0.04, dark, -0.1, 0.86, 0.68));
  group.add(box(0.06, 0.05, 0.04, dark, 0.1, 0.86, 0.68));

  group.add(box(0.14, 0.42, 0.14, furDark, -0.2, 0.21, 0.3));
  group.add(box(0.14, 0.42, 0.14, furDark, 0.2, 0.21, 0.3));
  group.add(box(0.14, 0.42, 0.14, furDark, -0.2, 0.21, -0.34));
  group.add(box(0.14, 0.42, 0.14, furDark, 0.2, 0.21, -0.34));

  const tail = box(0.12, 0.12, 0.46, furDark, 0, 0.68, -0.56);
  tail.rotation.x = -0.45;
  group.add(tail);

  // Pale shoulder tufts read as frost-rimed fur.
  group.add(box(0.64, 0.1, 0.26, belly, 0, 0.8, 0.24));
}

export function createEntityMesh(kind) {
  const group = new THREE.Group();
  if (kind === 'player') buildPlayer(group);
  else if (kind === 'ice_wolf') buildIceWolf(group);
  else if (kind === 'pillar') buildPillar(group);
  else if (kind === 'wall') buildWall(group);
  else throw new Error(`Unknown entity kind: ${kind}`);
  group.userData.kind = kind;
  return group;
}
