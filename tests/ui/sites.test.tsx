import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/app/App';
import { engine } from '../../src/app/engine';
import { loadGame, saveGame, SAVE_KEY } from '../../src/app/save';
import { initialState, reducer } from '../../src/app/state';
import { STUB_EVENTS } from '../../src/app/stub-events';
import { StartScreen } from '../../src/ui/screens/StartScreen';
import { buildDataSources } from '../../src/ui/components/DataPanel';
import type { SolarEvent } from '../../src/shared/types';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', () => Promise.resolve(new Response('nope', { status: 404 })));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const storm = (i: number): SolarEvent => ({
  id: `MARS-S${i}`,
  source: 'DONKI',
  kind: 'CME',
  realDate: `2024-03-${String(i + 1).padStart(2, '0')}`,
  severity: ((i % 3) + 1) as 1 | 2 | 3,
  kidText: 'A big cloud of particles left the Sun.',
  sourceUrl: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/',
  marsImpact: 'listed',
});
const quiet = (i: number): SolarEvent => ({
  id: `MARS-Q${i}`,
  source: 'DONKI',
  kind: 'QUIET',
  realDate: `2024-04-${String(i + 1).padStart(2, '0')}`,
  severity: 0,
  kidText: 'The Sun was calm.',
  sourceUrl: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/',
  marsImpact: 'listed',
});
const MARS_POOL: SolarEvent[] = [
  ...Array.from({ length: 6 }, (_, i) => storm(i)),
  ...Array.from({ length: 10 }, (_, i) => quiet(i)),
];
const MARS_DATA = { events: MARS_POOL, retrievedAt: '2026-02-02T00:00:00Z', site: null };
const loadMoon = () => Promise.resolve({ events: STUB_EVENTS, retrievedAt: null, isPlaceholder: true });

describe('site reducer', () => {
  const withMoon = reducer(initialState, { type: 'loaded', events: STUB_EVENTS, retrievedAt: null, isPlaceholder: true });
  const ready = reducer(withMoon, { type: 'marsLoaded', events: MARS_POOL, retrievedAt: MARS_DATA.retrievedAt });

  it('Mars start draws from the Mars pool and passes the site to createGame', () => {
    const spy = vi.spyOn(engine, 'createGame');
    const s = reducer(ready, { type: 'startMission', seed: 3, site: 'mars' });
    expect(s.screen).toBe('mission');
    expect(s.site).toBe('mars');
    expect(spy).toHaveBeenCalledOnce();
    const [seed, set, site] = spy.mock.calls[0]!;
    expect(seed).toBe(3);
    expect(site).toBe('mars');
    expect(set.every((e) => e.id.startsWith('MARS-'))).toBe(true);
  });

  it('defaults to the Moon, keeps the site on play again and tracks recent sets per site', () => {
    const spy = vi.spyOn(engine, 'createGame');
    const moon = reducer(ready, { type: 'startMission', seed: 1 });
    expect(moon.site).toBe('moon');
    expect(spy.mock.calls[0]![2]).toBe('moon');
    const mars = reducer(moon, { type: 'startMission', seed: 2, site: 'mars' });
    expect(mars.recentBySite.moon).toHaveLength(1);
    expect(mars.recentBySite.mars).toHaveLength(1);
    const again = reducer(mars, { type: 'playAgain', seed: 4 });
    expect(again.site).toBe('mars');
    expect(spy.mock.calls.at(-1)![2]).toBe('mars');
    expect(again.recentBySite.mars).toHaveLength(2);
    expect(again.recentBySite.moon).toHaveLength(1);
  });

  it('shows the error screen when Mars has no pool', () => {
    expect(reducer(withMoon, { type: 'startMission', seed: 1, site: 'mars' }).screen).toBe('error');
  });
});

describe('save and site', () => {
  const base = () => {
    const game = engine.createGame(7, engine.drawEventSet(STUB_EVENTS, 7, []));
    return {
      crewName: 'Nova',
      screen: 'mission' as const,
      game,
      lastResult: null,
      allocation: { life: 4, shield: 3, science: 3 },
      recentSetIds: [game.eventSetId],
      placeholder: true,
    };
  };

  it('round-trips the site', () => {
    saveGame({ ...base(), site: 'mars' });
    expect(loadGame()?.site).toBe('mars');
  });

  it('resumes an old save without a site on the Moon', () => {
    saveGame(base());
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY)!);
    delete raw.site;
    localStorage.setItem(SAVE_KEY, JSON.stringify(raw));
    expect(loadGame()?.site).toBe('moon');
  });
});

