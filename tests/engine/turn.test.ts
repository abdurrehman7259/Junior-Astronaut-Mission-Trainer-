import { describe, expect, it } from 'vitest';
import { applyTurn, createGame, drawEventSet, previewTurn, RULES, withRules } from '../../src/engine';
import { createRng } from '../../src/engine/rng';
import { eventSetIdOf } from '../../src/shared/eventSet';
import { GameStateSchema, TurnResultSchema } from '../../src/shared/schemas';
import { MISSION_DAYS, type Allocation, type MeterKey } from '../../src/shared/types';
import { EVENTS } from './fixtures/events';
import { allocations, balanced, daysOf, deepFreeze } from './helpers';

describe('turn resolution', () => {
  it('creates a detached starting state, with empty history and carry-over', () => {
    const events = deepFreeze(drawEventSet(EVENTS, 5, []));
    const state = createGame(5, events);
    expect(state).toMatchObject({
      seed: 5, day: 1, status: 'playing', history: [], carryOver: [], scienceScore: 0,
      meters: { power: RULES.start.power, lifeSupport: RULES.start.lifeSupport, crewHealth: RULES.start.crewHealth },
      eventSetId: eventSetIdOf(events), events,
    });
    state.events[0].kidText = 'Changed output';
    expect(events[0].kidText).not.toBe('Changed output');
    for (const length of [0, 9, 11]) {
      expect(() => createGame(5, EVENTS.slice(0, length))).toThrow(RangeError);
    }
  });

  it('accepts all 66 whole allocations and rejects malformed numbers or sums', () => {
    const state = deepFreeze(createGame(1, daysOf('FLR', 3)));
    expect(allocations).toHaveLength(66);
    for (const allocation of allocations) {
      const frozen = deepFreeze({ ...allocation });
      const { result, state: next } = applyTurn(state, frozen);
      expect(previewTurn(state, frozen)).toEqual(result);
      expect(result.allocation).toEqual(allocation);
      TurnResultSchema.parse(result);
      GameStateSchema.parse(next);
    }
    const invalid: Allocation[] = [
      { life: 0, shield: 0, science: 0 }, { life: 5, shield: 5, science: 5 },
      { life: -1, shield: 5, science: 6 }, { life: 11, shield: 0, science: -1 },
      { life: 2.5, shield: 2.5, science: 5 }, { life: NaN, shield: 5, science: 5 },
      { life: Infinity, shield: 0, science: 0 },
    ];
    for (const allocation of invalid) {
      expect(() => previewTurn(state, allocation)).toThrow(RangeError);
      expect(() => applyTurn(state, allocation)).toThrow(RangeError);
    }
  });

  it('scales low-air penalties with shortfall and applies them only the next day', () => {
    const start = createGame(1, daysOf('QUIET'));
    for (let life = 0; life < RULES.lifeSupportMinUnits; life++) {
      const first = applyTurn(deepFreeze(start), { life, shield: 0, science: 10 - life });
      expect(first.state.meters.lifeSupport).toBe(start.meters.lifeSupport);
      expect(first.state.carryOver).toEqual([{
        id: 'air-1', dueDay: 2, meter: 'lifeSupport',
        delta: -(RULES.lifeSupportMinUnits - life) * RULES.lifeSupportDrainPerMissingUnit,
        reason: expect.any(String),
      }]);
      expect(first.result.explanations.lifeSupport).toContain('tomorrow');
      const second = applyTurn(deepFreeze(first.state), balanced);
      expect(second.state.meters.lifeSupport).toBe(start.meters.lifeSupport
        - (RULES.lifeSupportMinUnits - life) * RULES.lifeSupportDrainPerMissingUnit);
      expect(second.state.carryOver.some(effect => effect.id === 'air-1')).toBe(false);
      expect(second.result.explanations.lifeSupport).toContain('Earlier');
      const third = applyTurn(second.state, balanced);
      expect(third.state.meters.lifeSupport).toBe(second.state.meters.lifeSupport);
    }
  });

  it('keeps future effects pending and combines multiple due effects with today’s recovery', () => {
    const start = createGame(1, daysOf('QUIET'));
    start.day = 2;
    start.carryOver = [
      { id: 'air-1', dueDay: 2, meter: 'lifeSupport', delta: -10, reason: 'Earlier air shortage.' },
      { id: 'brownout-1', dueDay: 2, meter: 'lifeSupport', delta: -6, reason: 'Earlier battery shortage.' },
      { id: 'future', dueDay: 4, meter: 'lifeSupport', delta: -8, reason: 'Future air shortage.' },
    ];
    const { state, result } = applyTurn(deepFreeze(start), { life: 6, shield: 2, science: 2 });
    expect(state.meters.lifeSupport).toBe(start.meters.lifeSupport - 16 + 2 * RULES.lifeSupportRecoveryPerExtraUnit);
    expect(state.carryOver).toEqual([start.carryOver[2]]);
    expect(result.explanations.lifeSupport).toContain('Earlier');
    const lowAir = applyTurn(start, { life: 2, shield: 4, science: 4 });
    expect(lowAir.result.explanations.lifeSupport).toContain('tomorrow');
    TurnResultSchema.parse(lowAir.result);
  });

  it('applies due effects for any contracted meter', () => {
    const state = createGame(1, daysOf('QUIET'));
    state.carryOver = [
      { id: 'health', dueDay: 1, meter: 'crewHealth', delta: -7, reason: 'Earlier health loss.' },
      { id: 'battery', dueDay: 1, meter: 'power', delta: -9, reason: 'Earlier power loss.' },
    ];
    const turn = applyTurn(deepFreeze(state), balanced);
    expect(turn.result.deltas.crewHealth).toBe(-7);
    expect(turn.result.deltas.power).toBe(RULES.powerRechargePerDay - 9
      - 3 * RULES.powerCostPerShieldUnit - 3 * RULES.powerCostPerScienceUnit);
    expect(turn.state.carryOver).toEqual([]);
    TurnResultSchema.parse(turn.result);
  });

  it('computes game dose, protects more with more shields, and leaves residual strong dose', () => {
    for (const severity of [1, 2, 3] as const) {
      const state = createGame(1, daysOf('FLR', severity));
      const doses = Array.from({ length: 11 }, (_, shield) =>
        previewTurn(state, { life: 10 - shield, shield, science: 0 }).dose);
      for (let shield = 0; shield <= 10; shield++) {
        const dose = doses[shield];
        expect(dose.incoming).toBe(RULES.dosePerSeverity[severity]);
        expect(dose.incoming).toBe(dose.blocked + dose.received);
        expect(dose.received).toBeGreaterThan(0);
        if (shield > 0) expect(dose.received).toBeLessThanOrEqual(doses[shield - 1].received);
      }
      expect(doses[0].blocked).toBe(0);
      expect(doses[3].blocked).toBe(Math.floor(doses[3].incoming / 2));
      // The first three shields block more than the next three (diminishing returns).
      expect(doses[3].blocked).toBeGreaterThan(doses[6].blocked - doses[3].blocked);
      expect(doses[10].blocked).toBeGreaterThan(doses[10].incoming / 2);
    }
    expect(previewTurn(createGame(1, daysOf('QUIET')), balanced).dose).toEqual({ incoming: 0, blocked: 0, received: 0 });
  });

  it('requires a substantial science versus health trade-off on a strong storm', () => {
    const state = createGame(1, daysOf('FLR', 3));
    const turns = allocations.map(allocation => previewTurn(state, allocation));
    const minimumDose = Math.min(...turns.map(turn => turn.dose.received));
    const protectedTurns = turns.filter(turn => turn.dose.received === minimumDose);
    const scienceTurn = turns.reduce((best, turn) => turn.scienceGained > best.scienceGained ? turn : best);
    expect(Math.max(...protectedTurns.map(turn => turn.scienceGained)))
      .toBeLessThanOrEqual(scienceTurn.scienceGained * 0.25);
    expect(-scienceTurn.deltas.crewHealth).toBeGreaterThanOrEqual(20);
    expect(scienceTurn.dose.received - minimumDose).toBeGreaterThanOrEqual(20);
  });

  it('charges the reserve for shield and science use and recharges less on CME days', () => {
    const quiet = createGame(1, daysOf('QUIET'));
    const cme = createGame(1, daysOf('CME', 2));
    const quietResult = previewTurn(quiet, balanced);
    const cmeResult = previewTurn(cme, balanced);
    expect(quietResult.deltas.power).toBe(RULES.powerRechargePerDay
      - balanced.shield * RULES.powerCostPerShieldUnit - balanced.science * RULES.powerCostPerScienceUnit);
    expect(quietResult.after.power - cmeResult.after.power).toBe(RULES.powerRechargePerDay - RULES.powerRechargeOnCme);
    expect(cmeResult.explanations.power).toContain('CME');
    const allLife = previewTurn(quiet, { life: 10, shield: 0, science: 0 });
    expect(allLife.deltas.power).toBe(RULES.powerRechargePerDay);
    expect(allLife.after.lifeSupport).toBe(quiet.meters.lifeSupport + 6 * RULES.lifeSupportRecoveryPerExtraUnit);
  });

  it('schedules brownouts only when reserve ends at zero, with an air hit the next day', () => {
    const start = createGame(1, daysOf('QUIET'));
    start.meters.power = 1;
    const first = applyTurn(deepFreeze(start), balanced);
    expect(first.state.meters.power).toBe(0);
    expect(first.state.meters.lifeSupport).toBe(start.meters.lifeSupport);
    expect(first.state.carryOver).toMatchObject([{
      id: 'brownout-1', dueDay: 2, meter: 'lifeSupport', delta: -RULES.brownoutLifeSupportDrain,
    }]);
    expect(first.result.explanations.power).toContain('battery ran out');
    const next = applyTurn(deepFreeze(first.state), { life: 4, shield: 6, science: 0 });
    expect(next.state.meters.lifeSupport).toBe(start.meters.lifeSupport - RULES.brownoutLifeSupportDrain);
    expect(next.state.carryOver.map(effect => effect.id)).toEqual(['brownout-2']);
    expect(next.result.explanations.lifeSupport).toBe('Air will drop tomorrow because the battery ran out.');
    const exactZero = { ...start, meters: { ...start.meters, power: 3 * RULES.powerCostPerShieldUnit + 3 * RULES.powerCostPerScienceUnit - RULES.powerRechargePerDay } };
    expect(applyTurn(exactZero, balanced).state.carryOver[0].id).toBe('brownout-1');
    const positive = { ...start, meters: { ...start.meters, power: 3 * RULES.powerCostPerShieldUnit + 3 * RULES.powerCostPerScienceUnit - RULES.powerRechargePerDay + 1 } };
    expect(applyTurn(positive, balanced).state.carryOver).toEqual([]);
  });

  it('adds science without a score cap, and does not directly damage health or air', () => {
    const state = createGame(1, daysOf('QUIET'));
    state.scienceScore = 250;
    const result = previewTurn(state, { life: 4, shield: 0, science: 6 });
    expect(result.scienceBefore).toBe(250);
    expect(result.scienceGained).toBe(6 * RULES.sciencePerUnit);
    expect(result.scienceAfter).toBe(250 + 6 * RULES.sciencePerUnit);
    expect(result.deltas.lifeSupport).toBe(0);
    expect(result.deltas.crewHealth).toBe(0);
  });

  it('clamps meters at both ends and prioritizes loss on the final day', () => {
    const full = createGame(1, daysOf('QUIET'));
    full.meters = { power: 99, lifeSupport: 99, crewHealth: 99 };
    full.carryOver = [{ id: 'recovery', dueDay: 1, meter: 'crewHealth', delta: 9, reason: 'Earlier recovery.' }];
    expect(applyTurn(full, { life: 10, shield: 0, science: 0 }).state.meters)
      .toEqual({ power: 100, lifeSupport: 100, crewHealth: 100 });
    for (const day of [1, MISSION_DAYS]) {
      const weak = createGame(1, daysOf('FLR', 3));
      weak.day = day;
      weak.meters = { power: 1, lifeSupport: 1, crewHealth: 1 };
      weak.carryOver = [{ id: 'loss', dueDay: day, meter: 'lifeSupport', delta: -20, reason: 'Earlier air shortage.' }];
      const turn = applyTurn(weak, balanced);
      expect(turn.state.meters).toEqual({ power: 0, lifeSupport: 0, crewHealth: 0 });
      expect(turn.state.status).toBe('ended');
      expect(turn.result.statusAfter).toBe('ended');
      expect(turn.state.day).toBe(day);
    }
  });

  it('wins after day 10, loses immediately for either vital meter, and rejects terminal turns', () => {
    let winning = createGame(1, daysOf('QUIET'));
    for (let day = 1; day <= MISSION_DAYS; day++) {
      const turn = applyTurn(winning, { life: 6, shield: 0, science: 4 });
      expect(turn.result.day).toBe(day);
      expect(turn.result.event).toEqual(winning.events[day - 1]);
      expect(turn.state.day).toBe(Math.min(day + 1, MISSION_DAYS));
      expect(turn.state.history).toHaveLength(day);
      expect(turn.state.history.at(-1)).toEqual(turn.result);
      expect(turn.state.status).toBe(day === MISSION_DAYS ? 'won' : 'playing');
      winning = turn.state;
    }
    for (const meter of ['lifeSupport', 'crewHealth'] as const) {
      const weak = createGame(1, daysOf('QUIET'));
      weak.carryOver = [{ id: 'fatal', dueDay: 1, meter, delta: -100, reason: 'Earlier shortage.' }];
      const ended = applyTurn(weak, balanced).state;
      expect(ended.status).toBe('ended');
      expect(ended.day).toBe(1);
      for (const state of [ended, winning]) {
        expect(() => applyTurn(state, balanced)).toThrow(RangeError);
        expect(() => previewTurn(state, balanced)).toThrow(RangeError);
      }
    }
  });

  it('does not share mutable output objects with inputs or the returned result', () => {
    const original = createGame(8, drawEventSet(EVENTS, 8, []));
    const first = applyTurn(original, balanced).state;
    const frozen = deepFreeze(first);
    const snapshot = structuredClone(frozen);
    const allocation = deepFreeze({ ...balanced });
    const { state, result } = applyTurn(frozen, allocation);
    expect(previewTurn(frozen, allocation)).toEqual(result);
    state.events[0].kidText = 'Changed event';
    state.history[0].after.power = 0;
    state.history[0].dose.received = 999;
    state.history[0].explanations.science = 'Changed history';
    state.carryOver.forEach(effect => { effect.delta = -999; });
    state.history[1].allocation.life = 10;
    state.meters.power = 0;
    result.event.kidText = 'Changed result';
    result.before.power = 0;
    result.after.lifeSupport = 0;
    expect(frozen).toEqual(snapshot);
    expect(allocation).toEqual(balanced);
    expect(result.allocation).toEqual(balanced);
    expect(state.history[1].after.lifeSupport).not.toBe(0);
  });

  it('allows isolated rule variants without changing the default engine or capturing mutable inputs', () => {
    const options = { ...RULES, sciencePerUnit: 9, dosePerSeverity: [0, 6, 12, 18] as const };
    const variant = withRules(options);
    options.sciencePerUnit = 100;
    const state = variant.createGame(1, daysOf('FLR', 3));
    const result = variant.applyTurn(deepFreeze(state), balanced).result;
    expect(result.scienceGained).toBe(27);
    expect(result.dose.incoming).toBe(18);
    expect(variant.previewTurn(state, balanced)).toEqual(result);
    expect(previewTurn(state, balanced).scienceGained).toBe(3 * RULES.sciencePerUnit);
    expect(variant.drawEventSet(EVENTS, 1, [])).toEqual(drawEventSet(EVENTS, 1, []));
  });
});

