import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EventCard } from '../../src/ui/components/EventCard';
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

describe('EventCard', () => {
  it('has an h2 header naming the day, and a labelled region', () => {
    render(<EventCard event={flare} day={4} />);
    const h = screen.getByRole('heading', { level: 2, name: 'Day 4 space weather' });
    expect(h).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Day 4 space weather' })).toBeInTheDocument();
  });

  it('uses kid words for the kind', () => {
    const { rerender } = render(<EventCard event={flare} day={1} />);
    expect(screen.getByText('Solar flare')).toBeInTheDocument();
    rerender(<EventCard event={cme} day={1} />);
    expect(screen.getByText('Solar storm cloud (CME)')).toBeInTheDocument();
    rerender(<EventCard event={quiet} day={1} />);
    expect(screen.getByText('Quiet Sun day')).toBeInTheDocument();
  });

  it('formats the real date in UTC', () => {
    render(<EventCard event={flare} day={1} />);
    expect(screen.getByText('Real date:')).toBeInTheDocument();
    expect(screen.getByText('10 May 2024')).toBeInTheDocument();
  });

  it('shows severity as a word and detail text', () => {
    const { rerender, container } = render(<EventCard event={flare} day={1} />);
    expect(screen.getByText('Big')).toBeInTheDocument();
    expect(screen.getByText('Class X1.1')).toBeInTheDocument();
    expect(container.querySelectorAll('.pip')).toHaveLength(3);
    expect(container.querySelectorAll('.pip-on')).toHaveLength(3);
    rerender(<EventCard event={cme} day={1} />);
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('1,200 km/s')).toBeInTheDocument();
    expect(container.querySelectorAll('.pip-on')).toHaveLength(2);
    rerender(<EventCard event={quiet} day={1} />);
    expect(screen.getByText('Calm')).toBeInTheDocument();
    expect(container.querySelectorAll('.pip-on')).toHaveLength(0);
  });

  it('shows the kid text, or the override', () => {
    const { rerender } = render(<EventCard event={flare} day={1} />);
    expect(screen.getByText('A big burst of light left the Sun.')).toBeInTheDocument();
    rerender(<EventCard event={flare} day={1} kidText="Override copy." />);
    expect(screen.getByText('Override copy.')).toBeInTheDocument();
    expect(screen.queryByText('A big burst of light left the Sun.')).not.toBeInTheDocument();
  });

  it('badges real events and real quiet days', () => {
    const { rerender } = render(<EventCard event={flare} day={1} />);
    expect(screen.getByText('Real event')).toBeInTheDocument();
    rerender(<EventCard event={quiet} day={1} />);
    expect(screen.getByText('Real quiet day')).toBeInTheDocument();
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
