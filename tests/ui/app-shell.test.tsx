import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';
import { engine } from '../../src/app/engine';
import { initialState, reducer, type AppState } from '../../src/app/state';
import { STUB_EVENTS } from '../../src/app/stub-events';

const load = () => Promise.resolve({ events: STUB_EVENTS, retrievedAt: null, isPlaceholder: true });

async function setup() {
  const user = userEvent.setup();
  render(<App loadEventsFn={load} />);
  await screen.findByRole('button', { name: 'Start mission' });
  return user;
}

async function playToEnd(user: ReturnType<typeof userEvent.setup>) {
  for (let i = 0; i < 10; i++) {
    const btn = screen.queryByRole('button', { name: /Play a balanced day/ });
    if (!btn) break;
    await user.click(btn);
  }
  await screen.findByRole('button', { name: 'Play again' });
}

describe('app shell', () => {
  it('shows the start screen after loading, with the placeholder banner', async () => {
    await setup();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Dev mode: placeholder events, not real data.')).toBeInTheDocument();
  });

  it('starts a mission on Day 1, plays to the end and plays again', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'Start mission' }));
    expect(screen.getAllByText('Day 1 of 10').length).toBeGreaterThan(0);
    await playToEnd(user);
    expect(screen.getByText(/Your science score/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Play again' }));
    expect(screen.getAllByText('Day 1 of 10').length).toBeGreaterThan(0);
  });

  it('has a Data used button on every screen that opens the dialog', async () => {
    const user = await setup();
    const check = async () => {
      await user.click(screen.getByRole('button', { name: 'Data used' }));
      const dlg = screen.getByRole('dialog', { name: 'Data used' });
      expect(within(dlg).getByText(/Placeholder \(not real data\)/)).toBeInTheDocument();
      await user.click(within(dlg).getByRole('button', { name: 'Close' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    };
    await check();
    await user.click(screen.getByRole('button', { name: 'Start mission' }));
    await check();
    await playToEnd(user);
    await check();
  });

  it('shows the error screen when loading fails', async () => {
    render(<App loadEventsFn={() => Promise.reject(new Error('nope'))} />);
    expect(await screen.findByText(/We could not load the space-weather data/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Data used' })).toBeInTheDocument();
  });
});

describe('reducer', () => {
  const loaded: AppState = reducer(initialState, {
    type: 'loaded',
    events: STUB_EVENTS,
    retrievedAt: null,
    isPlaceholder: true,
  });

  it('is pure: same input gives equal output and input is not mutated', () => {
    const frozen = structuredClone(loaded);
    const a = reducer(loaded, { type: 'startMission', seed: 5 });
    const b = reducer(loaded, { type: 'startMission', seed: 5 });
    expect(a).toEqual(b);
    expect(loaded).toEqual(frozen);
    expect(a.screen).toBe('mission');
    expect(a.recentSetIds).toHaveLength(1);

    const frozenA = structuredClone(a);
    const c = reducer(a, { type: 'playDay', allocation: { life: 4, shield: 3, science: 3 } });
    expect(a).toEqual(frozenA);
    expect(c.game?.day).toBe(2);
    expect(c.lastResult?.day).toBe(1);
  });

  it('goes to end when the game is over and keeps at most 3 recent sets', () => {
    let s = reducer(loaded, { type: 'startMission', seed: 1 });
    for (let i = 0; i < 10 && s.screen === 'mission'; i++) {
      s = reducer(s, { type: 'playDay', allocation: { life: 4, shield: 3, science: 3 } });
    }
    expect(s.screen).toBe('end');
    expect(s.game?.status).not.toBe('playing');
    for (let seed = 2; seed < 8; seed++) s = reducer(s, { type: 'playAgain', seed });
    expect(s.recentSetIds.length).toBeLessThanOrEqual(3);
    expect(engine).toBeDefined();
  });

  it('toggles the data panel and handles load failure', () => {
    expect(reducer(loaded, { type: 'openDataPanel' }).dataPanelOpen).toBe(true);
    expect(reducer(loaded, { type: 'closeDataPanel' }).dataPanelOpen).toBe(false);
    expect(reducer(initialState, { type: 'loadFailed' }).screen).toBe('error');
  });
});

describe('reducer edge cases (review fix)', () => {
  it('goes to the error screen instead of throwing when the pool is too small', async () => {
    const { reducer, initialState } = await import('../../src/app/state');
    const loaded = reducer(initialState, { type: 'loaded', events: [], retrievedAt: null, isPlaceholder: true });
    expect(reducer(loaded, { type: 'startMission', seed: 1 }).screen).toBe('error');
  });
});
