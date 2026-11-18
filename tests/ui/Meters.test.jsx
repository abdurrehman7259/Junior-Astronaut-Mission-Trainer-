import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RULE_LINES } from '../../src/ui/content/copy.js';
import { Meters } from '../../src/ui/components/Meters.jsx';

const healthy = { power: 72, lifeSupport: 85, crewHealth: 90 };

describe('Meters', () => {
  it('shows the four labels and their numbers', () => {
    render(<Meters meters={healthy} scienceScore={14} />);
    for (const label of ['Battery', 'Air & food', 'Crew health', 'Science ★']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('72')).toBeInTheDocument();
    expect(screen.getByText('85')).toBeInTheDocument();
    expect(screen.getByText('90')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
  });

  it('gives each bar an accessible name, range and value', () => {
    render(<Meters meters={healthy} scienceScore={14} />);
    const power = screen.getByRole('meter', { name: 'Battery' });
    expect(power).toHaveAttribute('aria-valuenow', '72');
    expect(power).toHaveAttribute('aria-valuemin', '0');
    expect(power).toHaveAttribute('aria-valuemax', '100');
    expect(screen.getAllByRole('meter')).toHaveLength(3);
    expect(screen.getByRole('meter', { name: 'Crew health' })).toHaveAttribute('aria-valuenow', '90');
  });

  it('shows no warning tag when all meters are healthy', () => {
    render(<Meters meters={healthy} scienceScore={0} />);
    expect(screen.queryByText('Low!')).not.toBeInTheDocument();
    expect(screen.queryByText('Danger!')).not.toBeInTheDocument();
  });

  it('shows the Low! text tag at 30 and below, only for that meter', () => {
    render(<Meters meters={{ power: 30, lifeSupport: 31, crewHealth: 90 }} scienceScore={0} />);
    const tags = screen.getAllByText('Low!');
    expect(tags).toHaveLength(1);
    const item = screen.getByRole('meter', { name: 'Battery' }).closest('li');
    expect(within(item).getByText('Low!')).toBeInTheDocument();
  });

  it('shows Danger! at 15 and below instead of Low!', () => {
    render(<Meters meters={{ power: 15, lifeSupport: 16, crewHealth: 0 }} scienceScore={0} />);
    expect(screen.getAllByText('Danger!')).toHaveLength(2);
    expect(screen.getAllByText('Low!')).toHaveLength(1);
  });

  it('shows delta chips with signs and hidden words', () => {
    render(
      <Meters meters={healthy} scienceScore={14} deltas={{ power: 5, lifeSupport: -8, crewHealth: 0, science: 3 }} />,
    );
    expect(screen.getByText('▲ +5')).toBeInTheDocument();
    expect(screen.getByText('up 5')).toBeInTheDocument();
    expect(screen.getByText('▼ −8')).toBeInTheDocument();
    expect(screen.getByText('down 8')).toBeInTheDocument();
    expect(screen.getByText('no change')).toBeInTheDocument();
    expect(screen.getByText('▲ +3')).toBeInTheDocument();
    expect(screen.getByText('up 3')).toBeInTheDocument();
  });

  it('never uses the old names', () => {
    const { container } = render(<Meters meters={healthy} scienceScore={14} showRules />);
    expect(container.textContent).not.toMatch(/reserve|life support|science score/i);
  });

  it('shows preview chips with signs, hidden words and the label', () => {
    render(
      <Meters
        meters={healthy}
        scienceScore={14}
        preview={{ power: 5, lifeSupport: -10, crewHealth: 0, science: 6 }}
        previewLabel="If you start this day:"
      />,
    );
    expect(screen.getByText('If you start this day:')).toBeInTheDocument();
    expect(screen.getByText('▲ +5')).toBeInTheDocument();
    expect(screen.getByText('up 5')).toBeInTheDocument();
    expect(screen.getByText('▼ −10')).toBeInTheDocument();
    expect(screen.getByText('down 10')).toBeInTheDocument();
    expect(screen.getByText('no change')).toBeInTheDocument();
    expect(screen.getByText('▲ +6')).toBeInTheDocument();
    expect(screen.getByText('up 6')).toBeInTheDocument();
  });

  it('shows no preview label or chips when preview is null', () => {
    render(<Meters meters={healthy} scienceScore={14} preview={null} previewLabel="If you start this day:" />);
    expect(screen.queryByText('If you start this day:')).not.toBeInTheDocument();
    expect(screen.queryByText(/▲|▼/)).not.toBeInTheDocument();
  });

  it('shows the battery rule only when showRules is set, and ties it to the Battery meter', () => {
    const { rerender } = render(<Meters meters={healthy} scienceScore={14} />);
    expect(screen.queryByText(RULE_LINES.battery)).not.toBeInTheDocument();
    rerender(<Meters meters={healthy} scienceScore={14} showRules />);
    const rule = screen.getByText(RULE_LINES.battery);
    expect(rule).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Battery' })).toHaveAttribute('aria-describedby', rule.closest('p').id);
  });

  it('shows no chips without deltas', () => {
    render(<Meters meters={healthy} scienceScore={14} />);
    expect(screen.queryByText(/▲|▼/)).not.toBeInTheDocument();
  });
});
