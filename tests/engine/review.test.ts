import { describe, expect, it } from 'vitest';
import { applyTurn, createGame, previewTurn, RULES, withRules } from '../../src/engine';
import { GameStateSchema, TurnExplanationsSchema } from '../../src/shared/schemas';
import { MISSION_DAYS } from '../../src/shared/types';
import { allocations, balanced, daysOf } from './helpers';

describe('B2 review regressions', () => {
  it('normalizes every numeric seed to a schema-valid uint32', () => {
    for (const seed of [-1, 2 ** 40, 1.5, NaN, Infinity, -Infinity]) {
      const state = createGame(seed, daysOf('QUIET'));
      expect(state.seed).toBe(seed >>> 0);
      GameStateSchema.parse(state);
    }
  });

  it('lands final-day air shortages and brownouts immediately, with no day 11 effects', () => {
    for (const allocation of allocations) {
      const state = createGame(1, daysOf('QUIET'));
      state.day = MISSION_DAYS;
      state.meters.power = 0;
      const turn = applyTurn(state, allocation);
      expect(turn.state.carryOver).toEqual([]);
      expect(Object.values(turn.result.explanations).join(' ')).not.toContain('tomorrow');
      const shortfall = Math.max(0, RULES.lifeSupportMinUnits - allocation.life);
      const recovery = Math.max(0, allocation.life - RULES.lifeSupportMinUnits) * RULES.lifeSupportRecoveryPerExtraUnit;
      const brownout = turn.state.meters.power === 0 ? RULES.brownoutLifeSupportDrain : 0;
      expect(turn.state.meters.lifeSupport).toBe(Math.max(0, Math.min(100,
        state.meters.lifeSupport + recovery - shortfall * RULES.lifeSupportDrainPerMissingUnit - brownout)));
    }
    const state = createGame(1, daysOf('QUIET'));
    state.day = MISSION_DAYS;
    const turn = applyTurn(state, { life: 0, shield: 0, science: 10 });
    expect(turn.state.meters.lifeSupport).toBeLessThan(state.meters.lifeSupport);
    expect(turn.result.explanations.lifeSupport).toBe('Too little power for air today.');
  });

  it('reduces both shield protection and science when reserve cannot fund equipment', () => {
    const full = createGame(1, daysOf('FLR', 3));
    const empty = { ...full, meters: { ...full.meters, power: 0 } };
    const funded = previewTurn(full, balanced);
    const unfunded = previewTurn(empty, balanced);
    expect(unfunded.dose.blocked).toBeLessThan(funded.dose.blocked);
    expect(unfunded.scienceGained).toBeLessThan(funded.scienceGained);
    expect(unfunded.after.crewHealth).toBeLessThan(funded.after.crewHealth);
    expect(unfunded.explanations.power).toBe('Battery empty! Your shield was weaker.');
    expect(unfunded.explanations.science).toContain('worked less');
    const noRecharge = withRules({ ...RULES, powerRechargePerDay: 0 });
    const stopped = noRecharge.previewTurn(empty, balanced);
    expect(stopped.dose.blocked).toBe(0);
    expect(stopped.scienceGained).toBe(0);
    expect(noRecharge.previewTurn(empty, { life: 10, shield: 0, science: 0 }).after.lifeSupport)
      .toBeGreaterThan(empty.meters.lifeSupport);
  });

  it('keeps all 66 allocations across severities, meters and final days grammatical and schema-valid', () => {
    for (const severity of [0, 1, 2, 3] as const) {
      for (const meters of [
        { power: 100, lifeSupport: 100, crewHealth: 100 },
        { power: 0, lifeSupport: 20, crewHealth: 20 },
        { power: 1, lifeSupport: 1, crewHealth: 1 },
        { power: 65, lifeSupport: 80, crewHealth: 90 },
      ]) {
        for (const day of [1, MISSION_DAYS]) {
          const state = createGame(1, daysOf(severity === 0 ? 'QUIET' : 'FLR', severity));
          state.meters = meters;
          state.day = day;
          for (const allocation of allocations) {
            const { explanations } = previewTurn(state, allocation);
            TurnExplanationsSchema.parse(explanations);
            expect(explanations.lifeSupport).not.toContain('Only 0');
            if (meters.lifeSupport === 100) expect(explanations.lifeSupport).not.toContain('helped restore');
            if (allocation.science + allocation.shield === 0) expect(explanations.power).not.toContain('used reserve');
          }
        }
      }
    }
    const state = createGame(1, daysOf('QUIET'));
    expect(previewTurn(state, { life: 9, shield: 0, science: 1 }).explanations.science).toContain('1 science unit earned');
    expect(previewTurn(state, { life: 8, shield: 0, science: 2 }).explanations.science).toContain('2 science units earned');
    expect(previewTurn(state, { life: 0, shield: 0, science: 10 }).explanations.lifeSupport).toContain('No power for air!');
  });
});
