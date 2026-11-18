import { POWER_UNITS_PER_DAY } from '../../shared/types.js';

/**
 * A draft is an Allocation that may hold fewer than POWER_UNITS_PER_DAY units.
 * The units not yet given to a system are "in the pool". A draft is valid (a real
 * Allocation) only when the pool is empty.
 */

export const SYSTEM_KEYS = ['life', 'shield', 'science'];

export const EMPTY_DRAFT = { life: 0, shield: 0, science: 0 };
export const BALANCED_DRAFT = { life: 4, shield: 3, science: 3 };

/** Units held by systems. */
export function assignedUnits(d) {
  return d.life + d.shield + d.science;
}

/** Units still in the pool (0..10). */
export function poolLeft(d) {
  return POWER_UNITS_PER_DAY - assignedUnits(d);
}

/** True when every unit is shared, so the draft can be played. */
export function isComplete(d) {
  return poolLeft(d) === 0;
}

/** Take one unit from the pool for `key`. No change when the pool is empty. */
export function addUnit(d, key) {
  if (poolLeft(d) <= 0) return d;
  return { ...d, [key]: d[key] + 1 };
}

/** Give one unit from `key` back to the pool. No change when `key` is at 0. */
export function removeUnit(d, key) {
  if (d[key] <= 0) return d;
  return { ...d, [key]: d[key] - 1 };
}

/**
 * Set `key` to `units`, clamped to what is possible: not below 0, not above
 * what the system holds now plus what the pool has. Fractions are rounded.
 */
export function setUnits(d, key, units) {
  const wanted = Number.isFinite(units) ? Math.round(units) : d[key];
  const max = d[key] + poolLeft(d);
  const next = Math.min(Math.max(wanted, 0), max);
  if (next === d[key]) return d;
  return { ...d, [key]: next };
}

export function sameAllocation(a, b) {
  return a.life === b.life && a.shield === b.shield && a.science === b.science;
}
