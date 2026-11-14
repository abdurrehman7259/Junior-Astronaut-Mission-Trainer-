import { describe, expect, it } from 'vitest';
import { drawEventSet, RULES, withRules } from '../../src/engine';
import { eventSetIdOf } from '../../src/shared/eventSet';
import { SolarEventSchema } from '../../src/shared/schemas';
import { MISSION_DAYS } from '../../src/shared/types';
import { EVENTS } from './fixtures/events';
import { deepFreeze } from './helpers';

describe('event drawing', () => {
  it('matches exact uniform-layout marginal storm rates within three percentage points', () => {
    // Independent exhaustive bit-mask enumeration: first choose 3, 4 or 5 storms
    // equally, then choose uniformly among valid layouts for that count.
    const expected = Array<number>(MISSION_DAYS).fill(0);
    for (let storms = RULES.draw.minStorms; storms <= RULES.draw.maxStorms; storms++) {
      const layouts: boolean[][] = [];
      for (let mask = 0; mask < 2 ** MISSION_DAYS; mask++) {
        const days = Array.from({ length: MISSION_DAYS }, (_, day) => Boolean(mask & (1 << day)));
        if (days.filter(Boolean).length !== storms) continue;
        if (days.some((_, day) => days.slice(day, day + RULES.draw.maxConsecutiveStorms + 1)
          .filter(Boolean).length > RULES.draw.maxConsecutiveStorms)) continue;
        layouts.push(days);
      }
      for (let day = 0; day < MISSION_DAYS; day++) {
        expected[day] += layouts.filter(layout => layout[day]).length / layouts.length
          / (RULES.draw.maxStorms - RULES.draw.minStorms + 1);
      }
    }
    const counts = Array<number>(MISSION_DAYS).fill(0);
    const draws = 10000;
    for (let seed = 0; seed < draws; seed++) {
      drawEventSet(EVENTS, seed, []).forEach((event, day) => {
        if (event.kind !== 'QUIET') counts[day]++;
      });
    }
    counts.forEach((count, day) => expect(Math.abs(count / draws - expected[day])).toBeLessThanOrEqual(0.03));
  });
  it('has a schema-valid synthetic fixture covering all requested event kinds and severities', () => {
    EVENTS.forEach(event => SolarEventSchema.parse(event));
    expect(EVENTS.every(event => event.id.startsWith('FIXTURE-'))).toBe(true);
    expect(EVENTS.filter(event => event.kind !== 'QUIET').length).toBeGreaterThanOrEqual(8);
    expect(EVENTS.filter(event => event.kind === 'QUIET').length).toBeGreaterThanOrEqual(12);
    for (const kind of ['FLR', 'CME']) {
      for (const severity of [1, 2, 3]) {
        expect(EVENTS.some(event => event.kind === kind && event.severity === severity)).toBe(true);
      }
    }
  });

  it('obeys composition, spacing, uniqueness, determinism and last-three exclusions over 500 seeds', () => {
    const pool = deepFreeze(structuredClone(EVENTS));
    const seenCounts = new Set<number>();
    let exclusions: string[] = [];
    for (let seed = 0; seed < 500; seed++) {
      const frozenExclusions = deepFreeze([...exclusions]);
      const set = drawEventSet(pool, seed, frozenExclusions);
      expect(drawEventSet(pool, seed, frozenExclusions)).toEqual(set);
      expect(set).toHaveLength(MISSION_DAYS);
      expect(new Set(set.map(event => event.id)).size).toBe(MISSION_DAYS);
      const stormCount = set.filter(event => event.kind !== 'QUIET').length;
      seenCounts.add(stormCount);
      expect(stormCount).toBeGreaterThanOrEqual(3);
      expect(stormCount).toBeLessThanOrEqual(5);
      expect(set.some(event => event.severity >= 2)).toBe(true);
      expect(exclusions).not.toContain(eventSetIdOf(set));
      let streak = 0;
      for (const event of set) {
        SolarEventSchema.parse(event);
        expect(pool).toContainEqual(event);
        streak = event.kind === 'QUIET' ? 0 : streak + 1;
        expect(streak).toBeLessThanOrEqual(2);
      }
      exclusions = [...exclusions, eventSetIdOf(set)].slice(-3);
    }
    expect([...seenCounts].sort()).toEqual([3, 4, 5]);
    expect(pool).toEqual(EVENTS);
  }, 30000);

  it('retries when the current seed is excluded and has a bounded failure', () => {
    const excluded: string[] = [];
    for (let attempt = 0; attempt < RULES.draw.maxAttempts; attempt++) {
      const set = drawEventSet(EVENTS, 9, excluded);
      expect(excluded).not.toContain(eventSetIdOf(set));
      excluded.push(eventSetIdOf(set));
    }
    expect(() => drawEventSet(EVENTS, 9, excluded)).toThrow(/128 attempts/);
  });

  it('accepts feasible sparse pools and removes duplicate ids before selection', () => {
    const storms = EVENTS.filter(event => event.kind !== 'QUIET');
    const quiet = EVENTS.filter(event => event.kind === 'QUIET');
    for (const [stormCount, quietCount] of [[3, 7], [4, 6], [5, 5]]) {
      const pool = [...storms.slice(0, stormCount), ...quiet.slice(0, quietCount)];
      for (let seed = 0; seed < 20; seed++) {
        const set = drawEventSet([...pool, ...pool], seed, []);
        expect(set.filter(event => event.kind !== 'QUIET')).toHaveLength(stormCount);
        expect(new Set(set.map(event => event.id)).size).toBe(MISSION_DAYS);
      }
    }
  });

  it('gives clear failures for impossible pools', () => {
    const quiet = EVENTS.filter(event => event.kind === 'QUIET');
    const storms = EVENTS.filter(event => event.kind !== 'QUIET');
    expect(() => drawEventSet([], 1, [])).toThrow(/3 unique FLR\/CME/);
    expect(() => drawEventSet([...quiet, ...storms.slice(0, 2)], 1, [])).toThrow(/FLR\/CME/);
    expect(() => drawEventSet([...storms, ...quiet.slice(0, 4)], 1, [])).toThrow(/QUIET/);
    expect(() => drawEventSet([...storms.slice(0, 3), ...quiet.slice(0, 6)], 1, [])).toThrow(/QUIET/);
    expect(() => drawEventSet(EVENTS.map(event => event.kind === 'QUIET' ? event : { ...event, severity: 1 }), 1, []))
      .toThrow(/severity >= 2/);
    expect(() => drawEventSet([...quiet, ...Array.from({ length: 8 }, () => storms[0])], 1, []))
      .toThrow(/unique FLR\/CME/);
    const impossibleSpacing = withRules({ ...RULES, draw: { ...RULES.draw, maxConsecutiveStorms: 0 } });
    expect(() => impossibleSpacing.drawEventSet(EVENTS, 1, [])).toThrow(/space the storm days/);
  });

  it('returns detached event records', () => {
    const set = drawEventSet(deepFreeze(structuredClone(EVENTS)), 3, []);
    set[0].kidText = 'Changed output';
    expect(EVENTS.some(event => event.kidText === 'Changed output')).toBe(false);
  });
});
