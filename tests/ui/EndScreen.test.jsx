import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EndScreen } from '../../src/ui/screens/EndScreen.jsx';
import { STUB_EVENTS } from '../../src/app/stub-events.js';

const m = { power: 50, lifeSupport: 50, crewHealth: 50 };
const real = (n, kind, severity) => ({
  id: `REAL-${n}`,
  source: 'DONKI',
  kind,
  realDate: `2024-05-${String(n).padStart(2, '0')}`,
  severity,
  kidText: 'x',
  sourceUrl: `https://example.com/donki/${n}`,
});

function turn(day, event, shield = 3, science = 3, health = 0) {
  return {
    day,
    allocation: { life: 10 - shield - science, shield, science },
    event,
    before: m,
    after: m,
    deltas: { power: 0, lifeSupport: 0, crewHealth: health },
    scienceBefore: 0,
    scienceGained: 0,
    scienceAfter: 0,
    dose: { incoming: 0, blocked: 0, received: 0 },
    explanations: { power: '', lifeSupport: '', crewHealth: '', science: '' },
    statusAfter: 'playing',
  };
}

const game = (history, status = 'won', site = 'moon') => ({
  day: history.length,
  meters: m,
  scienceScore: 42,
  history,
  seed: 1,
  eventSetId: 's',
  events: history.map((h) => h.event),
  carryOver: [],
  status,
  site,
});

const fact = {
  id: 'f1',
  text: 'Mice in space lose bone.',
  studyTitle: 'Bone study X',
  osdrUrl: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-1',
};

