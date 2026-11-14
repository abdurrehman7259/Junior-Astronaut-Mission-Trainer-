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
