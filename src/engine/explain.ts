import type { Allocation, CarryOverEffect, DoseBreakdown, SolarEvent, TurnExplanations } from '../shared/types';

export const carryReasons = {
  air: 'Too little power for air yesterday means less air today.',
  brownout: 'An empty battery yesterday means less air today.',
};

interface ExplanationInput {
  allocation: Allocation;
  event: SolarEvent;
  dose: DoseBreakdown;
  due: CarryOverEffect[];
  airShortfall: number;
  recovery: number;
  brownout: boolean;
  scienceGained: number;
}

/** All player-facing rule explanations live here; each readout is one short sentence. */
export function explainTurn(input: ExplanationInput): TurnExplanations {
  const { allocation, event, dose, due, airShortfall, recovery, brownout, scienceGained } = input;
  const delayedAir = due.some(effect => effect.meter === 'lifeSupport');
  const delayedHealth = due.some(effect => effect.meter === 'crewHealth');
  const delayedPower = due.some(effect => effect.meter === 'power');
  return {
    power: delayedPower
      ? 'Earlier power effects and today’s equipment use changed the battery after recharge.'
      : brownout
        ? 'Equipment emptied the battery after recharge, so air will drop tomorrow.'
        : event.kind === 'CME'
          ? 'The CME slowed battery recharge, while shields and science used reserve power.'
          : 'The battery recharged, while shields and science used reserve power.',
    lifeSupport: delayedAir
      ? airShortfall > 0
        ? 'Earlier air or battery shortages hit today, and too little air power adds tomorrow’s loss.'
        : 'Earlier air or battery shortages hit today, while today’s air power helped.'
      : airShortfall > 0
        ? `Only ${allocation.life} ${allocation.life === 1 ? 'unit' : 'units'} for air, so it will drop tomorrow.`
        : recovery > 0
          ? 'Extra power for air helped restore life support today.'
          : 'Enough power for air kept life support steady today.',
    crewHealth: delayedHealth
      ? `Earlier health effects applied, and ${dose.received} game dose reached the crew today.`
      : dose.incoming === 0
        ? 'Quiet skies meant no game dose reached the crew today.'
        : `Shields blocked ${dose.blocked} of ${dose.incoming} game dose, leaving ${dose.received} to hurt crew health.`,
    science: scienceGained > 0
      ? `Your ${allocation.science} science units earned ${scienceGained} science points today.`
      : 'No power went to science, so no science points were earned today.',
  };
}
