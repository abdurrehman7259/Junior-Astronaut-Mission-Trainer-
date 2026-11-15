/**
 * Shared helpers both sides must agree on.
 */
import { POWER_UNITS_PER_DAY, type Allocation, type GameState, type SiteId, type SolarEvent } from './types';

/**
 * Stable id for a drawn event set: 8 hex chars of FNV-1a over the ordered event ids.
 * Same events in the same order give the same id. Used for GameState.eventSetId
 * and for drawEventSet's excludeSetIds (FR-10: "Play again" gets a new set).
 */
export function eventSetIdOf(events: readonly Pick<SolarEvent, 'id'>[]): string {
  let hash = 0x811c9dc5;
  const text = events.map((e) => e.id).join('|');
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return 'set-' + hash.toString(16).padStart(8, '0');
}

/** The site of a game state ('moon' when absent: states made before site support). */
export function siteOf(state: Pick<GameState, 'site'>): SiteId {
  return state.site ?? 'moon';
}

/** True when every unit is a whole number in 0..10 and the total is exactly 10. */
/** A plan being built on the day screen: whole units 0..10 that sum to at most 10 (D-038). */
export function isValidDraft(a: Allocation): boolean {
  const parts = [a.life, a.shield, a.science];
  return (
    parts.every((n) => Number.isInteger(n) && n >= 0 && n <= POWER_UNITS_PER_DAY) &&
    parts.reduce((s, n) => s + n, 0) <= POWER_UNITS_PER_DAY
  );
}

export function isValidAllocation(a: Allocation): boolean {
  const parts = [a.life, a.shield, a.science];
  return (
    parts.every((n) => Number.isInteger(n) && n >= 0 && n <= POWER_UNITS_PER_DAY) &&
    parts.reduce((s, n) => s + n, 0) === POWER_UNITS_PER_DAY
  );
}
