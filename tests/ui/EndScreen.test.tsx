import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EndScreen, pickReflection } from '../../src/ui/screens/EndScreen';
import { STUB_EVENTS } from '../../src/app/stub-events';
import type { GameState, ScienceFact, SolarEvent, TurnResult } from '../../src/shared/types';

const m = { power: 50, lifeSupport: 50, crewHealth: 50 };
const real = (n: number, kind: SolarEvent['kind'], severity: SolarEvent['severity']): SolarEvent => ({
  id: `REAL-${n}`,
  source: 'DONKI',
  kind,
  realDate: `2024-05-${String(n).padStart(2, '0')}`,
  severity,
  kidText: 'x',
  sourceUrl: `https://example.com/donki/${n}`,
});

function turn(day: number, event: SolarEvent, shield = 3, science = 3, health = 0): TurnResult {
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

const game = (history: TurnResult[], status: GameState['status'] = 'won'): GameState => ({
  day: history.length,
  meters: m,
  scienceScore: 42,
  history,
  seed: 1,
  eventSetId: 's',
  events: history.map((h) => h.event),
  carryOver: [],
  status,
});

const fact: ScienceFact = {
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

  it('shows the won and ended headings', () => {
    const { rerender } = render(<EndScreen game={game(hist)} crewName="Nova" onPlayAgain={() => {}} />);
    expect(screen.getByRole('heading', { level: 1, name: 'You made it!' })).toBeInTheDocument();
    expect(screen.getByText('Science score')).toBeInTheDocument();
    rerender(<EndScreen game={game(hist, 'ended')} crewName="Nova" onPlayAgain={() => {}} />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Mission Control brings the crew home safely.' }),
    ).toBeInTheDocument();
  });

  it('has one timeline row per day, with dates and a NASA link on every real day (storms and quiet days)', () => {
    render(<EndScreen game={game(hist)} crewName="Nova" onPlayAgain={() => {}} />);
    const rows = within(screen.getByRole('list', { name: 'Day by day' })).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText(/10 May 2024/)).toBeInTheDocument();
    const link = within(rows[0]!).getByRole('link', { name: /See the NASA record/ });
    expect(link).toHaveAttribute('href', 'https://example.com/donki/10');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(rows[1]!).getByRole('link', { name: /See the NASA record/ })).toBeInTheDocument();
    expect(within(rows[2]!).getByRole('link')).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/Life 4 · Shield 3 · Science 3/)).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/went down by 5/)).toBeInTheDocument();
    expect(within(rows[1]!).getByText(/went up by 2/)).toBeInTheDocument();
    expect(within(rows[2]!).getByText(/no change/)).toBeInTheDocument();
  });

  it('marks placeholder events', () => {
    render(<EndScreen game={game([turn(1, STUB_EVENTS[0]!)])} crewName="Nova" onPlayAgain={() => {}} />);
    expect(screen.getByText(/\(placeholder\)/)).toBeInTheDocument();
  });

  it('shows the fact card only when a fact is given', () => {
    const { rerender } = render(<EndScreen game={game(hist)} crewName="Nova" onPlayAgain={() => {}} fact={fact} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Real NASA science' })).toBeInTheDocument();
    expect(screen.getByText('Mice in space lose bone.')).toBeInTheDocument();
    expect(screen.getByText('Study: Bone study X')).toBeInTheDocument();
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

describe('pickReflection', () => {
  it('suggests shielding after a hurt storm day with low shield', () => {
    expect(pickReflection([turn(1, real(1, 'CME', 3), 1, 3, -10)])).toMatch(/more shielding/);
  });
  it('suggests science when most quiet days had none', () => {
    const h = [
      turn(1, real(1, 'QUIET', 0), 3, 0),
      turn(2, real(2, 'QUIET', 0), 3, 0),
      turn(3, real(3, 'QUIET', 0), 3, 4),
    ];
    expect(pickReflection(h)).toMatch(/quiet days are great for science/);
  });
  it('otherwise praises', () => {
    expect(pickReflection([turn(1, real(1, 'CME', 3), 5, 2, -2), turn(2, real(2, 'QUIET', 0), 3, 3)])).toBe(
      'Great balancing!',
    );
    expect(pickReflection([])).toBe('Great balancing!');
  });
});
