import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/app/App';
import { engine } from '../../src/app/engine';
import { STUB_EVENTS } from '../../src/app/stub-events';
import { isForecastPlaceholder } from '../../src/shared/sites';
import type { Allocation, GameState, MarsSiteInfo, SolarEvent, TurnResult } from '../../src/shared/types';
import { EarthMessage } from '../../src/ui/components/EarthMessage';
import { EventCard } from '../../src/ui/components/EventCard';
import { PowerAllocator } from '../../src/ui/components/PowerAllocator';
import { MissionScreen } from '../../src/ui/screens/MissionScreen';
import { ResolutionScreen } from '../../src/ui/screens/ResolutionScreen';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', () => Promise.resolve(new Response('nope', { status: 404 })));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const BALANCED: Allocation = { life: 4, shield: 3, science: 3 };

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

const LIGHT_URL = 'https://ntrs.nasa.gov/light-time-source';
const SITE: MarsSiteInfo = {
  name: 'Jezero Crater',
  summary: 'x',
  latitude: 18.4,
  longitude: 77.7,
  marsTrekUrl: 'https://trek.nasa.gov/mars/',
  solLength: 'about 24 hours 39 minutes',
  lightTimeMinutes: { min: 4, max: 24 },
  sources: [
    { title: 'NASA: Perseverance rover location', url: 'https://science.nasa.gov/mission/mars-2020-perseverance/' },
    { title: 'NASA NTRS: Why Moon to Mars, one-way light-time, page 3', url: LIGHT_URL },
  ],
  retrievedAt: '2026-02-03T00:00:00Z',
};

function marsGame(): GameState {
  return engine.createGame(3, engine.drawEventSet(MARS_POOL, 3, []), 'mars');
}

function renderMission(game: GameState, extra: Partial<Parameters<typeof MissionScreen>[0]> = {}) {
  return render(
    <MissionScreen
      game={game}
      crewName="Nova"
      allocation={BALANCED}
      preview={engine.previewTurn(game, BALANCED)}
      lastResult={null}
      onAllocationChange={() => {}}
      onConfirm={() => {}}
      {...extra}
    />,
  );
}

