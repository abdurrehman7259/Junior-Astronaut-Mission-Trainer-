import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { EventCard, KIND_WORDS, SEVERITY_WORDS, formatRealDate, kindWordFor } from '../../src/ui/components/EventCard';
import type { SolarEvent } from '../../src/shared/types';

const URL = 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/FLR/12345/-1';

const flare: SolarEvent = {
  id: '2024-05-10T06:27:00-FLR-001',
  source: 'DONKI',
  kind: 'FLR',
  realDate: '2024-05-10',
  realTime: '2024-05-10T06:27Z',
  severity: 3,
  flareClass: 'X1.1',
  kidText: 'A big burst of light left the Sun.',
  sourceUrl: URL,
};
const cme: SolarEvent = {
  id: '2024-05-11T01:25:00-CME-001',
  source: 'DONKI',
  kind: 'CME',
  realDate: '2024-05-11',
  severity: 2,
  cmeSpeedKms: 1200,
  kidText: 'A cloud of charged bits left the Sun.',
  sourceUrl: URL,
};
const quiet: SolarEvent = {
  id: 'QUIET-2024-03-02',
  source: 'DONKI',
  kind: 'QUIET',
  realDate: '2024-03-02',
  severity: 0,
  kidText: 'The Sun was calm today.',
  sourceUrl: URL,
};
const stub: SolarEvent = {
  id: 'STUB-FLR-1',
  source: 'DONKI',
  kind: 'FLR',
  realDate: '2000-01-01',
  severity: 3,
  flareClass: 'X1.0',
  kidText: 'Pretend sun burst.',
  sourceUrl: URL,
};

describe('EventCard badge', () => {
  it('storm badge has a warning icon and the storm style, not the calm check', () => {
    const { container, rerender } = render(<EventCard event={flare} day={1} />);
    const storm = container.querySelector('.event-badge')!;
    expect(storm).toHaveTextContent('Real storm from NASA');
    expect(storm).toHaveClass('is-storm');
    expect(storm).not.toHaveClass('is-real');
    expect(storm.querySelector('svg')).not.toBeNull();
    rerender(<EventCard event={cme} day={1} />);
    expect(container.querySelector('.event-badge')).toHaveClass('is-storm');
    const stormSvg = container.querySelector('.event-badge svg')!.innerHTML;
    rerender(<EventCard event={quiet} day={1} />);
    const calm = container.querySelector('.event-badge')!;
    expect(calm).toHaveClass('is-real');
    expect(calm).not.toHaveClass('is-storm');
    expect(calm).toHaveTextContent('Calm day (real NASA date)');
    expect(calm.querySelector('svg')!.innerHTML).not.toBe(stormSvg);
  });
});

