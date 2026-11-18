import { describe, expect, it } from 'vitest';
import { applyTurn, createGame, previewTurn, RULES, RULES_BY_SITE, withRules } from '../../src/engine/index.js';
import { GameStateSchema, TurnExplanationsSchema } from '../../src/shared/schemas.js';
import { SITE_IDS } from '../../src/shared/sites.js';
import { MISSION_DAYS } from '../../src/shared/types.js';
import { allocations, balanced, daysOf } from './helpers.js';

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
      expect(turn.state.meters.lifeSupport).toBe(
        Math.max(
          0,
          Math.min(
            100,
            state.meters.lifeSupport + recovery - shortfall * RULES.lifeSupportDrainPerMissingUnit - brownout,
          ),
        ),
      );
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
    expect(unfunded.explanations.power).toBe('The battery ran out, so your shield was weaker.');
    expect(unfunded.explanations.science).toContain('Low power meant less science');
    const noRecharge = withRules({ ...RULES, powerRechargePerDay: 0 });
    const stopped = noRecharge.previewTurn(empty, balanced);
    expect(stopped.dose.blocked).toBe(0);
    expect(stopped.scienceGained).toBe(0);
    expect(noRecharge.previewTurn(empty, { life: 10, shield: 0, science: 0 }).after.lifeSupport).toBeGreaterThan(
      empty.meters.lifeSupport,
    );
  });

  it('keeps all 66 allocations across severities, meters and final days grammatical and schema-valid', () => {
    // Include no-recharge states: funded fractions must exercise both 0 and 1 point.
    const gains = new Set();
    for (const site of SITE_IDS) {
      const rules = RULES_BY_SITE[site];
      for (const engine of [withRules(rules), withRules({ ...rules, powerRechargePerDay: 0 })]) {
        for (const [kind, severity] of [
          ['QUIET', 0],
          ['FLR', 1],
          ['FLR', 2],
          ['FLR', 3],
          ['CME', 1],
          ['CME', 2],
          ['CME', 3],
        ]) {
          for (const meters of [
            { power: 100, lifeSupport: 100, crewHealth: 100 },
            { power: 0, lifeSupport: 20, crewHealth: 20 },
            { power: 1, lifeSupport: 1, crewHealth: 1 },
            { power: 65, lifeSupport: 80, crewHealth: 90 },
          ]) {
            for (const day of [1, MISSION_DAYS]) {
              const state = engine.createGame(1, daysOf(kind, severity), site);
              state.meters = meters;
              state.day = day;
              if (meters.power === 1)
                state.carryOver = [
                  { id: 'earlier', dueDay: day, meter: 'lifeSupport', delta: -1, reason: 'Earlier air shortage.' },
                ];
              for (const allocation of allocations) {
                const turn = engine.applyTurn(state, allocation);
                const { explanations, scienceGained } = turn.result;
                if (explanations.science.startsWith('Low power')) gains.add(scienceGained);
                TurnExplanationsSchema.parse(explanations);
                expect(
                  Object.values(explanations)
                    .join(' ')
                    .match(/Battery empty!/g)?.length ?? 0,
                ).toBeLessThanOrEqual(1);
                for (const line of [
                  ...Object.values(explanations),
                  ...turn.state.carryOver.map((effect) => effect.reason),
                ]) {
                  expect(line.trim().split(/\s+/).length).toBeLessThanOrEqual(15);
                  expect(line).not.toMatch(/\b(hurt|hit)\b/i);
                  if (site === 'mars') expect(line).not.toMatch(/day|tomorrow/i);
                }
                if (site === 'mars') expect(explanations.science).toContain('this sol');
                expect(explanations.science).not.toMatch(/\b1 science points\b/);
                expect(explanations.science).not.toMatch(/\b(?:0|[2-9]|\d{2,}) science point\b/);
                if (severity === 0) expect(explanations.power).not.toContain('shield was weaker');
                if (severity > 0 && allocation.shield === 0) {
                  expect(explanations.crewHealth).toBe(
                    `Shield was off, so all ${RULES.dosePerSeverity[severity]} game dose reached the crew.`,
                  );
                }
                expect(explanations.lifeSupport).not.toContain('Only 0');
                if (meters.lifeSupport === 100) expect(explanations.lifeSupport).not.toContain('helped restore');
                if (allocation.science + allocation.shield === 0)
                  expect(explanations.power).not.toContain('used reserve');
              }
            }
          }
        }
      }
    }
    expect(gains.has(0)).toBe(true);
    expect(gains.has(1)).toBe(true);
    const state = createGame(1, daysOf('QUIET'));
    expect(previewTurn(state, { life: 9, shield: 0, science: 1 }).explanations.science).toContain(
      '1 science unit earned',
    );
    expect(previewTurn(state, { life: 8, shield: 0, science: 2 }).explanations.science).toContain(
      '2 science units earned',
    );
    expect(previewTurn(state, { life: 0, shield: 0, science: 10 }).explanations.lifeSupport).toContain(
      'No power for air!',
    );
  }, 20000);

  it('warns about queued brownouts in the air line, including underfunding and exact zero', () => {
    for (const allocation of [balanced, { life: 4, shield: 0, science: 6 }]) {
      const cost =
        allocation.shield * RULES.powerCostPerShieldUnit + allocation.science * RULES.powerCostPerScienceUnit;
      for (const power of [0, cost - RULES.powerRechargePerDay]) {
        const state = createGame(1, daysOf('QUIET'));
        state.meters.power = power;
        // Today's due loss must not hide tomorrow's newly queued brownout.
        state.carryOver = [{ id: 'earlier', dueDay: 1, meter: 'lifeSupport', delta: -15, reason: 'Earlier shortage.' }];
        const turn = applyTurn(state, allocation);
        expect(turn.state.carryOver.some((effect) => effect.id === 'brownout-1')).toBe(true);
        expect(turn.result.explanations.lifeSupport).toBe('Air will drop tomorrow because the battery ran out.');
        expect(previewTurn(state, allocation)).toEqual(turn.result);
      }
    }
  });

  it('prioritizes an air shortfall before day 10 and mentions both final-day losses', () => {
    for (const life of [0, 1, 3, 4]) {
      const state = createGame(1, daysOf('QUIET'));
      state.meters.power = 0;
      const allocation = { life, shield: 0, science: 10 - life };
      const early = applyTurn(state, allocation);
      expect(early.result.explanations.lifeSupport).toContain('tomorrow');
      if (life < 4) expect(early.result.explanations.lifeSupport).toContain('air');
      state.day = MISSION_DAYS;
      const final = applyTurn(state, allocation);
      expect(final.result.explanations.lifeSupport).toBe(
        life < 4
          ? 'Too little power for air and an empty battery reduced air today.'
          : 'An empty battery reduced air today.',
      );
      expect(final.state.carryOver).toEqual([]);
      expect(final.state.meters.lifeSupport).toBe(
        state.meters.lifeSupport - (4 - life) * RULES.lifeSupportDrainPerMissingUnit - RULES.brownoutLifeSupportDrain,
      );
    }
  });
});
