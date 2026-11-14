import type { Allocation, CarryOverEffect, DoseBreakdown, SolarEvent, SiteId, TurnExplanations } from '../shared/types';

import { SITES } from '../shared/sites';

const TIME_WORDS = {
  day: { now: 'today', next: 'tomorrow', previous: 'yesterday' },
  sol: { now: 'this sol', next: 'next sol', previous: 'last sol' },
};

export function carryReasons(site: SiteId) {
  const { now, previous } = TIME_WORDS[SITES[site].dayWord];
  return {
    air: `Too little air power ${previous} means less air ${now}.`,
    brownout: `An empty battery ${previous} means less air ${now}.`,
  };
}

interface ExplanationInput {
  site: SiteId;
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
  const { site, allocation, event, dose, due, airShortfall, recovery, brownout,
    scienceGained, finalDay, underfunded } = input;
  const { now, next } = TIME_WORDS[SITES[site].dayWord];
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
        ? `Battery empty! Air drops ${finalDay ? now : next}.`
        : allocation.shield + allocation.science === 0
          ? event.kind === 'CME' ? 'The CME slowed battery recharge.' : `The battery recharged ${now}.`
          : `${event.kind === 'CME' ? 'CME slowed recharge.' : 'Battery recharged.'} ${equipment} used reserve power.`,
    lifeSupport: finalDay && (airShortfall > 0 || brownout)
      ? airShortfall > 0
        ? brownout ? `Too little power for air and an empty battery reduced air ${now}.`
          : `Too little power for air ${now}.`
        : `An empty battery reduced air ${now}.`
      : airShortfall > 0
        ? delayedAir
          ? `Earlier shortages hit ${now}. Low air power adds another loss ${next}.`
          : allocation.life === 0
            ? `No power for air! Air will drop ${next}.`
            : `Only ${allocation.life} ${allocation.life === 1 ? 'unit' : 'units'} for air. Air will drop ${next}.`
        : brownout
          ? `Battery empty! Air will drop ${next}.`
          : delayedAir
            ? `Earlier air or battery shortages hit ${now}.`
            : recovery > 0
              ? `Extra power for air helped restore life support ${now}.`
              : `Enough power for air kept life support steady ${now}.`,
    crewHealth: dose.incoming === 0
      ? `Quiet skies meant no game dose reached the crew ${now}.`
      : allocation.shield === 0
        ? `No shield! All ${dose.incoming} game dose reached the crew.`
        : `Shields blocked ${dose.blocked} of ${dose.incoming} game dose, leaving ${dose.received} to hurt crew health.`,
    science: underfunded && allocation.science > 0
      ? `Battery empty! Science equipment worked less, earning ${points} ${now}.`
      : scienceGained > 0
        ? `Your ${allocation.science} science ${allocation.science === 1 ? 'unit' : 'units'} earned ${points} ${now}.`
        : `No power went to science, so no science points were earned ${now}.`,
  };
}
