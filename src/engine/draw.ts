import { eventSetIdOf } from '../shared/eventSet';
import { MISSION_DAYS, type SolarEvent } from '../shared/types';
import { createRng } from './rng';
import type { EngineRules } from './rules';

// Enumerate equally likely valid position masks, rather than weighting quiet-day gaps.
const positionCache = new Map<string, boolean[][]>();
function positions(count: number, maxRun: number): boolean[][] {
  const key = `${count}:${maxRun}`;
  const cached = positionCache.get(key);
  if (cached) return cached;
  const result: boolean[][] = [];
  function visit(prefix: boolean[], remaining: number, run: number) {
    if (remaining < 0 || remaining > MISSION_DAYS - prefix.length) return;
    if (prefix.length === MISSION_DAYS) {
      result.push(prefix);
      return;
    }
    visit([...prefix, false], remaining, 0);
    if (remaining > 0 && run < maxRun) visit([...prefix, true], remaining - 1, run + 1);
  }
  visit([], count, 0);
  positionCache.set(key, result);
  return result;
}

const weightCache = new Map<string, number[]>();
function choosePositions(count: number, rules: EngineRules, rng: ReturnType<typeof createRng>): boolean[] {
  const { maxConsecutiveStorms, consecutiveStormWeight } = rules.draw;
  const masks = positions(count, maxConsecutiveStorms);
  if (masks.length === 0) throw new Error('Draw rules cannot space the storm days.');
  // Preserve Moon's uniform selection and seeded output exactly.
  if (consecutiveStormWeight === 1) return rng.pick(masks);
  const key = `${count}:${maxConsecutiveStorms}:${consecutiveStormWeight}`;
  let cumulative = weightCache.get(key);
  if (!cumulative) {
    let total = 0;
    cumulative = masks.map(mask => {
      const pairs = mask.reduce((sum, storm, day) => sum + Number(storm && day > 0 && mask[day - 1]), 0);
      total += consecutiveStormWeight ** pairs;
      return total;
    });
    weightCache.set(key, cumulative);
  }
  const ticket = rng.next() * cumulative[cumulative.length - 1];
  return masks[cumulative.findIndex(weight => ticket < weight)];
}

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

    const mask = choosePositions(stormCount, rules, rng);
    let stormIndex = 0;
    let quietIndex = 0;
    const result = mask.map(storm => storm
      ? selectedStorms[stormIndex++] : selectedQuiet[quietIndex++]);
    if (!excluded.has(eventSetIdOf(result))) return result.map(event => ({ ...event }));
  }
  throw new Error(`Could not draw a new event set after ${rules.draw.maxAttempts} attempts; exclusions exhausted retries.`);
}
