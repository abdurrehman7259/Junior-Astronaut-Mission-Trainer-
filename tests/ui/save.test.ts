import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { engine } from '../../src/app/engine';
import { clearSave, loadGame, saveGame, SAVE_KEY, type SavedGame } from '../../src/app/save';
import { STUB_EVENTS } from '../../src/app/stub-events';

type Snapshot = Omit<SavedGame, 'version' | 'savedAt'>;

function snapshot(): Snapshot {
  const game = engine.createGame(7, engine.drawEventSet(STUB_EVENTS, 7, []));
  return {
    crewName: 'Nova',
    screen: 'mission',
    game,
    lastResult: null,
    allocation: { life: 4, shield: 3, science: 3 },
    recentSetIds: [game.eventSetId],
    placeholder: true,
  };
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('save', () => {
  it('round-trips a game', () => {
    const s = snapshot();
    saveGame(s);
    const loaded = loadGame();
    expect(loaded).toMatchObject({ ...s, version: 1 });
    expect(typeof loaded?.savedAt).toBe('string');
  });

  it('returns null when nothing is saved', () => {
    expect(loadGame()).toBeNull();
  });

  it('clears invalid JSON', () => {
    localStorage.setItem(SAVE_KEY, '{nope');
    expect(loadGame()).toBeNull();
    expect(localStorage.getItem(SAVE_KEY)).toBeNull();
  });

  it('clears a save with the wrong version', () => {
    saveGame(snapshot());
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY)!);
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...raw, version: 2 }));
    expect(loadGame()).toBeNull();
    expect(localStorage.getItem(SAVE_KEY)).toBeNull();
  });

  it('clears schema-invalid data', () => {
    saveGame(snapshot());
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY)!);
    raw.game.meters.power = 'lots';
    localStorage.setItem(SAVE_KEY, JSON.stringify(raw));
    expect(loadGame()).toBeNull();
    expect(localStorage.getItem(SAVE_KEY)).toBeNull();
  });

  it('clears a report save that has no result', () => {
    saveGame({ ...snapshot(), screen: 'report' });
    expect(loadGame()).toBeNull();
  });

  it('clearSave removes the save', () => {
    saveGame(snapshot());
    clearSave();
    expect(loadGame()).toBeNull();
  });

  it('never crashes when localStorage throws', () => {
    const boom = () => {
      throw new Error('blocked');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(boom);
    expect(() => saveGame(snapshot())).not.toThrow();
    expect(loadGame()).toBeNull();
    expect(() => clearSave()).not.toThrow();
  });
});

describe('save consistency', () => {
  const allocation = { life: 4, shield: 3, science: 3 };
  /** A real day-1 result and the game after it. */
  function played() {
    const base = snapshot();
    const { state, result } = engine.applyTurn(base.game, allocation);
    return { base, state, result };
  }

  it('uses game.site when saved.site is absent, and saved.site when game.site is absent', () => {
    const s = snapshot();
    saveGame({ ...s, game: { ...s.game, site: 'mars' } });
    expect(loadGame()?.site).toBe('mars');
    const { site: _drop, ...noSite } = s.game;
    saveGame({ ...s, site: 'mars', game: noSite as typeof s.game });
    const loaded = loadGame();
    expect(loaded?.site).toBe('mars');
    expect(loaded?.game.site).toBe('mars');
  });

  it('clears a save whose site and game.site disagree', () => {
    const s = snapshot();
    saveGame({ ...s, site: 'mars', game: { ...s.game, site: 'moon' } });
    expect(loadGame()).toBeNull();
    expect(localStorage.getItem(SAVE_KEY)).toBeNull();
  });

  it('clears a playing day-1 game that carries an unrelated day-10 victory report', () => {
    const { base, result } = played();
    saveGame({ ...base, lastResult: { ...result, day: 10, statusAfter: 'won' } });
    expect(loadGame()).toBeNull();
    expect(localStorage.getItem(SAVE_KEY)).toBeNull();
  });

  it('accepts a report screen whose lastResult is the latest history entry', () => {
    const { base, state, result } = played();
    saveGame({ ...base, screen: 'report', game: state, lastResult: result });
    expect(loadGame()).not.toBeNull();
  });

  it('clears a report save whose lastResult differs from the latest history entry', () => {
    const { base, state, result } = played();
    saveGame({ ...base, screen: 'report', game: state, lastResult: { ...result, day: result.day + 1 } });
    expect(loadGame()).toBeNull();
  });

  it('clears a playing game whose history length does not match the day', () => {
    const { base, state } = played();
    saveGame({ ...base, game: { ...state, history: [] } });
    expect(loadGame()).toBeNull();
  });

  it('accepts a mission screen with a null or matching lastResult', () => {
    const { base, state, result } = played();
    saveGame({ ...base, game: state, lastResult: null });
    expect(loadGame()).not.toBeNull();
    saveGame({ ...base, game: state, lastResult: result });
    expect(loadGame()).not.toBeNull();
  });
});

describe('security audit F5: tampered crew name in a save', () => {
  it('replaces a 40-character name with the default, and keeps the mission', () => {
    const s = snapshot();
    saveGame(s);
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY)!);
    raw.crewName = 'A'.repeat(40);
    localStorage.setItem(SAVE_KEY, JSON.stringify(raw));
    const loaded = loadGame();
    expect(loaded?.crewName).toBe('Cadets');
    expect(loaded?.game.day).toBe(s.game.day);
  });
  it('replaces markup or other disallowed characters with the default', () => {
    const s = snapshot();
    saveGame({ ...s, crewName: '<img onerror=x>' });
    expect(loadGame()?.crewName).toBe('Cadets');
  });
  it('trims a valid name and keeps it', () => {
    const s = snapshot();
    saveGame({ ...s, crewName: '  Nova-7  ' });
    expect(loadGame()?.crewName).toBe('Nova-7');
  });
});
