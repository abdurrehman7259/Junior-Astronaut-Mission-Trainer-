import { eventSetIdOf, isValidAllocation, siteOf } from '../shared/eventSet';
import { SITES } from '../shared/sites';
import type { Allocation, GameState, SiteId, SolarEvent, TurnResult } from '../shared/types';
import { engine } from './engine';
import type { SavedGame } from './save';

/**
 * Screen flow for one mission day: 'mission' (event card + meters + allocator)
 * → 'report' (resolution of that day) → 'mission' for the next day, or 'end' after the final report.
 */
export type Screen = 'loading' | 'start' | 'mission' | 'report' | 'end' | 'error';

export const DEFAULT_ALLOCATION: Allocation = { life: 4, shield: 3, science: 3 };
export const DEFAULT_CREW = 'Cadets';

/** "Day" or "Sol", capitalised, for the given site. */
export function dayWordCap(site: SiteId): string {
  const w = SITES[site].dayWord;
  return w.charAt(0).toUpperCase() + w.slice(1);
}

export interface AppState {
  screen: Screen;
  /** The site of the current or next mission. */
  site: SiteId;
  /** Event pool per site. A site with no pool is unavailable. */
  pools: Partial<Record<SiteId, SolarEvent[]>>;
  isPlaceholder: boolean;
  /** Retrieval time of the Moon snapshot (kept for the banner and the Data panel). */
  retrievedAt: string | null;
  /** Retrieval time per site. */
  retrievedBySite: Partial<Record<SiteId, string | null>>;
  crewName: string;
  game: GameState | null;
  lastResult: TurnResult | null;
  /** The plan on the allocator. Carries over from the previous day (D-011). Always valid. */
  allocation: Allocation;
  /** Ids of the last 3 event sets drawn for the current site, newest last. */
  recentSetIds: string[];
  /** The same, remembered per site. */
  recentBySite: Partial<Record<SiteId, string[]>>;
  dataPanelOpen: boolean;
}

export type Action =
  | { type: 'loaded'; events: SolarEvent[]; retrievedAt: string | null; isPlaceholder: boolean }
  | { type: 'marsLoaded'; events: SolarEvent[]; retrievedAt: string }
  | { type: 'loadFailed' }
  | { type: 'resume'; saved: SavedGame }
  | { type: 'startMission'; seed: number; crewName?: string; site?: SiteId }
  | { type: 'setAllocation'; allocation: Allocation }
  | { type: 'playDay'; allocation: Allocation }
  | { type: 'continue' }
  | { type: 'playAgain'; seed: number }
  | { type: 'openDataPanel' }
  | { type: 'closeDataPanel' };

export const initialState: AppState = {
  screen: 'loading',
  site: 'moon',
  pools: {},
  isPlaceholder: false,
  retrievedAt: null,
  retrievedBySite: {},
  crewName: DEFAULT_CREW,
  game: null,
  lastResult: null,
  allocation: DEFAULT_ALLOCATION,
  recentSetIds: [],
  recentBySite: {},
  dataPanelOpen: false,
};

const RECENT_KEEP = 3;

function begin(state: AppState, seed: number): AppState {
  const site = state.site;
  const recent = state.recentBySite[site] ?? [];
  let set: SolarEvent[];
  try {
    set = engine.drawEventSet(state.pools[site] ?? [], seed, recent);
  } catch {
    // Pool can't satisfy the draw rules (e.g. a bad snapshot): show the friendly error screen.
    return { ...state, screen: 'error', game: null, lastResult: null };
  }
  const game = engine.createGame(seed, set, site);
  const nextRecent = [...recent, eventSetIdOf(set)].slice(-RECENT_KEEP);
  return {
    ...state,
    screen: 'mission',
    game,
    lastResult: null,
    allocation: DEFAULT_ALLOCATION,
    recentSetIds: nextRecent,
    recentBySite: { ...state.recentBySite, [site]: nextRecent },
  };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'loaded':
      return {
        ...state,
        screen: 'start',
        pools: { ...state.pools, moon: action.events },
        retrievedAt: action.retrievedAt,
        retrievedBySite: { ...state.retrievedBySite, moon: action.retrievedAt },
        isPlaceholder: action.isPlaceholder,
      };
    case 'marsLoaded':
      return {
        ...state,
        pools: { ...state.pools, mars: action.events },
        retrievedBySite: { ...state.retrievedBySite, mars: action.retrievedAt },
      };
    case 'loadFailed':
      return { ...state, screen: 'error' };
    case 'resume': {
      const site = siteOf(action.saved.game);
      return {
        ...state,
        site,
        screen: action.saved.screen,
        crewName: action.saved.crewName,
        game: action.saved.game,
        lastResult: action.saved.lastResult,
        allocation: { ...action.saved.allocation },
        recentSetIds: [...action.saved.recentSetIds],
        recentBySite: { ...state.recentBySite, [site]: [...action.saved.recentSetIds] },
      };
    }
    case 'startMission': {
      const site = action.site ?? 'moon';
      return begin(
        { ...state, site, crewName: action.crewName?.trim() || DEFAULT_CREW },
        action.seed,
      );
    }
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
