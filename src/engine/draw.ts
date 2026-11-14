import { eventSetIdOf } from '../shared/eventSet';
import { MISSION_DAYS, type SolarEvent } from '../shared/types';
import { createRng } from './rng';
import type { EngineRules } from './rules';

export function drawWithRules(
  events: SolarEvent[], seed: number, excludeSetIds: string[], rules: EngineRules,
): SolarEvent[] {
  // Duplicate pool records must not turn into duplicate mission days.
  const unique = [...new Map(events.map(event => [event.id, event])).values()];
  const storms = unique.filter(event => event.kind !== 'QUIET');
  const quiet = unique.filter(event => event.kind === 'QUIET');
  const strong = storms.filter(event => event.severity >= rules.draw.requiredSeverity);
  const minStorms = Math.max(rules.draw.minStorms, MISSION_DAYS - quiet.length);
  const maxStorms = Math.min(rules.draw.maxStorms, storms.length);
  if (storms.length < rules.draw.minStorms) {
    throw new Error(`Event pool needs at least ${rules.draw.minStorms} unique FLR/CME events.`);
  }
  if (minStorms > maxStorms) {
    throw new Error('Event pool has too few unique QUIET days for a complete mission.');
  }
  if (strong.length === 0) {
    throw new Error(`Event pool needs a FLR/CME event with severity >= ${rules.draw.requiredSeverity}.`);
  }
  const excluded = new Set(excludeSetIds);
  for (let attempt = 0; attempt < rules.draw.maxAttempts; attempt++) {
    // Consecutive derived seeds remain deterministic, including across uint32 rollover.
    const rng = createRng(seed + attempt);
    const stormCount = rng.int(minStorms, maxStorms);
    const anchor = rng.pick(strong);
    const selectedStorms = rng.shuffle([
      anchor,
      ...rng.shuffle(storms.filter(event => event.id !== anchor.id)).slice(0, stormCount - 1),
    ]);
    const selectedQuiet = rng.shuffle(quiet).slice(0, MISSION_DAYS - stormCount);

    // Put storms in random gaps around quiet days, with at most two per gap.
    // This guarantees spacing without an unbounded shuffle-until-valid loop.
    const gaps: SolarEvent[][] = Array.from({ length: selectedQuiet.length + 1 }, () => []);
    for (const storm of selectedStorms) {
      const available = gaps.filter(gap => gap.length < rules.draw.maxConsecutiveStorms);
      if (available.length === 0) throw new Error('Draw rules cannot space the storm days.');
      rng.pick(available).push(storm);
    }
    const result = gaps.flatMap((gap, i) => i < selectedQuiet.length ? [...gap, selectedQuiet[i]] : gap);
    if (!excluded.has(eventSetIdOf(result))) return result.map(event => ({ ...event }));
  }
  throw new Error(`Could not draw a new event set after ${rules.draw.maxAttempts} attempts; exclusions exhausted retries.`);
}
