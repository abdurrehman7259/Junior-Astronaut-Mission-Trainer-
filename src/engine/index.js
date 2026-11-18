import { eventSetIdOf, siteOf } from '../shared/eventSet.js';
import { SITES, UNKNOWN_FORECAST_EVENT } from '../shared/sites.js';

import { MISSION_DAYS } from '../shared/types.js';
import { drawWithRules } from './draw.js';
import { RULES_BY_SITE } from './rules.js';
import { resolveTurn } from './turn.js';

export { RULES, RULES_BY_SITE } from './rules.js';

/** Simulator seam: a single rules object overrides both sites, or supply a per-site map. */
export function withRules(overrides) {
  const bySite = structuredClone('moon' in overrides ? overrides : { moon: overrides, mars: overrides });
  return {
    createGame(seed, eventSet, site = 'moon') {
      if (site !== 'moon' && site !== 'mars') throw new RangeError(`Unknown site "${site}"; choose moon or mars.`);
      if (eventSet.length !== MISSION_DAYS) throw new RangeError(`A mission needs exactly ${MISSION_DAYS} events.`);
      const rules = bySite[site];
      return {
        day: 1,
        seed: seed >>> 0,
        status: 'playing',
        site,
        meters: { power: rules.start.power, lifeSupport: rules.start.lifeSupport, crewHealth: rules.start.crewHealth },
        scienceScore: rules.start.scienceScore,
        history: [],
        carryOver: [],
        events: eventSet.map((event) => ({ ...event })),
        eventSetId: eventSetIdOf(eventSet),
      };
    },
    previewTurn: (state, allocation) =>
      resolveTurn(
        state,
        allocation,
        bySite[siteOf(state)],
        SITES[siteOf(state)].warningDelayDays > 0 ? UNKNOWN_FORECAST_EVENT : undefined,
      ).result,
    applyTurn: (state, allocation) => resolveTurn(state, allocation, bySite[siteOf(state)]),
    // The contract has no site argument. A nonempty storm pool whose every storm has
    // marsImpact is Mars; mixed/untagged pools are Moon. Quiet records need no tag.
    drawEventSet(events, seed, excludeSetIds) {
      const storms = events.filter((event) => event.kind !== 'QUIET');
      const site = storms.length > 0 && storms.every((event) => event.marsImpact !== undefined) ? 'mars' : 'moon';
      return drawWithRules(events, seed, excludeSetIds, bySite[site]);
    },
  };
}

export const { createGame, previewTurn, applyTurn, drawEventSet } = withRules(RULES_BY_SITE);
