import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { balanceTargets, evaluate, MISSION_COUNT, simulate } from '../../scripts/simulate';
import { fixed } from '../../scripts/lib/strategies';
import { RULES, withRules } from '../../src/engine';
import { DonkiSnapshotSchema } from '../../src/shared/schemas';
import { EVENTS } from './fixtures/events';

const TEST_MISSIONS = 300;
const realPath = new URL('../../public/data/donki-events.json', import.meta.url);
const real = existsSync(realPath)
  ? DonkiSnapshotSchema.parse(JSON.parse(readFileSync(realPath, 'utf8'))).items : undefined;
if (!real) console.warn('Skipping real DONKI balance only: public/data/donki-events.json is missing.');

for (const [name, pool] of [['fixture', EVENTS], ['real DONKI', real]] as const) {
  describe.skipIf(!pool)(`US-03 balance, ${name}, seeds 1-${TEST_MISSIONS}`, () => {
    let result: ReturnType<typeof simulate>;
    beforeAll(() => { result = simulate(pool!, RULES, TEST_MISSIONS); }, 15000);

    it('samples all 66 fixed allocations, keeping the full simulator at 1000 missions', () => {
      expect(result.fixedResults).toHaveLength(66);
      expect(MISSION_COUNT).toBeGreaterThanOrEqual(1000);
      for (const row of [...result.rows, ...result.fixedResults]) expect(row.missions).toBe(TEST_MISSIONS);
    });
    it('target 1: extreme allocations lose or earn no science', () => {
      expect(balanceTargets(result).extremes).toBe(true);
    });
    it('target 2: no fixed allocation combines 95% wins with near-adaptive science', () => {
      expect(balanceTargets(result).noDominantFixed).toBe(true);
    });
    it('target 3: the unchanged UI default wins less than 90%', () => {
      expect(balanceTargets(result).defaultNeedsChoices).toBe(true);
    });
    it('target 4: a reliable adaptive policy earns at least 25% more than every reliable fixed plan', () => {
      expect(result.reliableFixed.length).toBeGreaterThan(0);
      expect(balanceTargets(result).adaptiveAdvantage).toBe(true);
    });
    it('target 5: adaptive play remains winnable but can lose', () => {
      expect(balanceTargets(result).adaptiveCanLose).toBe(true);
    });
    it('target 6: both sensible kid heuristics win at least 90%', () => {
      expect(result.rows.filter(row => row.name.startsWith('kid '))).toHaveLength(2);
      expect(balanceTargets(result).kidFriendly).toBe(true);
    });
    it('battery costs change mission wins, not just the displayed power meter', () => {
      const freePower = { ...RULES, powerCostPerShieldUnit: 0, powerCostPerScienceUnit: 0 };
      const engine = withRules(freePower);
      const starts = Array.from({ length: TEST_MISSIONS }, (_, i) =>
        engine.createGame(i + 1, engine.drawEventSet(pool!, i + 1, [])));
      const free = evaluate('free equipment', fixed({ life: 4, shield: 3, science: 3 }), starts, freePower);
      const normal = result.rows.find(row => row.name.startsWith('balanced'))!;
      expect(free.wins).toBeGreaterThan(normal.wins);
      expect(free.meanScience).toBeGreaterThan(normal.meanScience);
    }, 30000);
  });
}
