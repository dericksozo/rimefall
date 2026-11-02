// Rimefall combat core: weapon table, OSRS-like hit rolls, damage and range.
// Styles are data-driven so ranged/magic weapons can plug in at M3.

export const PLAYER_STATS = {
  maxHp: 40,
  defence: 12,
  foodCount: 4,
  foodHeal: 10,
};

export const WEAPONS = {
  sword: {
    id: 'sword',
    name: 'Iron Sword',
    style: 'melee',
    attackSpeedTicks: 4,
    range: 1,
    maxHit: 6,
    accuracy: 18,
  },
};

export function getWeapon(id) {
  return WEAPONS[id] || null;
}

let warnedNonFiniteRollHit = false;

// OSRS-like: attack roll vs defence roll, each uniform over [0, stat].
// A missing/non-finite stat is treated as zero so a single bad input can never
// turn the whole roll into NaN (which would make every attack silently miss).
export function rollHit(rng, accuracy, defence) {
  let attackStat = Number(accuracy);
  let defenceStat = Number(defence);

  if (!Number.isFinite(attackStat) || !Number.isFinite(defenceStat)) {
    if (!warnedNonFiniteRollHit) {
      warnedNonFiniteRollHit = true;
      console.warn('[rimefall] rollHit received a non-finite stat; treating it as 0.', {
        accuracy,
        defence,
      });
    }
    if (!Number.isFinite(attackStat)) attackStat = 0;
    if (!Number.isFinite(defenceStat)) defenceStat = 0;
  }

  const attackRoll = rng.next() * (attackStat + 1);
  const defenceRoll = rng.next() * (defenceStat + 1);
  return attackRoll > defenceRoll;
}

// Uniform integer 0..maxHit. A hit may roll 0 (shown as a red 0).
export function rollDamage(rng, maxHit) {
  return Math.floor(rng.next() * (maxHit + 1));
}

export function manhattan(ax, az, bx, bz) {
  return Math.abs(ax - bx) + Math.abs(az - bz);
}

// Melee reaches only cardinally adjacent tiles, never diagonals.
export function isCardinalAdjacent(ax, az, bx, bz) {
  return Math.abs(ax - bx) + Math.abs(az - bz) === 1;
}

export function inWeaponRange(weapon, ax, az, bx, bz) {
  const d = manhattan(ax, az, bx, bz);
  if (weapon.style === 'melee') return d === 1;
  return d <= weapon.range;
}
