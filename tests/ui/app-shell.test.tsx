import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';
import { engine } from '../../src/app/engine';
import { initialState, reducer, type AppState } from '../../src/app/state';
import { SAVE_KEY } from '../../src/app/save';
import { STUB_EVENTS } from '../../src/app/stub-events';
import type { SolarEvent } from '../../src/shared/types';

beforeEach(() => localStorage.clear());

const REAL_EVENTS: SolarEvent[] = STUB_EVENTS.map((e) => ({
  ...e,
  id: e.id.replace('STUB-', 'TEST-'),
  sourceUrl: 'https://example.com/donki',
}));
const loadReal = () =>
  Promise.resolve({ events: REAL_EVENTS, retrievedAt: '2026-01-01T00:00:00Z', isPlaceholder: false });

async function playDays(user: ReturnType<typeof userEvent.setup>, n: number) {
  for (let i = 0; i < n; i++) {
    await user.click(await screen.findByRole('button', { name: /^Run day \d+$/ }));
    await user.click(await screen.findByRole('button', { name: /Next day|See how the mission went/ }));
  }
}

const load = () => Promise.resolve({ events: STUB_EVENTS, retrievedAt: null, isPlaceholder: true });

async function setup() {
  const user = userEvent.setup();
  render(<App loadEventsFn={load} />);
  await screen.findByRole('button', { name: 'Start mission' });
  return user;
}

async function playToEnd(user: ReturnType<typeof userEvent.setup>) {
  for (let i = 0; i < 10; i++) {
    const btn = screen.queryByRole('button', { name: /^Run day \d+$/ });
    if (!btn) break;
    await user.click(btn);
    // Day report step (plan → report → next day / end).
    await user.click(await screen.findByRole('button', { name: /Next day|See how the mission went/ }));
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
    expect(screen.getByText(/Science score/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Play again' }));
    expect(screen.getAllByText('Day 1 of 10').length).toBeGreaterThan(0);
  }, 20_000);

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
  }, 20_000);

  it('shows the error screen when loading fails', async () => {
    render(<App loadEventsFn={() => Promise.reject(new Error('nope'))} />);
    expect(await screen.findByText(/We could not load the space-weather data/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Data used' })).toBeInTheDocument();
  });
});

describe('save and resume', () => {
  it('resumes at Day 3 with the same meters after a remount', async () => {
    const user = userEvent.setup();
    const first = render(<App loadEventsFn={load} />);
    await user.click(await screen.findByRole('button', { name: 'Start mission' }));
    await playDays(user, 2);
    const meters = screen.getAllByRole('meter').map((m) => m.getAttribute('aria-valuenow'));
    first.unmount();

    render(<App loadEventsFn={load} />);
    expect(await screen.findByRole('button', { name: 'Continue mission (Day 3)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New mission' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue mission (Day 3)' }));
    expect(screen.getAllByText('Day 3 of 10').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('meter').map((m) => m.getAttribute('aria-valuenow'))).toEqual(meters);
  }, 20_000);

  it('discards a placeholder save when real data loads', async () => {
    const user = userEvent.setup();
    const first = render(<App loadEventsFn={load} />);
    await user.click(await screen.findByRole('button', { name: 'Start mission' }));
    expect(localStorage.getItem(SAVE_KEY)).not.toBeNull();
    first.unmount();

    render(<App loadEventsFn={loadReal} />);
    expect(await screen.findByRole('button', { name: 'Start mission' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Continue mission/ })).not.toBeInTheDocument();
    expect(localStorage.getItem(SAVE_KEY)).toBeNull();
  });

  it('discards a real-data save when placeholder data loads', async () => {
    const user = userEvent.setup();
    const first = render(<App loadEventsFn={loadReal} />);
    await user.click(await screen.findByRole('button', { name: 'Start mission' }));
    first.unmount();
    render(<App loadEventsFn={load} />);
    expect(await screen.findByRole('button', { name: 'Start mission' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Continue mission/ })).not.toBeInTheDocument();
  });

  it('clears the save when the mission ends', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'Start mission' }));
    expect(localStorage.getItem(SAVE_KEY)).not.toBeNull();
    await playToEnd(user);
    expect(localStorage.getItem(SAVE_KEY)).toBeNull();
  }, 20_000);
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
      expect(s.screen).toBe('report');
      s = reducer(s, { type: 'continue' });
    }
    expect(s.screen).toBe('end');
    expect(s.game?.status).not.toBe('playing');
    for (let seed = 2; seed < 8; seed++) s = reducer(s, { type: 'playAgain', seed });
    expect(s.recentSetIds.length).toBeLessThanOrEqual(3);
    expect(engine).toBeDefined();
  });

  it('resume is pure and restores the saved state', () => {
    const started = reducer(loaded, { type: 'startMission', seed: 5, crewName: 'Nova' });
    const saved = {
      version: 1 as const,
      savedAt: '2026-01-01T00:00:00.000Z',
      crewName: 'Nova',
      screen: 'mission' as const,
      game: started.game!,
      lastResult: null,
      allocation: { life: 5, shield: 3, science: 2 },
      recentSetIds: started.recentSetIds,
      placeholder: true,
    };
    const frozen = structuredClone(saved);
    const a = reducer(loaded, { type: 'resume', saved });
    expect(reducer(loaded, { type: 'resume', saved })).toEqual(a);
    expect(saved).toEqual(frozen);
    expect(a).toMatchObject({ screen: 'mission', crewName: 'Nova', allocation: saved.allocation });
    expect(a.game).toEqual(saved.game);
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
