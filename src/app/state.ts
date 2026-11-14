import { eventSetIdOf } from '../shared/eventSet';
import type { Allocation, GameState, SolarEvent, TurnResult } from '../shared/types';
import { engine } from './engine';

export type Screen = 'loading' | 'start' | 'mission' | 'end' | 'error';

export interface AppState {
  screen: Screen;
  pool: SolarEvent[];
  isPlaceholder: boolean;
  retrievedAt: string | null;
  game: GameState | null;
  lastResult: TurnResult | null;
  /** Ids of the last 3 drawn event sets, newest last. */
  recentSetIds: string[];
  dataPanelOpen: boolean;
}

export type Action =
  | { type: 'loaded'; events: SolarEvent[]; retrievedAt: string | null; isPlaceholder: boolean }
  | { type: 'loadFailed' }
  | { type: 'startMission'; seed: number }
  | { type: 'playDay'; allocation: Allocation }
  | { type: 'playAgain'; seed: number }
  | { type: 'openDataPanel' }
  | { type: 'closeDataPanel' };

export const initialState: AppState = {
  screen: 'loading',
  pool: [],
  isPlaceholder: false,
  retrievedAt: null,
  game: null,
  lastResult: null,
  recentSetIds: [],
  dataPanelOpen: false,
};

const RECENT_KEEP = 3;

function begin(state: AppState, seed: number): AppState {
  let set: SolarEvent[];
  try {
    set = engine.drawEventSet(state.pool, seed, state.recentSetIds);
  } catch {
    // Pool can't satisfy the draw rules (e.g. a bad snapshot): show the friendly error screen.
    return { ...state, screen: 'error', game: null, lastResult: null };
  }
  const game = engine.createGame(seed, set);
  return {
    ...state,
    screen: 'mission',
    game,
    lastResult: null,
    recentSetIds: [...state.recentSetIds, eventSetIdOf(set)].slice(-RECENT_KEEP),
  };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'loaded':
      return {
        ...state,
        screen: 'start',
        pool: action.events,
        retrievedAt: action.retrievedAt,
        isPlaceholder: action.isPlaceholder,
      };
    case 'loadFailed':
      return { ...state, screen: 'error' };
    case 'startMission':
    case 'playAgain':
      return begin(state, action.seed);
    case 'playDay': {
      if (!state.game || state.game.status !== 'playing') return state;
      const { state: game, result } = engine.applyTurn(state.game, action.allocation);
      return {
        ...state,
        game,
        lastResult: result,
        screen: game.status === 'playing' ? 'mission' : 'end',
      };
    }
    case 'openDataPanel':
      return { ...state, dataPanelOpen: true };
    case 'closeDataPanel':
      return { ...state, dataPanelOpen: false };
  }
}

/** A fresh seed for a new mission. Call outside the reducer. */
export function newSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]!;
}
