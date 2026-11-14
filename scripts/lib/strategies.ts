import type { Allocation, GameState } from '../../src/shared/types';
import { POWER_UNITS_PER_DAY } from '../../src/shared/types';
import { RULES, type EngineRules } from '../../src/engine/rules';

export type Strategy = (state: GameState) => Allocation;
export const allocations: Allocation[] = [];
for (let life = 0; life <= POWER_UNITS_PER_DAY; life++) {
  for (let shield = 0; shield <= POWER_UNITS_PER_DAY - life; shield++) {
    allocations.push({ life, shield, science: POWER_UNITS_PER_DAY - life - shield });
  }
}
export const allocationName = (a: Allocation) => `${a.life}/${a.shield}/${a.science}`;
export const fixed = (allocation: Allocation): Strategy => () => ({ ...allocation });

export function strategies(rules: EngineRules = RULES): Record<string, Strategy> {
  const adaptive = (state: GameState, plus: boolean): Allocation => {
    const policy = rules.strategy;
    const severity = state.events[state.day - 1].severity;
    const life = plus && state.meters.lifeSupport < policy.lowLifeSupport
      ? policy.recoveryLifeUnits : policy.lifeUnits;
    const shield = Math.min(POWER_UNITS_PER_DAY - life,
      severity * policy.shieldPerSeverity
      + (plus && severity > 0 && state.meters.crewHealth < policy.lowCrewHealth ? policy.extraShield : 0));
    return { life, shield, science: POWER_UNITS_PER_DAY - life - shield };
  };
  return {
    'all-shield (0/10/0)': fixed({ life: 0, shield: 10, science: 0 }),
    'all-science (0/0/10)': fixed({ life: 0, shield: 0, science: 10 }),
    'all-life (10/0/0)': fixed({ life: 10, shield: 0, science: 0 }),
    'balanced (4/3/3)': fixed({ life: 4, shield: 3, science: 3 }),
    'greedy-science (3/1/6)': fixed({ life: 3, shield: 1, science: 6 }),
    adaptive: state => adaptive(state, false),
    'adaptive-plus': state => adaptive(state, true),
  };
}
