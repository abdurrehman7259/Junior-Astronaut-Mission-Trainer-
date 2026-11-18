import { eventSetIdOf, isValidAllocation, isValidDraft, siteOf } from '../shared/eventSet.js';
import { SITES } from '../shared/sites.js';

import { engine } from './engine.js';

/**
 * Screen flow for one mission day: 'mission' (event card + meters + allocator)
 * → 'report' (resolution of that day) → 'mission' for the next day, or 'end' after the final report.
 */

/** Each day starts with nothing shared, so the player makes a real choice (P3, D-038; replaces D-011's carry-over). */
export const EMPTY_ALLOCATION = { life: 0, shield: 0, science: 0 };
/** The "Balanced" quick plan. */
export const DEFAULT_ALLOCATION = { life: 4, shield: 3, science: 3 };
export const DEFAULT_CREW = 'Cadets';

/** "Day" or "Sol", capitalised, for the given site. */
export function dayWordCap(site) {
  const w = SITES[site].dayWord;
  return w.charAt(0).toUpperCase() + w.slice(1);
}

export const initialState = {
  screen: 'loading',
  site: 'moon',
  pools: {},
  isPlaceholder: false,
  retrievedAt: null,
  retrievedBySite: {},
  crewName: DEFAULT_CREW,
  game: null,
  lastResult: null,
  allocation: EMPTY_ALLOCATION,
  recentSetIds: [],
  recentBySite: {},
  dataPanelOpen: false,
  howToOpen: false,
  notice: null,
};

const RECENT_KEEP = 3;

function begin(state, seed) {
  const site = state.site;
  if (!state.pools[site]?.length) {
    // No data for this campaign: go back to the start screen on the Moon if it can be played.
    if (state.pools.moon?.length) {
      const notice = `${SITES[site].name} data isn't available right now. Try the Moon!`;
      return { ...state, screen: 'start', site: 'moon', game: null, lastResult: null, notice };
    }
    return { ...state, screen: 'error', game: null, lastResult: null };
  }
  const recent = state.recentBySite[site] ?? [];
  let set;
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
    notice: null,
    game,
    lastResult: null,
    allocation: EMPTY_ALLOCATION,
    recentSetIds: nextRecent,
    recentBySite: { ...state.recentBySite, [site]: nextRecent },
  };
}

export function reducer(state, action) {
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
      const site = action.saved.site ?? siteOf(action.saved.game);
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
      return begin({ ...state, site, crewName: action.crewName?.trim() || DEFAULT_CREW }, action.seed);
    }
    case 'playAgain':
      return begin(state, action.seed);
    case 'setAllocation':
      return isValidDraft(action.allocation) ? { ...state, allocation: { ...action.allocation } } : state;
    case 'playDay': {
      if (state.screen !== 'mission' || !state.game || state.game.status !== 'playing') return state;
      if (!isValidAllocation(action.allocation)) return state;
      const { state: game, result } = engine.applyTurn(state.game, action.allocation);
      return { ...state, game, lastResult: result, allocation: { ...action.allocation }, screen: 'report' };
    }
    case 'continue': {
      if (state.screen !== 'report' || !state.game) return state;
      return state.game.status === 'playing'
        ? { ...state, screen: 'mission', allocation: EMPTY_ALLOCATION }
        : { ...state, screen: 'end' };
    }
    case 'openDataPanel':
      return { ...state, dataPanelOpen: true };
    case 'closeDataPanel':
      return { ...state, dataPanelOpen: false };
    case 'openHowTo':
      return { ...state, howToOpen: true };
    case 'closeHowTo':
      return { ...state, howToOpen: false };
  }
}

/**
 * A fresh seed for a new mission. Call outside the reducer (the engine itself stays pure).
 * Some sandboxed browsers throw OperationError from getRandomValues (seen in Playwright's
 * Firefox), so fall back to Math.random: a seed only picks the event set, it is not a secret.
 */
export function newSeed() {
  try {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0];
  } catch {
    return Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
  }
}