describe('Mars mission screen', () => {
  it("hides today's event and shows the Earth message instead", () => {
    const game = marsGame();
    const today = game.events[0]!;
    renderMission(game, { site: 'mars', marsSite: SITE });
    expect(screen.queryByRole('region', { name: /space weather/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Real event')).not.toBeInTheDocument();
    expect(screen.queryByText(/Real date/)).not.toBeInTheDocument();
    expect(screen.queryByText(/20\d\d/)).not.toBeInTheDocument();
    expect(screen.queryByText(today.kidText)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Message from Earth' })).toBeInTheDocument();
    expect(screen.getByText('Arrives tomorrow')).toBeInTheDocument();
    expect(screen.getByText('Sol 1 of 10')).toBeInTheDocument();
    expect(screen.getByText("Plan without knowing today's space weather!")).toBeInTheDocument();
  });

  it('takes the light-time numbers and source from props and tags real fact and game rule', () => {
    renderMission(marsGame(), { site: 'mars', marsSite: { ...SITE, lightTimeMinutes: { min: 5, max: 20 } } });
    expect(screen.getByText(/Radio signals take 5 to 20 minutes to cross between Earth and Mars\./)).toBeInTheDocument();
    expect(screen.getByText('Real fact')).toBeInTheDocument();
    expect(screen.getByText('Game rule')).toBeInTheDocument();
    expect(screen.getByText(/In this game, storm warnings reach your base one sol late\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Source/ })).toHaveAttribute('href', LIGHT_URL);
  });

  it('uses 4 and 24 from the file data', () => {
    renderMission(marsGame(), { site: 'mars', marsSite: SITE });
    expect(screen.getByText(/take 4 to 24 minutes/)).toBeInTheDocument();
  });

  it('drops the numbers and the link when there is no Mars site data', () => {
    renderMission(marsGame(), { site: 'mars', marsSite: null });
    expect(screen.getByText(/Radio signals take minutes to cross between Earth and Mars\./)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Source/ })).not.toBeInTheDocument();
  });

  it('keeps the meters, allocator and glossary line, and never shows the preview event', () => {
    const game = marsGame();
    expect(isForecastPlaceholder(engine.previewTurn(game, BALANCED).event)).toBe(true);
    renderMission(game, { site: 'mars', marsSite: SITE });
    expect(screen.getByText(/Words to know/)).toBeInTheDocument();
    expect(screen.getByText('Share your power')).toBeInTheDocument();
    expect(screen.getByText('If the Sun stays calm:')).toBeInTheDocument();
    expect(screen.queryByText(/No warning from Earth yet/)).not.toBeInTheDocument();
  });

  it("shows yesterday's revealed event compactly from sol 2", () => {
    let game = marsGame();
    game = engine.applyTurn(game, BALANCED).state;
    renderMission(game, { site: 'mars', marsSite: SITE });
    const line = screen.getByText(/Yesterday's message:/);
    expect(line.textContent).toMatch(/2024/);
    expect(screen.queryByRole('region', { name: /space weather/ })).not.toBeInTheDocument();
  });

  it("does not show yesterday's message on sol 1", () => {
    renderMission(marsGame(), { site: 'mars', marsSite: SITE });
    expect(screen.queryByText(/Yesterday's message/)).not.toBeInTheDocument();
  });

  it('formats yesterday as kind, then date', () => {
    render(<EarthMessage marsSite={SITE} yesterday={{ ...storm(2), realDate: '2024-05-03' }} />);
    expect(screen.getByText("Yesterday's message: Solar storm cloud (CME), 3 May 2024")).toBeInTheDocument();
  });
});

describe('PowerAllocator on Mars', () => {
  const calm = () => engine.previewTurn(marsGame(), BALANCED);

  it('says "If the Sun stays calm", warns about storms and reads "Run sol N"', () => {
    render(
      <PowerAllocator value={BALANCED} onChange={() => {}} preview={calm()} onConfirm={() => {}} day={1} site="mars" />,
    );
    expect(screen.getByRole('heading', { name: 'If the Sun stays calm:' })).toBeInTheDocument();
    expect(screen.getByText('Storms could make this worse.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run sol 1' })).toBeEnabled();
    expect(screen.queryByText('If you run this plan:')).not.toBeInTheDocument();
  });

  it('keeps the Moon wording by default', () => {
    render(<PowerAllocator value={BALANCED} onChange={() => {}} preview={calm()} onConfirm={() => {}} day={1} />);
    expect(screen.getByRole('heading', { name: 'If you run this plan:' })).toBeInTheDocument();
    expect(screen.queryByText('Storms could make this worse.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run day 1' })).toBeInTheDocument();
  });
});

function marsResult(event: SolarEvent): TurnResult {
  return { ...engine.previewTurn(marsGame(), BALANCED), event, day: 1 };
}

describe('ResolutionScreen on Mars', () => {
  it('has a Sol report heading with focus, the reveal banner, the full card and Next sol', () => {
    const ev = { ...storm(2), realDate: '2024-05-03' };
    render(<ResolutionScreen result={marsResult(ev)} isFinal={false} onContinue={() => {}} site="mars" />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Sol 1 report');
    expect(h1).toHaveFocus();
    expect(screen.getByText('Message from Earth arrived: Solar storm cloud (CME) on 3 May 2024')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Sol 1 space weather' })).toBeInTheDocument();
    expect(screen.getByText('Real event')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /See the NASA record/ })).toBeInTheDocument();
    expect(screen.getByText("NASA's model predicted this storm would reach Mars.")).toBeInTheDocument();
    expect(screen.getByText("In this game, the warning came too late. Far from Earth, crews plan ahead!")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next sol' })).toBeInTheDocument();
  });

  it('omits the "too late" line on a quiet sol and names the final button', () => {
    render(<ResolutionScreen result={marsResult(quiet(1))} isFinal onContinue={() => {}} site="mars" />);
    expect(screen.queryByText(/came too late/)).not.toBeInTheDocument();
    expect(screen.getByText(/Quiet Sun sol on 2 April 2024/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See how the mission went' })).toBeInTheDocument();
  });
});

describe('EventCard on Mars', () => {
  it('uses the sol word, the Quiet Sun sol label and the model-predicted line', () => {
    const { rerender } = render(<EventCard event={storm(0)} day={2} dayWord="sol" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Sol 2 space weather' })).toBeInTheDocument();
    expect(screen.getByText("NASA's model predicted this storm would reach Mars.")).toBeInTheDocument();
    rerender(<EventCard event={{ ...storm(0), marsImpact: 'game-only' }} day={2} dayWord="sol" />);
    expect(screen.getByText('Recorded by NASA. In the game, this storm also reaches Mars.')).toBeInTheDocument();
    rerender(<EventCard event={quiet(0)} day={2} dayWord="sol" />);
    expect(screen.getByText('Quiet Sun sol')).toBeInTheDocument();
  });

  it('is unchanged on the Moon, even for an event that has a Mars impact', () => {
    render(<EventCard event={storm(0)} day={2} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Day 2 space weather' })).toBeInTheDocument();
    expect(screen.queryByText(/reach Mars/)).not.toBeInTheDocument();
  });
});

describe('Moon regression', () => {
  it('keeps the event card before planning, "Run day 1", "Day 1 report" and "Next day"', async () => {
    const user = userEvent.setup();
    render(<App loadEventsFn={loadMoon} loadMarsFn={() => Promise.resolve(MARS_DATA)} />);
    await user.click(await screen.findByRole('button', { name: 'Start mission' }));
    expect(screen.getByRole('region', { name: 'Day 1 space weather' })).toBeInTheDocument();
    expect(screen.queryByText('Message from Earth')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'If you run this plan:' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Run day 1' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Day 1 report' })).toBeInTheDocument();
    expect(screen.queryByText(/Message from Earth arrived/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Next day$/ })).toBeInTheDocument();
  });
});

describe('App, Mars mission', () => {
  it('plans blind, reveals on the report, and plays through to the end screen', async () => {
    const user = userEvent.setup();
    render(<App loadEventsFn={loadMoon} loadMarsFn={() => Promise.resolve(MARS_DATA)} />);
    await screen.findByRole('button', { name: 'Start mission' });
    await user.click(await screen.findByRole('radio', { name: 'Mars' }));
    await user.click(screen.getByRole('button', { name: 'Start mission' }));

    for (let sol = 1; sol <= 10; sol++) {
      const run = screen.queryByRole('button', { name: `Run sol ${sol}` });
      if (!run) break;
      expect(screen.getByText('Arrives tomorrow')).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: /space weather/ })).not.toBeInTheDocument();
      await user.click(run);
      expect(await screen.findByRole('heading', { level: 1, name: `Sol ${sol} report` })).toBeInTheDocument();
      expect(screen.getByText(/Message from Earth arrived:/)).toBeInTheDocument();
      expect(screen.getByRole('region', { name: `Sol ${sol} space weather` })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /^(Next sol|See how the mission went)$/ }));
    }
    expect(await screen.findByRole('button', { name: 'Play again' })).toBeInTheDocument();
  }, 30_000);
});
