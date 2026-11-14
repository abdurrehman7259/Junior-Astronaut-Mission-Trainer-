import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TurnResult } from '../../src/shared/types';
import { ResolutionScreen } from '../../src/ui/screens/ResolutionScreen';

function makeResult(over: Partial<TurnResult> = {}): TurnResult {
  return {
    day: 3,
    allocation: { life: 4, shield: 3, science: 3 },
    event: {
      id: '2024-05-10T06:27:00-FLR-001',
      source: 'DONKI',
      kind: 'FLR',
      realDate: '2024-05-10',
      severity: 2,
      flareClass: 'M5.0',
      kidText: 'A burst of light left the Sun.',
      sourceUrl: 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/',
    },
    before: { power: 80, lifeSupport: 70, crewHealth: 90 },
    after: { power: 72, lifeSupport: 70, crewHealth: 95 },
    deltas: { power: -8, lifeSupport: 0, crewHealth: 5 },
    scienceBefore: 10,
    scienceGained: 4,
    scienceAfter: 14,
    dose: { incoming: 24, blocked: 18, received: 6 },
    explanations: {
      power: 'The base used more power than it made.',
      lifeSupport: 'Air and water stayed steady today.',
      crewHealth: 'Rest helped the crew feel better.',
      science: 'Your lab finished a good experiment.',
    },
    statusAfter: 'playing',
    ...over,
  };
}

describe('ResolutionScreen', () => {
  it('has a single h1 with the day report', () => {
    render(<ResolutionScreen result={makeResult()} isFinal={false} onContinue={() => {}} />);
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('Day 3 report');
    expect(h1s[0]).toHaveFocus();
  });

  it('recaps the event', () => {
    render(<ResolutionScreen result={makeResult()} isFinal={false} onContinue={() => {}} />);
    expect(screen.getByText('Solar flare')).toBeInTheDocument();
    expect(screen.getByText('10 May 2024')).toBeInTheDocument();
    expect(screen.getByText('Strength: Medium')).toBeInTheDocument();
  });

  it('shows all four explanations and before to after numbers', () => {
    render(<ResolutionScreen result={makeResult()} isFinal={false} onContinue={() => {}} />);
    expect(screen.getByText('The base used more power than it made.')).toBeInTheDocument();
    expect(screen.getByText('Air and water stayed steady today.')).toBeInTheDocument();
    expect(screen.getByText('Rest helped the crew feel better.')).toBeInTheDocument();
    expect(screen.getByText('Your lab finished a good experiment.')).toBeInTheDocument();
    expect(screen.getByText('80 → 72')).toBeInTheDocument();
    expect(screen.getByText('70 → 70')).toBeInTheDocument();
    expect(screen.getByText('90 → 95')).toBeInTheDocument();
    expect(screen.getByText('10 → 14')).toBeInTheDocument();
  });

  it('shows the right arrow for down, no change and up', () => {
    render(<ResolutionScreen result={makeResult()} isFinal={false} onContinue={() => {}} />);
    const rowOf = (label: string) => screen.getByText(label).closest('li')!;
    const power = rowOf('Power reserve');
    expect(within(power).getByText('▼')).toBeInTheDocument();
    expect(within(power).getByText('Down')).toBeInTheDocument();
    const life = rowOf('Life support');
    expect(within(life).getByText('●')).toBeInTheDocument();
    expect(within(life).getByText('No change')).toBeInTheDocument();
    const crew = rowOf('Crew health');
    expect(within(crew).getByText('▲')).toBeInTheDocument();
    expect(within(crew).getByText('Up')).toBeInTheDocument();
    const science = rowOf('Science');
    expect(within(science).getByText('▲')).toBeInTheDocument();
  });

  it('shows the dose line only when radiation reached the crew', () => {
    const { rerender } = render(<ResolutionScreen result={makeResult()} isFinal={false} onContinue={() => {}} />);
    expect(
      screen.getByText('Radiation that reached the crew: 6 (your shield blocked 18)'),
    ).toBeInTheDocument();
    expect(screen.getByText('Game numbers')).toBeInTheDocument();
    rerender(
      <ResolutionScreen
        result={makeResult({ dose: { incoming: 0, blocked: 0, received: 0 } })}
        isFinal={false}
        onContinue={() => {}}
      />,
    );
    expect(screen.queryByText(/Radiation that reached/)).not.toBeInTheDocument();
    expect(screen.queryByText('Game numbers')).not.toBeInTheDocument();
  });

  it('switches the button label with isFinal', () => {
    const { rerender } = render(<ResolutionScreen result={makeResult()} isFinal={false} onContinue={() => {}} />);
    expect(screen.getByRole('button', { name: 'Next day' })).toBeInTheDocument();
    rerender(<ResolutionScreen result={makeResult({ statusAfter: 'won' })} isFinal onContinue={() => {}} />);
    expect(screen.getByRole('button', { name: 'See how the mission went' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next day' })).not.toBeInTheDocument();
  });

  it('calls onContinue when the button is pressed', async () => {
    const onContinue = vi.fn();
    render(<ResolutionScreen result={makeResult()} isFinal={false} onContinue={onContinue} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Next day' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