describe('StartScreen site picker', () => {
  it('selects the Moon by default and starts with it', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} marsStatus="ready" />);
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Moon' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Start mission' }));
    expect(onStart).toHaveBeenCalledWith('Cadets', 'moon');
  });

  it('selecting Mars then starting passes mars', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} marsStatus="ready" />);
    await user.click(screen.getByRole('radio', { name: 'Mars' }));
    await user.click(screen.getByRole('button', { name: 'Start mission' }));
    expect(onStart).toHaveBeenCalledWith('Cadets', 'mars');
  });

  it('arrow keys switch the selection', async () => {
    const user = userEvent.setup();
    render(<StartScreen onStart={() => {}} marsStatus="ready" />);
    screen.getByRole('radio', { name: 'Moon' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Mars' })).toBeChecked();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Moon' })).toBeChecked();
  });

  it('disables Mars with Coming soon, or Loading while it loads', () => {
    const { rerender } = render(<StartScreen onStart={() => {}} marsStatus="unavailable" />);
    expect(screen.getByRole('radio', { name: 'Mars' })).toBeDisabled();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
    rerender(<StartScreen onStart={() => {}} marsStatus="loading" />);
    expect(screen.getByRole('radio', { name: 'Mars' })).toBeDisabled();
    expect(screen.getByText('Loading Mars data…')).toBeInTheDocument();
  });

  it('names the site on the continue button', () => {
    render(<StartScreen onStart={() => {}} resume={{ site: 'mars', day: 3, crewName: 'Nova', onResume: () => {} }} />);
    expect(screen.getByRole('button', { name: 'Continue Mars mission (Sol 3)' })).toBeInTheDocument();
  });
});

describe('App with Mars', () => {
  it('shows Coming soon when Mars data is null', async () => {
    render(<App loadEventsFn={loadMoon} loadMarsFn={() => Promise.resolve(null)} />);
    await screen.findByRole('button', { name: 'Start mission' });
    expect(await screen.findByText('Coming soon')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Mars' })).toBeDisabled();
  });

  it('plays a Mars mission with Sol wording and the Mars theme', async () => {
    const user = userEvent.setup();
    render(<App loadEventsFn={loadMoon} loadMarsFn={() => Promise.resolve(MARS_DATA)} />);
    await screen.findByRole('button', { name: 'Start mission' });
    await user.click(await screen.findByRole('radio', { name: 'Mars' }));
    await user.click(screen.getByRole('button', { name: 'Start mission' }));
    expect(screen.getAllByText('Sol 1 of 10').length).toBeGreaterThan(0);
    expect(screen.getByText(/Mars base, Jezero Crater/)).toBeInTheDocument();
    expect(document.documentElement.dataset.site).toBe('mars');
  });
});

describe('Data used, Mars entries', () => {
  it('adds DONKI Mars and Mars Trek entries only when Mars data is loaded', () => {
    const none = buildDataSources({ retrievedAt: null, isPlaceholder: true });
    expect(none.some((s) => s.id === 'donki-mars')).toBe(false);
    const site = {
      name: 'Jezero Crater',
      summary: 'x',
      latitude: 18,
      longitude: 77,
      marsTrekUrl: 'https://trek.nasa.gov/mars/',
      imageCredit: 'NASA/JPL',
      solLength: 'about 24 hours 39 minutes',
      lightTimeMinutes: { min: 4, max: 24 },
      sources: [{ title: 't', url: 'https://nasa.gov' }],
      retrievedAt: '2026-02-03T00:00:00Z',
    };
    const list = buildDataSources({
      retrievedAt: null,
      isPlaceholder: false,
      mars: { retrievedAt: '2026-02-02T00:00:00Z', site },
    });
    const d = list.find((s) => s.id === 'donki-mars')!;
    expect(d.name).toBe('NASA DONKI (Mars-impact CMEs)');
    expect(d.status).toBe('Archived (retrieved 2026-02-02)');
    const t = list.find((s) => s.id === 'mars-trek')!;
    expect(t.url).toBe('https://trek.nasa.gov/mars/');
    expect(t.extra).toContain('NASA/JPL');
  });
});
