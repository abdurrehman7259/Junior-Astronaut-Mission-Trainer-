import { eventSetIdOf, isValidAllocation } from '../shared/eventSet';
import type { Allocation, GameState, SolarEvent, TurnResult } from '../shared/types';
import { engine } from './engine';
import type { SavedGame } from './save';

/**
 * Screen flow for one mission day: 'mission' (event card + meters + allocator)
 * → 'report' (resolution of that day) → 'mission' for the next day, or 'end' after the final report.
 */
export type Screen = 'loading' | 'start' | 'mission' | 'report' | 'end' | 'error';

export const DEFAULT_ALLOCATION: Allocation = { life: 4, shield: 3, science: 3 };
export const DEFAULT_CREW = 'Cadets';

export interface AppState {
  screen: Screen;
  pool: SolarEvent[];
  isPlaceholder: boolean;
  retrievedAt: string | null;
  crewName: string;
  game: GameState | null;
  lastResult: TurnResult | null;
  /** The plan on the allocator. Carries over from the previous day (D-011). Always valid. */
  allocation: Allocation;
  /** Ids of the last 3 drawn event sets, newest last. */
  recentSetIds: string[];
  dataPanelOpen: boolean;
}

export type Action =
  | { type: 'loaded'; events: SolarEvent[]; retrievedAt: string | null; isPlaceholder: boolean }
  | { type: 'loadFailed' }
  | { type: 'resume'; saved: SavedGame }
  | { type: 'startMission'; seed: number; crewName?: string }
  | { type: 'setAllocation'; allocation: Allocation }
  | { type: 'playDay'; allocation: Allocation }
  | { type: 'continue' }
  | { type: 'playAgain'; seed: number }
  | { type: 'openDataPanel' }
  | { type: 'closeDataPanel' };

export const initialState: AppState = {
  screen: 'loading',
  pool: [],
  isPlaceholder: false,
  retrievedAt: null,
  crewName: DEFAULT_CREW,
  game: null,
  lastResult: null,
  allocation: DEFAULT_ALLOCATION,
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
    allocation: DEFAULT_ALLOCATION,
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
    case 'resume':
      return {
        ...state,
        screen: action.saved.screen,
        crewName: action.saved.crewName,
        game: action.saved.game,
        lastResult: action.saved.lastResult,
        allocation: { ...action.saved.allocation },
        recentSetIds: [...action.saved.recentSetIds],
      };
    case 'startMission':
      return begin({ ...state, crewName: action.crewName?.trim() || DEFAULT_CREW }, action.seed);
    case 'playAgain':
      return begin(state, action.seed);
    case 'setAllocation':
      return isValidAllocation(action.allocation) ? { ...state, allocation: { ...action.allocation } } : state;
    case 'playDay': {
      if (state.screen !== 'mission' || !state.game || state.game.status !== 'playing') return state;
      if (!isValidAllocation(action.allocation)) return state;
      const { state: game, result } = engine.applyTurn(state.game, action.allocation);
      return { ...state, game, lastResult: result, allocation: { ...action.allocation }, screen: 'report' };
    }
    case 'continue': {
      if (state.screen !== 'report' || !state.game) return state;
      return { ...state, screen: state.game.status === 'playing' ? 'mission' : 'end' };
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