describe('EventCard', () => {
  it('has an h2 header naming the day, and a labelled region', () => {
    render(<EventCard event={flare} day={4} />);
    const h = screen.getByRole('heading', { level: 2, name: 'Day 4 space weather' });
    expect(h).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Day 4 space weather' })).toBeInTheDocument();
  });

  it('uses kid words for the kind, with glossary terms for flare and storm cloud', () => {
    const { rerender } = render(<EventCard event={flare} day={1} />);
    expect(screen.getByRole('button', { name: /Solar flare/ })).toBeInTheDocument();
    rerender(<EventCard event={cme} day={1} />);
    expect(screen.getByRole('button', { name: /Solar storm cloud/ })).toBeInTheDocument();
    rerender(<EventCard event={quiet} day={1} />);
    expect(screen.getByText('Calm Sun day')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('opens the glossary definition from the kind word', async () => {
    const user = userEvent.setup();
    render(<EventCard event={cme} day={1} />);
    await user.click(screen.getByRole('button', { name: /Solar storm cloud/ }));
    expect(screen.getByRole('region', { name: 'Solar storm cloud' })).toHaveTextContent(/huge cloud of solar gas/);
  });

  it('exports the kind and size helpers with kid words', () => {
    expect(kindWordFor('FLR')).toBe('Solar flare');
    expect(kindWordFor('CME')).toBe('Solar storm cloud');
    expect(kindWordFor('QUIET')).toBe('Calm Sun day');
    expect(kindWordFor('QUIET', 'sol')).toBe('Calm Sun sol');
    expect(KIND_WORDS.CME).toBe('Solar storm cloud');
    expect(SEVERITY_WORDS).toEqual({ 0: 'None', 1: 'Small', 2: 'Medium', 3: 'Big' });
    expect(formatRealDate('2024-05-10')).toBe('10 May 2024');
  });

  it('formats the real date in UTC', () => {
    render(<EventCard event={flare} day={1} />);
    expect(screen.getByText('Real date:')).toBeInTheDocument();
    expect(screen.getByText('10 May 2024')).toBeInTheDocument();
  });

  it('shows storm size as bolts plus a word, and never "Game strength"', () => {
    const { rerender, container } = render(<EventCard event={flare} day={1} />);
    expect(screen.getByText('Storm size:')).toBeInTheDocument();
    expect(screen.getByText('Big')).toBeInTheDocument();
    expect(container.querySelectorAll('.pip')).toHaveLength(3);
    expect(container.querySelectorAll('.pip-on')).toHaveLength(3);
    expect(container.querySelector('.pips')).toHaveAttribute('aria-hidden', 'true');
    rerender(<EventCard event={cme} day={1} />);
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(container.querySelectorAll('.pip-on')).toHaveLength(2);
    rerender(<EventCard event={{ ...cme, severity: 1 }} day={1} />);
    expect(screen.getByText('Small')).toBeInTheDocument();
    rerender(<EventCard event={quiet} day={1} />);
    expect(screen.queryByText('Storm size:')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.pip-on')).toHaveLength(0);
    expect(container.textContent).not.toMatch(/game strength/i);
  });

  it('hides flare class and CME speed behind a More details toggle', async () => {
    const user = userEvent.setup();
    const { rerender, container } = render(<EventCard event={flare} day={1} />);
    expect(container.textContent).not.toMatch(/X1\.1/);
    const toggle = screen.getByRole('button', { name: 'More details' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveTextContent('Fewer details');
    expect(screen.getByText('NASA flare class: X1.1. X is the biggest class.')).toBeInTheDocument();
    await user.click(toggle);
    expect(screen.queryByText(/NASA flare class/)).not.toBeInTheDocument();

    rerender(<EventCard event={cme} day={1} />);
    expect(container.textContent).not.toMatch(/1,200/);
    await user.click(screen.getByRole('button', { name: 'More details' }));
    expect(screen.getByText('Speed: 1,200 km per second.')).toBeInTheDocument();
  });

  it('has no More details toggle when there are no numbers to show', () => {
    render(<EventCard event={quiet} day={1} />);
    expect(screen.queryByRole('button', { name: /details/ })).not.toBeInTheDocument();
  });

  it('shows the kid text, or the override', () => {
    const { rerender } = render(<EventCard event={flare} day={1} />);
    expect(screen.getByText('A big burst of light left the Sun.')).toBeInTheDocument();
    rerender(<EventCard event={flare} day={1} kidText="Override copy." />);
    expect(screen.getByText('Override copy.')).toBeInTheDocument();
    expect(screen.queryByText('A big burst of light left the Sun.')).not.toBeInTheDocument();
  });

  it('badges real storms and calm days in kid words', () => {
    const { rerender } = render(<EventCard event={flare} day={1} />);
    expect(screen.getByText('Real storm from NASA')).toBeInTheDocument();
    rerender(<EventCard event={quiet} day={1} />);
    expect(screen.getByText('Calm day (real NASA date)')).toBeInTheDocument();
    rerender(<EventCard event={quiet} day={1} dayWord="sol" />);
    expect(screen.getByText('Calm sol (real NASA date)')).toBeInTheDocument();
  });

  it('keeps the Mars notes only on Mars', () => {
    const listed = { ...cme, marsImpact: 'listed' as const };
    const gameOnly = { ...cme, marsImpact: 'game-only' as const };
    const { rerender } = render(<EventCard event={listed} day={1} dayWord="sol" />);
    expect(screen.getByText("NASA's model predicted this storm would reach Mars.")).toBeInTheDocument();
    rerender(<EventCard event={gameOnly} day={1} dayWord="sol" />);
    expect(screen.getByText('Recorded by NASA. In the game, this storm also reaches Mars.')).toBeInTheDocument();
    rerender(<EventCard event={listed} day={1} />);
    expect(screen.queryByText(/reach Mars/)).not.toBeInTheDocument();
  });

  it('marks STUB events as placeholders with no Real wording', () => {
    const { container } = render(<EventCard event={stub} day={2} />);
    expect(screen.getByText('Placeholder')).toBeInTheDocument();
    expect(screen.queryByText(/real/i)).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/real/i);
  });

  it('links to the NASA record safely, announcing the new tab', () => {
    render(<EventCard event={flare} day={1} />);
    const link = screen.getByRole('link', { name: /See the NASA record/ });
    expect(link).toHaveAttribute('href', URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(link).getByText('(opens in a new tab)')).toBeInTheDocument();
  });

  it('keeps icons decorative', () => {
    const { container } = render(<EventCard event={flare} day={1} />);
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
    svgs.forEach((s) => {
      expect(s).toHaveAttribute('aria-hidden', 'true');
      expect(s).toHaveAttribute('focusable', 'false');
    });
  });
});
