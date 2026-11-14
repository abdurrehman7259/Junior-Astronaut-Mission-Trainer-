import type { Allocation, GameState, SiteId } from '../../src/shared/types';
import { POWER_UNITS_PER_DAY } from '../../src/shared/types';
import { siteOf } from '../../src/shared/eventSet';
import { SITES } from '../../src/shared/sites';

// Simulator policy choices, not engine rules or scientific measurements.
export const POLICY = {
  lifeUnits: 4,
  shieldPerSeverity: 2,
  lowLifeSupport: 40,
  recoveryLifeUnits: 6,
  lowCrewHealth: 40,
  extraShield: 1,
  kidStormSeverity: 2,
  kidNormal: { life: 4, shield: 3, science: 3 },
  kidStorm: { life: 4, shield: 6, science: 0 },
  kidLifeUnits: 5,
  kidLowMeter: 50,
  kidRecoveryLifeUnits: 6,
  kidRecoveryShieldUnits: 5,
} as const;

export type Strategy = (state: GameState) => Allocation;
export const allocations: Allocation[] = [];
for (let life = 0; life <= POWER_UNITS_PER_DAY; life++) {
  for (let shield = 0; shield <= POWER_UNITS_PER_DAY - life; shield++) {
    allocations.push({ life, shield, science: POWER_UNITS_PER_DAY - life - shield });
  }
}
export const allocationName = (a: Allocation) => `${a.life}/${a.shield}/${a.science}`;
export const fixed = (allocation: Allocation): Strategy => () => ({ ...allocation });

/** The only event information available before allocating: current warning or last report. */
export function knownSeverity(state: GameState) {
  return SITES[siteOf(state)].warningDelayDays === 0
    ? state.events[state.day - 1].severity
    : state.history.find(turn => turn.day === state.day - SITES[siteOf(state)].warningDelayDays)?.event.severity ?? 0;
}

// Simulator policy choices, not measurements. Delayed forecasts need a standing shield.
export const POLICY_BY_SITE = {
  moon: { ...POLICY, baseShield: 0 },
  mars: { ...POLICY, lifeUnits: 5, baseShield: 3, shieldPerSeverity: 0.5, extraShield: 2, kidLifeUnits: 5 },
};

export function strategies(site: SiteId = 'moon'): Record<string, Strategy> {
  const policy = POLICY_BY_SITE[site];
  const adaptive = (state: GameState, plus: boolean): Allocation => {
    const severity = knownSeverity(state);
    const life = plus && state.meters.lifeSupport < policy.lowLifeSupport
      ? policy.recoveryLifeUnits : policy.lifeUnits;
    const shield = Math.min(POWER_UNITS_PER_DAY - life,
      policy.baseShield + Math.floor(severity * policy.shieldPerSeverity)
      + (plus && (severity > 0 || policy.baseShield > 0)
        && state.meters.crewHealth < policy.lowCrewHealth ? policy.extraShield : 0));
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
    ...(site === 'mars' ? {
      'kid steady (5/3/2)': fixed({ life: 5, shield: 3, science: 2 }),
      'kid meter-aware': (state: GameState): Allocation => {
        const life = state.meters.lifeSupport < policy.kidLowMeter ? policy.kidRecoveryLifeUnits : policy.kidLifeUnits;
        // Air takes priority if both meters are low; never exceed the ten-unit budget.
        const shield = Math.min(POWER_UNITS_PER_DAY - life,
          state.meters.crewHealth < policy.kidLowMeter ? policy.kidRecoveryShieldUnits : policy.baseShield);
        return { life, shield, science: POWER_UNITS_PER_DAY - life - shield };
      },
    } : {
      'kid storm switch (4/3/3 or 4/6/0)': (state: GameState) => ({ ...(knownSeverity(state)
        >= POLICY.kidStormSeverity ? POLICY.kidStorm : POLICY.kidNormal) }),
      [`kid extra air (${policy.kidLifeUnits} / ${policy.baseShield} + floor(${policy.shieldPerSeverity} x warning) / rest)`]: (state: GameState) => {
        const shield = Math.min(POWER_UNITS_PER_DAY - policy.kidLifeUnits,
          policy.baseShield + Math.floor(policy.shieldPerSeverity * knownSeverity(state)));
        return { life: policy.kidLifeUnits, shield, science: POWER_UNITS_PER_DAY - policy.kidLifeUnits - shield };
      },
    }),
  };
}
