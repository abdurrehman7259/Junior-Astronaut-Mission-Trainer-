import type { GameEngine } from '../shared/engine-api';
import { eventSetIdOf } from '../shared/eventSet';
import { MISSION_DAYS } from '../shared/types';
import { drawWithRules } from './draw';
import { RULES, type EngineRules } from './rules';
import { resolveTurn } from './turn';

export { RULES } from './rules';
export type { EngineRules } from './rules';

/** Internal simulator seam: supply a complete numeric rules object; defaults remain untouched. */
export function withRules(overrides: EngineRules): GameEngine {
  const rules = structuredClone(overrides);
  return {
    createGame(seed, eventSet) {
      if (eventSet.length !== MISSION_DAYS) throw new RangeError(`A mission needs exactly ${MISSION_DAYS} events.`);
      return {
        day: 1, seed: seed >>> 0, status: 'playing',
        meters: { power: rules.start.power, lifeSupport: rules.start.lifeSupport, crewHealth: rules.start.crewHealth },
        scienceScore: rules.start.scienceScore, history: [], carryOver: [],
        events: eventSet.map(event => ({ ...event })), eventSetId: eventSetIdOf(eventSet),
      };
    },
    previewTurn: (state, allocation) => resolveTurn(state, allocation, rules).result,
    applyTurn: (state, allocation) => resolveTurn(state, allocation, rules),
    drawEventSet: (events, seed, excludeSetIds) => drawWithRules(events, seed, excludeSetIds, rules),
  };
}

export const { createGame, previewTurn, applyTurn, drawEventSet } = withRules(RULES);