describe('mission properties', () => {
  it('keeps deterministic, frozen-input, JSON/schema-valid states across 500 seeded missions', () => {
    const statuses = new Set<string>();
    for (let seed = 0; seed < 500; seed++) {
      const random = createRng(seed);
      const events = deepFreeze(drawEventSet(deepFreeze(EVENTS), seed, []));
      let state = createGame(seed, events);
      let replay = createGame(seed, events);
      GameStateSchema.parse(state);
      while (state.status === 'playing') {
        const allocation = deepFreeze({ ...random.pick(allocations) });
        const input = deepFreeze(state);
        const snapshot = JSON.stringify(state);
        const preview = previewTurn(input, allocation);
        const turn = applyTurn(input, allocation);
        replay = applyTurn(deepFreeze(replay), allocation).state;
        expect(JSON.stringify(input)).toBe(snapshot);
        expect(turn.result).toEqual(preview);
        const serialized = JSON.stringify(turn.state);
        expect(serialized).toBe(JSON.stringify(replay));
        TurnResultSchema.parse(turn.result);
        GameStateSchema.parse(turn.state);
        for (const meter of ['power', 'lifeSupport', 'crewHealth'] as MeterKey[]) {
          expect(Number.isInteger(turn.state.meters[meter])).toBe(true);
          expect(turn.state.meters[meter]).toBeGreaterThanOrEqual(0);
          expect(turn.state.meters[meter]).toBeLessThanOrEqual(100);
          expect(turn.result.deltas[meter]).toBe(turn.result.after[meter] - turn.result.before[meter]);
        }
        expect(turn.result.scienceAfter).toBe(turn.result.scienceBefore + turn.result.scienceGained);
        state = turn.state;
      }
      statuses.add(state.status);
      expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    }
    expect(statuses).toEqual(new Set(['won', 'ended']));
  }, 60000);

});
