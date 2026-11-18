import { describe, expect, it } from 'vitest';
import { initialState, reducer } from '../../src/app/state.js';
import { STUB_EVENTS } from '../../src/app/stub-events.js';

const withMoon = { ...initialState, screen: 'end', pools: { moon: STUB_EVENTS }, site: 'mars' };

describe('replay with a missing pool', () => {
  it('playAgain on Mars without a Mars pool goes to start on the Moon with a notice', () => {
    const s = reducer(withMoon, { type: 'playAgain', seed: 1 });
    expect(s.screen).toBe('start');
    expect(s.site).toBe('moon');
    expect(s.notice).toBe("Mars data isn't available right now. Try the Moon!");
  });

  it('startMission on Mars with an empty pool does the same', () => {
    const state = { ...withMoon, pools: { moon: STUB_EVENTS, mars: [] }, screen: 'start' };
    const s = reducer(state, { type: 'startMission', seed: 1, site: 'mars' });
    expect(s.screen).toBe('start');
    expect(s.site).toBe('moon');
    expect(s.notice).toMatch(/Mars data/);
  });

  it('errors only when no pool exists at all', () => {
    expect(reducer({ ...initialState, screen: 'end' }, { type: 'playAgain', seed: 1 }).screen).toBe('error');
  });

  it('a normal start clears the notice', () => {
    const s = reducer({ ...withMoon, site: 'moon', notice: 'x' }, { type: 'playAgain', seed: 1 });
    expect(s.screen).toBe('mission');
    expect(s.notice).toBeNull();
  });
});
