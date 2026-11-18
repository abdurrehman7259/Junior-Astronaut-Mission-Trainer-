/**
 * Pure helpers for the teaching report (P6, D-038). They read only the TurnResult the engine already returns.
 * No engine change: the engine rules stay in src/engine; the one rule value used here is pinned by a test.
 */

/** Game rule mirror: life units needed to avoid losing air (RULES.lifeSupportMinUnits; see tests/ui/verdict.test.js). */
export const AIR_MIN_UNITS = 4;
/** Received radiation at or above this counts as "hurt" (game units). Below it, shields blocked most. */
export const HURT_THRESHOLD = 10;
/** Battery at or below this after a day gets a warning before it runs out (cold-start test: it drained silently). */
export const BATTERY_LOW = 20;

/** Shields were really too low: much got through AND they did not block more than got through. */
function shieldsTooLow(r) {
  return r.dose.received >= HURT_THRESHOLD && r.dose.blocked <= r.dose.received;
}

export function verdictFor(r, _site = 'moon') {
  const storm = r.dose.incoming > 0;
  if (r.statusAfter === 'ended') return r.after.crewHealth <= 0 ? 'lostCrew' : 'lostAir';
  // No shields at all on a storm day: say so plainly (cold-start round 2).
  if (storm && r.allocation.shield === 0 && r.dose.received >= HURT_THRESHOLD) return 'noShields';
  // An empty battery weakens shields: blame the battery, and only mention shields when it was a storm with shields up.
  if (r.after.power === 0) return storm && r.allocation.shield > 0 ? 'batteryEmpty' : 'batteryEmptyCalm';
  if (storm && shieldsTooLow(r)) return 'hurt';
  // Too little air ends missions, so it beats every softer verdict.
  if (r.allocation.life === 0) return 'airNone';
  if (r.allocation.life < AIR_MIN_UNITS) return 'airLow';
  if (storm && r.dose.received >= HURT_THRESHOLD) return 'bigStorm';
  if (r.after.power <= BATTERY_LOW) return 'batteryLow';
  if (storm) return r.dose.received === 0 ? 'blocked' : 'mostlyBlocked';
  if (r.allocation.shield > 0) return 'shieldsWasted';
  return r.allocation.science > 0 ? 'calmScience' : 'calmNoScience';
}

/** One line per meter, in report order: battery, air, crew, science. */
export function meterLinesFor(r) {
  const dp = r.after.power - r.before.power;
  const da = r.after.lifeSupport - r.before.lifeSupport;
  const battery = {
    meter: 'battery',
    kind: r.after.power === 0 ? 'empty' : dp < 0 ? 'down' : dp > 0 ? 'up' : 'same',
  };
  const air = {
    meter: 'air',
    kind:
      r.allocation.life < AIR_MIN_UNITS ? (da < 0 ? 'shortDown' : 'short') : da < 0 ? 'down' : da > 0 ? 'up' : 'same',
    units: r.allocation.life,
  };
  const crew = {
    meter: 'crew',
    kind: r.dose.incoming === 0 ? 'calm' : r.dose.received > 0 ? 'hurt' : 'safe',
    blocked: r.dose.blocked,
    received: r.dose.received,
  };
  const science = {
    meter: 'science',
    kind: r.scienceGained > 0 ? 'points' : 'none',
    points: r.scienceGained,
  };
  return [battery, air, crew, science];
}

/** The end-screen "What you learned" line: one lesson from the played days. */
export function lessonFor(history, site) {
  const last = history.at(-1);
  // A mission lost on air teaches air first, not shields (ux-audit: the old tip blamed shielding).
  if (last?.statusAfter === 'ended' && lossReason(last) === 'air') return 'air';
  if (
    history.some((r) => r.allocation.life < AIR_MIN_UNITS) &&
    !history.some((r) => r.dose.received >= HURT_THRESHOLD)
  ) {
    return 'air';
  }
  if (history.some((r) => r.after.power > 0 && shieldsTooLow(r))) return site === 'mars' ? 'mars' : 'storm';
  if (history.some((r) => r.after.power === 0)) return 'battery';
  if (history.some((r) => r.dose.received >= HURT_THRESHOLD)) return site === 'mars' ? 'mars' : 'storm';
  const calm = history.filter((r) => r.dose.incoming === 0);
  const wasted = calm.filter((r) => r.allocation.science === 0).length;
  if (calm.length > 0 && wasted * 2 > calm.length) return 'calm';
  return 'good';
}

/** Why a lost mission ended. */
export function lossReason(lastResult) {
  return lastResult && lastResult.after.crewHealth <= 0 ? 'crew' : 'air';
}

export function sumUnits(a) {
  return a.life + a.shield + a.science;
}
