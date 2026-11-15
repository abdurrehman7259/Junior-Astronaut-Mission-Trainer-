/**
 * Pure helpers for the teaching report (P6, D-038). They read only the TurnResult the engine already returns.
 * No engine change: the engine rules stay in src/engine; the one rule value used here is pinned by a test.
 */
import type { Allocation, SiteId, TurnResult } from '../shared/types';
import type { VerdictKind } from '../ui/content/copy';

/** Game rule mirror: life units needed to avoid losing air (RULES.lifeSupportMinUnits; see tests/ui/verdict.test.ts). */
export const AIR_MIN_UNITS = 4;
/** Received radiation at or above this counts as "hurt" (game units). Below it, shields blocked most. */
export const HURT_THRESHOLD = 10;

export function verdictFor(r: TurnResult, _site: SiteId = 'moon'): VerdictKind {
  const storm = r.dose.incoming > 0;
  if (r.statusAfter === 'ended') return r.after.crewHealth <= 0 ? 'lostCrew' : 'lostAir';
  if (storm && r.dose.received >= HURT_THRESHOLD) return 'hurt';
  if (r.allocation.life < AIR_MIN_UNITS) return 'airLow';
  if (r.after.power === 0) return 'batteryEmpty';
  if (storm) return r.dose.received === 0 ? 'blocked' : 'mostlyBlocked';
  if (r.allocation.shield > 0) return 'shieldsWasted';
  return r.allocation.science > 0 ? 'calmScience' : 'calmNoScience';
}

export type MeterLineKind =
  | { meter: 'battery'; kind: 'empty' | 'down' | 'up' | 'same' }
  | { meter: 'air'; kind: 'short' | 'down' | 'up' | 'same'; units: number }
  | { meter: 'crew'; kind: 'hurt' | 'safe' | 'calm'; blocked: number; received: number }
  | { meter: 'science'; kind: 'points' | 'none'; points: number };

/** One line per meter, in report order: battery, air, crew, science. */
export function meterLinesFor(r: TurnResult): MeterLineKind[] {
  const dp = r.after.power - r.before.power;
  const da = r.after.lifeSupport - r.before.lifeSupport;
  const battery: MeterLineKind = {
    meter: 'battery',
    kind: r.after.power === 0 ? 'empty' : dp < 0 ? 'down' : dp > 0 ? 'up' : 'same',
  };
  const air: MeterLineKind = {
    meter: 'air',
    kind: r.allocation.life < AIR_MIN_UNITS ? 'short' : da < 0 ? 'down' : da > 0 ? 'up' : 'same',
    units: r.allocation.life,
  };
  const crew: MeterLineKind = {
    meter: 'crew',
    kind: r.dose.incoming === 0 ? 'calm' : r.dose.received > 0 ? 'hurt' : 'safe',
    blocked: r.dose.blocked,
    received: r.dose.received,
  };
  const science: MeterLineKind = {
    meter: 'science',
    kind: r.scienceGained > 0 ? 'points' : 'none',
    points: r.scienceGained,
  };
  return [battery, air, crew, science];
}

/** The end-screen "What you learned" line: one lesson from the played days. */
export type LessonKind = 'air' | 'storm' | 'calm' | 'mars' | 'good';
export function lessonFor(history: TurnResult[], site: SiteId): LessonKind {
  const last = history.at(-1);
  // A mission lost on air teaches air first, not shields (ux-audit: the old tip blamed shielding).
  if (last?.statusAfter === 'ended' && lossReason(last) === 'air') return 'air';
  if (history.some((r) => r.allocation.life < AIR_MIN_UNITS) && !history.some((r) => r.dose.received >= HURT_THRESHOLD)) {
    return 'air';
  }
  if (history.some((r) => r.dose.received >= HURT_THRESHOLD)) return site === 'mars' ? 'mars' : 'storm';
  const calm = history.filter((r) => r.dose.incoming === 0);
  const wasted = calm.filter((r) => r.allocation.science === 0).length;
  if (calm.length > 0 && wasted * 2 > calm.length) return 'calm';
  return 'good';
}

/** Why a lost mission ended. */
export function lossReason(lastResult: TurnResult | undefined): 'crew' | 'air' {
  return lastResult && lastResult.after.crewHealth <= 0 ? 'crew' : 'air';
}

export function sumUnits(a: Allocation): number {
  return a.life + a.shield + a.science;
}
