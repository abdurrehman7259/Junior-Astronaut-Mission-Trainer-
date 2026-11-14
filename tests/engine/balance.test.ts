import { beforeAll, describe, expect, it } from 'vitest';
import { balanceTargets, evaluate, MISSION_COUNT, simulate } from '../../scripts/simulate';
import { fixed } from '../../scripts/lib/strategies';
import { RULES, withRules } from '../../src/engine';
import { EVENTS } from './fixtures/events';

let result: ReturnType<typeof simulate>;
beforeAll(() => { result = simulate(EVENTS, RULES); }, 180000);

describe('US-03 balance, fixture seeds 1-1000', () => {
  it('samples all 66 fixed allocations and at least 1000 missions per policy', () => {
    expect(result.fixedResults).toHaveLength(66);
    expect(MISSION_COUNT).toBeGreaterThanOrEqual(1000);
    for (const row of [...result.rows, ...result.fixedResults]) expect(row.missions).toBe(MISSION_COUNT);
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
    expect(result.bestAdaptive.winPercent).toBeGreaterThanOrEqual(85);
    expect(result.bestAdaptive.winPercent).toBeLessThan(100);
  });
  it('battery costs change mission wins, not just the displayed power meter', () => {
    const freePower = { ...RULES, powerCostPerShieldUnit: 0, powerCostPerScienceUnit: 0 };
    const engine = withRules(freePower);
    const starts = Array.from({ length: MISSION_COUNT }, (_, i) =>
      engine.createGame(i + 1, engine.drawEventSet(EVENTS, i + 1, [])));
    const free = evaluate('free equipment', fixed({ life: 4, shield: 3, science: 3 }), starts, freePower);
    const normal = result.rows.find(row => row.name.startsWith('balanced'))!;
    expect(free.wins).toBeGreaterThan(normal.wins);
    expect(free.meanScience).toBeGreaterThan(normal.meanScience);
  }, 30000);
});
