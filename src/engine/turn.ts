import { isValidAllocation } from '../shared/eventSet';
import {
  METER_MIN, METER_MAX, MISSION_DAYS, POWER_UNITS_PER_DAY,
  type Allocation, type CarryOverEffect, type GameState, type TurnResult,
} from '../shared/types';
import { carryReasons, explainTurn } from './explain';
import type { EngineRules } from './rules';

const clampMeter = (value: number) => Math.max(METER_MIN, Math.min(METER_MAX, Math.round(value)));

export function resolveTurn(state: GameState, allocation: Allocation, rules: EngineRules): {
  state: GameState; result: TurnResult;
} {
  if (state.status !== 'playing') throw new RangeError('This mission has already finished.');
  if (!isValidAllocation(allocation)) {
    throw new RangeError(`Split exactly ${POWER_UNITS_PER_DAY} whole power units across the three systems.`);
  }

  const event = state.events[state.day - 1];
  const due = state.carryOver.filter(effect => effect.dueDay === state.day);
  const carryOver: CarryOverEffect[] = state.carryOver
    .filter(effect => effect.dueDay !== state.day).map(effect => ({ ...effect }));
  const after = { ...state.meters };
  // Sum today's consequences and direct changes, then clamp once at resolution's end.
  for (const effect of due) after[effect.meter] += effect.delta;

  const airShortfall = Math.max(0, rules.lifeSupportMinUnits - allocation.life);
  const recovery = Math.max(0, allocation.life - rules.lifeSupportMinUnits) * rules.lifeSupportRecoveryPerExtraUnit;
  after.lifeSupport += recovery;
  if (airShortfall > 0) {
    carryOver.push({
      id: `air-${state.day}`, dueDay: state.day + 1, meter: 'lifeSupport',
      delta: -airShortfall * rules.lifeSupportDrainPerMissingUnit, reason: carryReasons.air,
    });
  }

  const incoming = event.kind === 'QUIET' ? 0 : rules.dosePerSeverity[event.severity];
  // Fraction blocked = shield / (shield + half-protection units).
  // Round received dose up: shields cannot erase all dose on storm days.
  const received = Math.ceil(incoming * rules.shieldHalfProtectionUnits
    / (allocation.shield + rules.shieldHalfProtectionUnits));
  const dose = { incoming, blocked: incoming - received, received };
  after.crewHealth -= received * rules.healthLossPerDose;
  after.power += (event.kind === 'CME' ? rules.powerRechargeOnCme : rules.powerRechargePerDay)
    - allocation.shield * rules.powerCostPerShieldUnit - allocation.science * rules.powerCostPerScienceUnit;
  after.power = clampMeter(after.power);
  after.lifeSupport = clampMeter(after.lifeSupport);
  after.crewHealth = clampMeter(after.crewHealth);
  const brownout = after.power === METER_MIN;
  if (brownout) {
    carryOver.push({
      id: `brownout-${state.day}`, dueDay: state.day + 1, meter: 'lifeSupport',
      delta: -rules.brownoutLifeSupportDrain, reason: carryReasons.brownout,
    });
  }
  const scienceGained = allocation.science * rules.sciencePerUnit;
  const statusAfter = after.crewHealth === METER_MIN || after.lifeSupport === METER_MIN
    ? 'ended' : state.day === MISSION_DAYS ? 'won' : 'playing';
  const result: TurnResult = {
    day: state.day, allocation: { ...allocation }, event: { ...event }, before: { ...state.meters }, after,
    deltas: {
      power: after.power - state.meters.power,
      lifeSupport: after.lifeSupport - state.meters.lifeSupport,
      crewHealth: after.crewHealth - state.meters.crewHealth,
    },
    scienceBefore: state.scienceScore, scienceGained, scienceAfter: state.scienceScore + scienceGained,
    dose, explanations: explainTurn({ allocation, event, dose, due, airShortfall, recovery, brownout, scienceGained }),
    statusAfter,
  };
  const next: GameState = {
    ...state, day: statusAfter === 'playing' ? state.day + 1 : state.day,
    meters: { ...after }, scienceScore: result.scienceAfter,
    history: [...state.history, result], carryOver, status: statusAfter,
  };
  // Detach nested history/events as well: consumers can edit the returned state safely.
  return { state: structuredClone(next), result };
}
