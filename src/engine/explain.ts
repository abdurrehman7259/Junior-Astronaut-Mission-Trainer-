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
  finalDay: boolean;
  underfunded: boolean;
}

/** All player-facing rule explanations live here; each readout is at most 15 words. */
export function explainTurn(input: ExplanationInput): TurnExplanations {
  const { allocation, event, dose, due, airShortfall, recovery, brownout,
    scienceGained, finalDay, underfunded } = input;
  const delayedAir = due.some(effect => effect.meter === 'lifeSupport');
  const points = `${scienceGained} science ${scienceGained === 1 ? 'point' : 'points'}`;
  const equipment = allocation.shield > 0 && allocation.science > 0 ? 'Shields and science'
    : allocation.shield > 0 ? 'Shields' : 'Science';
  return {
    power: underfunded
      ? allocation.shield > 0 && dose.incoming > 0
        ? 'Battery empty! Your shield was weaker.'
        : 'Battery empty! There was too little power for your equipment.'
      : brownout
        ? `Battery empty! Air drops ${finalDay ? 'today' : 'tomorrow'}.`
        : allocation.shield + allocation.science === 0
          ? event.kind === 'CME' ? 'The CME slowed battery recharge.' : 'The battery recharged today.'
          : `${event.kind === 'CME' ? 'CME slowed recharge.' : 'Battery recharged.'} ${equipment} used reserve power.`,
    lifeSupport: finalDay && (airShortfall > 0 || brownout)
      ? airShortfall > 0
        ? brownout ? 'Too little power for air and an empty battery reduced air today.'
          : 'Too little power for air today.'
        : 'An empty battery reduced air today.'
      : airShortfall > 0
        ? delayedAir
          ? 'Earlier air or battery shortages hit today. Low air power adds a loss tomorrow.'
          : allocation.life === 0
            ? 'No power for air! Air will drop tomorrow.'
            : `Only ${allocation.life} ${allocation.life === 1 ? 'unit' : 'units'} for air. Air will drop tomorrow.`
        : brownout
          ? 'Battery empty! Air will drop tomorrow.'
          : delayedAir
            ? 'Earlier air or battery shortages hit today.'
            : recovery > 0
              ? 'Extra power for air helped restore life support today.'
              : 'Enough power for air kept life support steady today.',
    crewHealth: dose.incoming === 0
      ? 'Quiet skies meant no game dose reached the crew today.'
      : allocation.shield === 0
        ? `No shield! All ${dose.incoming} game dose reached the crew.`
        : `Shields blocked ${dose.blocked} of ${dose.incoming} game dose, leaving ${dose.received} to hurt crew health.`,
    science: underfunded && allocation.science > 0
      ? `Battery empty! Science equipment worked less, earning ${points} today.`
      : scienceGained > 0
        ? `Your ${allocation.science} science ${allocation.science === 1 ? 'unit' : 'units'} earned ${points} today.`
        : 'No power went to science, so no science points were earned today.',
  };
}
