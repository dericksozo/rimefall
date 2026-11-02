// Static, deterministic room layout for Rimefall (15x15 tiles).
// Tile coords are integers 0..14; world position of a tile is (x, 0, z).

export const ROOM_SIZE = 15;
export const MIN = 0;
export const MAX = ROOM_SIZE - 1; // 14
export const SPAWN = { x: 7, z: 7 };

// Six broken ruin pillars, one tile each.
export const pillars = [
  { x: 3, z: 3 },
  { x: 11, z: 3 },
  { x: 3, z: 11 },
  { x: 11, z: 11 },
  { x: 5, z: 7 },
  { x: 9, z: 4 },
];

// A two-tile collapsed wall section.
export const brokenWall = [
  { x: 9, z: 9 },
  { x: 10, z: 9 },
];

// Every impassable interior tile, with its visual kind (used by the renderer).
export const blockers = [
  ...pillars.map((p) => ({ x: p.x, z: p.z, kind: 'pillar' })),
  ...brokenWall.map((p) => ({ x: p.x, z: p.z, kind: 'wall' })),
];

const blockedTiles = new Set(blockers.map((b) => `${b.x},${b.z}`));

// Perimeter ring (x/z 0 and 14) is wall; interior props block too.
export function isWalkable(x, z) {
  if (!Number.isInteger(x) || !Number.isInteger(z)) return false;
  if (x < MIN + 1 || x > MAX - 1 || z < MIN + 1 || z > MAX - 1) return false;
  return !blockedTiles.has(`${x},${z}`);
}
