import { render, screen, within } from '@testing-library/react';
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

async function skipIntro(user: ReturnType<typeof userEvent.setup>) {
  const dlg = await screen.findByRole('dialog', { name: 'How to play' });
  await user.click(within(dlg).getByRole('button', { name: 'Skip' }));
}

describe('Mars mission screen', () => {
  it("hides today's event and shows the Earth message instead", () => {
    const game = marsGame();
    const today = game.events[0]!;
    renderMission(game, { site: 'mars', marsSite: SITE });
    expect(screen.queryByRole('region', { name: /space weather/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Real storm from NASA')).not.toBeInTheDocument();
    expect(screen.queryByText(/Real date/)).not.toBeInTheDocument();
    expect(screen.queryByText(/20\d\d/)).not.toBeInTheDocument();
    expect(screen.queryByText(today.kidText)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Message from Earth' })).toBeInTheDocument();
    expect(screen.getByText("Today's storm news comes after you start the sol.")).toBeInTheDocument();
    expect(screen.getByText('Sol 1 of 10')).toBeInTheDocument();
    expect(screen.getByText("Plan without knowing today's weather.")).toBeInTheDocument();
  });

  it('takes the light-time numbers and source from props and tags real fact and game rule', () => {
    renderMission(marsGame(), { site: 'mars', marsSite: { ...SITE, lightTimeMinutes: { min: 5, max: 20 } } });
    const fact = screen.getByText('Real fact').closest('li')!;
    expect(fact.textContent).toContain('Radio takes 5 to 20 minutes between Earth and Mars.');
    const rule = screen.getByText('Game rule').closest('li')!;
    expect(rule.textContent).toMatch(/In this game, storm news reaches you one sol\??\s?late\./);
    expect(rule.textContent).toContain('Real radio is faster. The delay is a game rule to practise planning.');
    expect(screen.getByRole('link', { name: /Source/ })).toHaveAttribute('href', LIGHT_URL);
  });

  it('uses 4 and 24 from the file data', () => {
    renderMission(marsGame(), { site: 'mars', marsSite: SITE });
    expect(screen.getByText(/Radio takes 4 to 24 minutes between Earth and Mars\./)).toBeInTheDocument();
  });

  it('drops the numbers and the link when there is no Mars site data', () => {
    renderMission(marsGame(), { site: 'mars', marsSite: null });
    expect(screen.getByText(/Radio takes minutes between Earth and Mars\./)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Source/ })).not.toBeInTheDocument();
  });

  it('keeps the meters and allocator, and never shows the preview event', () => {
    const game = marsGame();
    expect(isForecastPlaceholder(engine.previewTurn(game, BALANCED).event)).toBe(true);
    renderMission(game, { site: 'mars', marsSite: SITE });
    expect(screen.queryByText(/Words to know/)).not.toBeInTheDocument();
    expect(screen.getByText('2. Share your 10 power')).toBeInTheDocument();
    expect(screen.getByText('If the Sun stays calm:')).toBeInTheDocument();
    expect(screen.getByText('A storm could make it worse.')).toBeInTheDocument();
    expect(screen.queryByText(/No warning from Earth yet/)).not.toBeInTheDocument();
  });

  it('shows no preview chips and a disabled Start until all 10 power are shared', () => {
    renderMission(marsGame(), {
      site: 'mars',
      marsSite: SITE,
      allocation: { life: 4, shield: 3, science: 2 },
      preview: null,
    });
    expect(screen.queryByText('If the Sun stays calm:')).not.toBeInTheDocument();
    expect(screen.queryByText('A storm could make it worse.')).not.toBeInTheDocument();
    expect(screen.getByText(/Power left to share:/)).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: 'Start sol 1' })).toBeDisabled();
  });

  it("shows yesterday's revealed event compactly from sol 2", () => {
    let game = marsGame();
    game = engine.applyTurn(game, BALANCED).state;
    renderMission(game, { site: 'mars', marsSite: SITE });
    const line = screen.getByText(/Last sol was:/);
    expect(line.textContent).toMatch(/2024/);
    expect(screen.queryByRole('region', { name: /space weather/ })).not.toBeInTheDocument();
  });

  it("does not show yesterday's message on sol 1", () => {
    renderMission(marsGame(), { site: 'mars', marsSite: SITE });
    expect(screen.queryByText(/Last sol was/)).not.toBeInTheDocument();
  });

  it('formats last sol as kind, then date', () => {
    render(<EarthMessage marsSite={SITE} yesterday={{ ...storm(2), realDate: '2024-05-03' }} />);
    expect(screen.getByText('Last sol was: Solar storm cloud, 3 May 2024')).toBeInTheDocument();
  });
});