describe('EndScreen', () => {
  const hist = [
    turn(1, real(10, 'FLR', 3), 3, 3, -5),
    turn(2, real(11, 'QUIET', 0), 3, 3, 2),
    turn(3, real(12, 'CME', 2), 3, 3, 0),
  ];

  it('won: outcome title, one why sentence, then score, meters, lesson, timeline, play again', () => {
    render(<EndScreen game={game(hist)} crewName="Nova" onPlayAgain={() => {}} fact={fact} />);
    expect(screen.getByRole('heading', { level: 1, name: 'You made it!' })).toBeInTheDocument();
    expect(screen.getByText('Crew Nova made it through all 3 days.')).toBeInTheDocument();
    expect(screen.getByText('Science ★ 42')).toBeInTheDocument();
    expect(screen.getByText('Science score: 42')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'What you learned' })).toBeInTheDocument();
    expect(screen.getByText('You balanced safety and science. Great work!')).toBeInTheDocument();
    const order = [
      screen.getByRole('heading', { level: 1 }),
      screen.getByText('Science ★ 42'),
      screen.getByRole('heading', { name: 'What you learned' }),
      screen.getByRole('button', { name: 'Play again' }),
      screen.getByRole('heading', { name: 'What really happened' }),
      screen.getByRole('heading', { name: 'Real NASA science' }),
    ];
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(screen.getByText("You'll get a new set of real space weather.")).toBeInTheDocument();
  });

  it('lost by crew health: says radiation hurt the crew', () => {
    const last = { ...turn(3, real(12, 'CME', 3), 0, 3, -20), after: { ...m, crewHealth: 0 }, statusAfter: 'ended' };
    render(<EndScreen game={game([hist[0], last], 'ended')} crewName="Nova" onPlayAgain={() => {}} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Mission over on day 2.' })).toBeInTheDocument();
    expect(screen.getByText('Crew health reached 0. Storm radiation hurt the crew too much.')).toBeInTheDocument();
    expect(screen.getByText('Mission Control flew the crew home safely.')).toBeInTheDocument();
    expect(screen.queryByText(/Air & food ran out/)).toBeNull();
  });

  it('lost by air: says air and food ran out, with the air lesson', () => {
    const last = { ...turn(2, real(11, 'QUIET', 0), 3, 3), after: { ...m, lifeSupport: 0 }, statusAfter: 'ended' };
    render(<EndScreen game={game([hist[0], last], 'ended')} crewName="Nova" onPlayAgain={() => {}} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Mission over on day 2.' })).toBeInTheDocument();
    expect(screen.getByText('Air & food reached 0. It needs at least 4 power every day.')).toBeInTheDocument();
    expect(screen.queryByText(/Storm radiation hurt/)).toBeNull();
    expect(screen.getByText('Air & food needs at least 4 power every day.')).toBeInTheDocument();
  });

  it('lost title names the day or sol, then the why line, then the rescue line', () => {
    const last = { ...turn(3, real(12, 'CME', 3), 0, 3, -20), after: { ...m, crewHealth: 0 }, statusAfter: 'ended' };
    const hh = [hist[0], hist[1], last];
    const { unmount } = render(<EndScreen game={game(hh, 'ended')} crewName="Nova" onPlayAgain={() => {}} />);
    const h1 = screen.getByRole('heading', { level: 1, name: 'Mission over on day 3.' });
    const why = screen.getByText('Crew health reached 0. Storm radiation hurt the crew too much.');
    const rescue = screen.getByText('Mission Control flew the crew home safely.');
    expect(h1.compareDocumentPosition(why) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(why.compareDocumentPosition(rescue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    unmount();
    render(<EndScreen game={game(hh, 'ended', 'mars')} crewName="Nova" onPlayAgain={() => {}} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Mission over on sol 3.' })).toBeInTheDocument();
  });

  it('won has no rescue line, and exactly one Play again button right after the lesson', () => {
    render(<EndScreen game={game(hist)} crewName="Nova" onPlayAgain={() => {}} />);
    expect(screen.queryByText('Mission Control flew the crew home safely.')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Play again' })).toHaveLength(1);
    const lesson = screen.getByRole('heading', { name: 'What you learned' });
    const again = screen.getByRole('button', { name: 'Play again' });
    const timeline = screen.getByRole('heading', { name: 'What really happened' });
    expect(lesson.compareDocumentPosition(again) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(again.compareDocumentPosition(timeline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the battery lesson when the battery ran out', () => {
    const empty = { ...turn(1, real(5, 'QUIET', 0), 0, 6), after: { ...m, power: 0 } };
    render(<EndScreen game={game([empty])} crewName="Nova" onPlayAgain={() => {}} />);
    expect(
      screen.getByText('Watch the battery. Shields and science drain it; Air & food does not.'),
    ).toBeInTheDocument();
  });

  it('Mars: uses sol wording', () => {
    render(<EndScreen game={game(hist, 'won', 'mars')} crewName="Nova" onPlayAgain={() => {}} />);
    expect(screen.getByText('Crew Nova made it through all 3 sols.')).toBeInTheDocument();
    const rows = within(screen.getByRole('list', { name: 'Sol by sol' })).getAllByRole('listitem');
    expect(within(rows[0]).getByText('Sol 1')).toBeInTheDocument();
    expect(screen.queryByText(/Day 1/)).toBeNull();
  });

  it('shows the storm lesson after a hurt storm day, never "Game strength"', () => {
    const hurt = { ...turn(1, real(1, 'CME', 3), 1, 3, -10), dose: { incoming: 20, blocked: 5, received: 15 } };
    render(<EndScreen game={game([hurt])} crewName="Nova" onPlayAgain={() => {}} />);
    expect(screen.getByText('More shields on big storm days protect your crew.')).toBeInTheDocument();
    expect(screen.queryByText(/Game strength/)).toBeNull();
    expect(screen.getByText(/Storm size: Big/)).toBeInTheDocument();
  });

  it('has one timeline row per day, with dates and a NASA link on every real day (storms and quiet days)', () => {
    render(<EndScreen game={game(hist)} crewName="Nova" onPlayAgain={() => {}} />);
    const rows = within(screen.getByRole('list', { name: 'Day by day' })).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText(/10 May 2024/)).toBeInTheDocument();
    const link = within(rows[0]).getByRole('link', { name: /See the NASA record/ });
    expect(link).toHaveAttribute('href', 'https://example.com/donki/10');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(rows[1]).getByRole('link', { name: /See the NASA record/ })).toBeInTheDocument();
    expect(within(rows[2]).getByRole('link')).toBeInTheDocument();
    expect(within(rows[0]).getByText(/Air & food 4 · Shields 3 · Science 3/)).toBeInTheDocument();
    expect(within(rows[0]).getByText(/went down by 5/)).toBeInTheDocument();
    expect(within(rows[2]).getByText(/Crew health ● 0/)).toBeInTheDocument();
    expect(within(rows[1]).getByText(/went up by 2/)).toBeInTheDocument();
    expect(within(rows[2]).getByText(/no change/)).toBeInTheDocument();
  });

  it('marks placeholder events', () => {
    render(<EndScreen game={game([turn(1, STUB_EVENTS[0])])} crewName="Nova" onPlayAgain={() => {}} />);
    expect(screen.getByText(/\(placeholder\)/)).toBeInTheDocument();
  });

  it('shows the fact card only when a fact is given', () => {
    const { rerender } = render(<EndScreen game={game(hist)} crewName="Nova" onPlayAgain={() => {}} fact={fact} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Real NASA science' })).toBeInTheDocument();
    expect(screen.getByText('Mice in space lose bone.')).toBeInTheDocument();
    expect(screen.getByText('Study title: Bone study X')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Read about this study/ });
    expect(link).toHaveAttribute('href', fact.osdrUrl);
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    rerender(<EndScreen game={game(hist)} crewName="Nova" onPlayAgain={() => {}} fact={null} />);
    expect(screen.queryByText('Real NASA science')).toBeNull();
  });

  it('calls onPlayAgain', async () => {
    const fn = vi.fn();
    render(<EndScreen game={game(hist)} crewName="Nova" onPlayAgain={fn} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Play again' }));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
