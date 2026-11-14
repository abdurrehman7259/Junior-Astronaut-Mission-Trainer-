/**
 * STUB ENGINE: same API as the real engine (src/shared/engine-api.ts), FAKE numbers.
 * It lets the UI be built before B2 is delivered. Nothing here is a game rule or a fact.
 * Replaced by src/engine (B2) once B2 is accepted; see src/app/engine.ts.
 */
import type { GameEngine } from '../shared/engine-api';
import { eventSetIdOf, isValidAllocation } from '../shared/eventSet';
import {
  METER_MAX,
  METER_MIN,
  MISSION_DAYS,
  type Allocation,
  type GameState,
  type Meters,
  type SolarEvent,
  type TurnResult,
} from '../shared/types';

const clamp = (n: number) => Math.max(METER_MIN, Math.min(METER_MAX, Math.round(n)));

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function assertPlayable(state: GameState, alloc: Allocation): void {
  if (state.status !== 'playing') throw new RangeError('Game is over');
  if (!isValidAllocation(alloc)) throw new RangeError('Allocation must be whole numbers summing to 10');
}

function resolve(state: GameState, alloc: Allocation): TurnResult {
  const event = state.events[state.day - 1];
  const before: Meters = { ...state.meters };

  const incoming = event.severity * 12;
  const blocked = Math.min(incoming, alloc.shield * 3);
  const received = incoming - blocked;

  const after: Meters = {
    power: clamp(before.power + 6 - alloc.science),
    lifeSupport: clamp(before.lifeSupport + (alloc.life - 4) * 5),
    crewHealth: clamp(before.crewHealth - received - (before.lifeSupport < 30 ? 5 : 0)),
  };
  const scienceGained = alloc.science * 3;
  const scienceAfter = state.scienceScore + scienceGained;

  const lost = after.crewHealth <= 0 || after.lifeSupport <= 0;
  const statusAfter = lost ? 'ended' : state.day >= MISSION_DAYS ? 'won' : 'playing';

  return {
    day: state.day,
    allocation: { ...alloc },
    event,
    before,
    after,
    deltas: {
      power: after.power - before.power,
      lifeSupport: after.lifeSupport - before.lifeSupport,
      crewHealth: after.crewHealth - before.crewHealth,
    },
    scienceBefore: state.scienceScore,
    scienceGained,
    scienceAfter,
    dose: { incoming, blocked, received },
    explanations: {
      power: 'Stub: the battery charged a little today.',
      lifeSupport: alloc.life >= 4 ? 'Stub: air and water stayed steady.' : 'Stub: too little power for air.',
      crewHealth: received > 0 ? 'Stub: some radiation got through the shield.' : 'Stub: the crew stayed safe.',
      science: `Stub: the lab earned ${scienceGained} science points.`,
    },
    statusAfter,
  };
}

export const stubEngine: GameEngine = {
  createGame(seed, eventSet) {
    if (eventSet.length !== MISSION_DAYS) throw new RangeError(`Need ${MISSION_DAYS} events`);
    return {
      day: 1,
      meters: { power: 60, lifeSupport: 80, crewHealth: 100 },
      scienceScore: 0,
      history: [],
      seed,
      eventSetId: eventSetIdOf(eventSet),
      events: eventSet.map((e) => ({ ...e })),
      carryOver: [],
      status: 'playing',
    };
  },

  previewTurn(state, alloc) {
    assertPlayable(state, alloc);
    return resolve(state, alloc);
  },

  applyTurn(state, alloc) {
    assertPlayable(state, alloc);
    const result = resolve(state, alloc);
    const next: GameState = {
      ...state,
      day: result.statusAfter === 'playing' ? state.day + 1 : state.day,
      meters: { ...result.after },
      scienceScore: result.scienceAfter,
      history: [...state.history, result],
      status: result.statusAfter,
    };
    return { state: next, result };
  },

  drawEventSet(events, seed, excludeSetIds) {
    const real = events.filter((e) => e.kind !== 'QUIET');
    const quiet = events.filter((e) => e.kind === 'QUIET');
    if (real.length < 3 || real.length + quiet.length < MISSION_DAYS) {
      throw new Error('Event pool too small for a mission');
    }
    for (let attempt = 0; attempt < 50; attempt++) {
      const rand = mulberry32(seed + attempt * 7919);
      const shuffled = [...events].sort(() => rand() - 0.5);
      const pick: SolarEvent[] = shuffled.filter((e) => e.kind !== 'QUIET').slice(0, 4);
      for (const e of shuffled) {
        if (pick.length >= MISSION_DAYS) break;
        if (!pick.includes(e)) pick.push(e);
      }
      const ordered = pick.sort(() => rand() - 0.5);
      if (!excludeSetIds.includes(eventSetIdOf(ordered))) return ordered;
    }
    throw new Error('Could not draw a new event set');
  },
};