describe('PowerAllocator on Mars', () => {
  it('reads "Start sol N", enabled only when all 10 are shared', () => {
    const { rerender } = render(
      <PowerAllocator value={{ life: 0, shield: 0, science: 0 }} onChange={() => {}} onConfirm={() => {}} day={1} site="mars" />,
    );
    expect(screen.getByRole('button', { name: 'Start sol 1' })).toBeDisabled();
    expect(screen.getByText('Share all 10 power to start the sol.')).toBeInTheDocument();
    rerender(<PowerAllocator value={BALANCED} onChange={() => {}} onConfirm={() => {}} day={1} site="mars" />);
    expect(screen.getByRole('button', { name: 'Start sol 1' })).toBeEnabled();
  });

  it('keeps the Moon wording by default and has no preview panel', () => {
    render(<PowerAllocator value={BALANCED} onChange={() => {}} onConfirm={() => {}} day={1} />);
    expect(screen.getByRole('button', { name: 'Start day 1' })).toBeEnabled();
    expect(screen.queryByText(/If you start this day|If the Sun stays calm/)).not.toBeInTheDocument();
  });

  it('the Balanced quick plan fills 4/3/3', async () => {
    const onChange = vi.fn();
    render(<PowerAllocator value={{ life: 0, shield: 0, science: 0 }} onChange={onChange} onConfirm={() => {}} day={1} site="mars" />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Balanced' }));
    expect(onChange).toHaveBeenCalledWith({ life: 4, shield: 3, science: 3 });
  });
});

function marsResult(event: SolarEvent): TurnResult {
  return { ...engine.previewTurn(marsGame(), BALANCED), event, day: 1 };
}

describe('ResolutionScreen on Mars', () => {
  it('has a Sol report heading with focus, the reveal banner, the full card and Go to sol 2', () => {
    const ev = { ...storm(2), realDate: '2024-05-03' };
    render(<ResolutionScreen result={marsResult(ev)} isFinal={false} onContinue={() => {}} site="mars" />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Sol 1 report');
    expect(h1).toHaveFocus();
    expect(screen.getByText('Message from Earth arrived: Solar storm cloud on 3 May 2024')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Sol 1 space weather' })).toBeInTheDocument();
    expect(screen.getByText('Real storm from NASA')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /See the NASA record/ })).toBeInTheDocument();
    expect(screen.getByText("NASA's model predicted this storm would reach Mars.")).toBeInTheDocument();
    expect(screen.getByText('In this game, the warning came too late.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to sol 2' })).toBeInTheDocument();
  });

  it('omits the "too late" line on a quiet sol and names the final button', () => {
    render(<ResolutionScreen result={marsResult(quiet(1))} isFinal onContinue={() => {}} site="mars" />);
    expect(screen.queryByText(/came too late/)).not.toBeInTheDocument();
    expect(screen.getByText(/Calm Sun sol on 2 April 2024/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See how the mission went' })).toBeInTheDocument();
  });
});

describe('EventCard on Mars', () => {
  it('uses the sol word, the Calm sol badge and the model-predicted line', () => {
    const { rerender } = render(<EventCard event={storm(0)} day={2} dayWord="sol" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Sol 2 space weather' })).toBeInTheDocument();
    expect(screen.getByText("NASA's model predicted this storm would reach Mars.")).toBeInTheDocument();
    rerender(<EventCard event={{ ...storm(0), marsImpact: 'game-only' }} day={2} dayWord="sol" />);
    expect(screen.getByText('Recorded by NASA. In the game, this storm also reaches Mars.')).toBeInTheDocument();
    rerender(<EventCard event={quiet(0)} day={2} dayWord="sol" />);
    expect(screen.getByText('Calm sol (real NASA date)')).toBeInTheDocument();
    expect(screen.getByText('Calm Sun sol')).toBeInTheDocument();
  });

  it('is unchanged on the Moon, even for an event that has a Mars impact', () => {
    render(<EventCard event={storm(0)} day={2} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Day 2 space weather' })).toBeInTheDocument();
    expect(screen.queryByText(/reach Mars/)).not.toBeInTheDocument();
  });
});

describe('Moon regression', () => {
  it('keeps the event card before planning, "Start day 1", "Day 1 report" and "Go to day 2"', async () => {
    const user = userEvent.setup();
    render(<App loadEventsFn={loadMoon} loadMarsFn={() => Promise.resolve(MARS_DATA)} />);
    await user.click(await screen.findByRole('button', { name: 'Start mission' }));
    await skipIntro(user);
    expect(screen.getByRole('region', { name: 'Day 1 space weather' })).toBeInTheDocument();
    expect(screen.queryByText('Message from Earth')).not.toBeInTheDocument();
    expect(screen.queryByText('If you start this day:')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start day 1' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Balanced' }));
    expect(screen.getByText('If you start this day:')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start day 1' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Day 1 report' })).toBeInTheDocument();
    expect(screen.queryByText(/Message from Earth arrived/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Go to day 2$/ })).toBeInTheDocument();
  });
});

describe('App, Mars mission', () => {
  it('plans blind, reveals on the report, and plays through to the end screen', async () => {
    const user = userEvent.setup();
    render(<App loadEventsFn={loadMoon} loadMarsFn={() => Promise.resolve(MARS_DATA)} />);
    await screen.findByRole('button', { name: 'Start mission' });
    await user.click(await screen.findByRole('radio', { name: 'Mars' }));
    await user.click(screen.getByRole('button', { name: 'Start mission' }));
    await skipIntro(user);

    for (let sol = 1; sol <= 10; sol++) {
      const run = screen.queryByRole('button', { name: `Start sol ${sol}` });
      if (!run) break;
      expect(screen.getByText("Today's storm news comes after you start the sol.")).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: /space weather/ })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Balanced' }));
      await user.click(run);
      expect(await screen.findByRole('heading', { level: 1, name: `Sol ${sol} report` })).toBeInTheDocument();
      expect(screen.getByText(/Message from Earth arrived:/)).toBeInTheDocument();
      expect(screen.getByRole('region', { name: `Sol ${sol} space weather` })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /^(Go to sol \d+|See how the mission went)$/ }));
    }
    expect(await screen.findByRole('button', { name: 'Play again' })).toBeInTheDocument();
  }, 30_000);
});
