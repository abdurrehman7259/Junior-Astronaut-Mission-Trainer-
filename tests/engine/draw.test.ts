import { describe, expect, it } from 'vitest';
import { drawEventSet, RULES, RULES_BY_SITE, withRules } from '../../src/engine';
import { loadPool, stormTransitions } from '../../scripts/simulate';
import { eventSetIdOf } from '../../src/shared/eventSet';
import { SolarEventSchema } from '../../src/shared/schemas';
import { MISSION_DAYS } from '../../src/shared/types';
import { EVENTS, MARS_EVENTS } from './fixtures/events';
import { deepFreeze } from './helpers';

describe('event drawing', () => {
  it('infers Mars only when every storm has marsImpact, ignoring quiet tags', () => {
    const engine = withRules({ moon: RULES, mars: { ...RULES_BY_SITE.mars,
      draw: { ...RULES_BY_SITE.mars.draw, minStorms: 5, maxStorms: 5 } } });
    // Quiet records remain untagged in MARS_EVENTS; every storm must be tagged.
    const mixed = MARS_EVENTS.map((event, i) => i === 0 ? EVENTS[i] : event);
    const quietTagged = EVENTS.map(event => event.kind === 'QUIET'
      ? { ...event, marsImpact: 'game-only' as const } : event);
    const ids = (events: typeof EVENTS) => events.map(event => event.id);
    for (let seed = 1; seed <= 100; seed++) {
      expect(engine.drawEventSet(MARS_EVENTS, seed, []).filter(event => event.kind !== 'QUIET')).toHaveLength(5);
      for (const pool of [EVENTS, mixed, quietTagged]) {
        expect(ids(engine.drawEventSet(pool, seed, []))).toEqual(ids(drawEventSet(EVENTS, seed, [])));
      }
    }
    expect(() => engine.drawEventSet([], 1, [])).toThrow(/3 unique/);
    expect(() => engine.drawEventSet(quietTagged.filter(event => event.kind === 'QUIET'), 1, []))
      .toThrow(/3 unique/);
  });

  it('keeps Mars storm-after-storm probability within five points of storm-after-quiet', () => {
    const real = loadPool('mars');
    expect(real.label).toContain('public/data/donki-mars-events.json');
    expect(real.label).not.toContain('PROXY');
    for (const pool of [real.events, MARS_EVENTS]) {
      const rates = stormTransitions(pool);
      expect(rates.afterStorm + rates.afterQuiet).toBe(5000 * (MISSION_DAYS - 1));
      expect(rates.stormGivenStorm).toBeGreaterThanOrEqual(rates.stormGivenQuiet - 0.05);
    }
  });

  it('allows three consecutive Mars storms while preserving the count and severity constraints', () => {
    let longest = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const drawn = drawEventSet(MARS_EVENTS, seed, []);
      const storms = drawn.filter(event => event.kind !== 'QUIET');
      expect(storms.length).toBeGreaterThanOrEqual(3);
      expect(storms.length).toBeLessThanOrEqual(5);
      expect(storms.some(event => event.severity >= 2)).toBe(true);
      expect(new Set(drawn.map(event => event.id)).size).toBe(MISSION_DAYS);
      let run = 0;
      for (const event of drawn) {
        run = event.kind === 'QUIET' ? 0 : run + 1;
        longest = Math.max(longest, run);
      }
    }
    expect(longest).toBe(3);
  });

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
