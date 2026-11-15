import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { HowToPlay } from '../../src/ui/components/HowToPlay';
import { AppShell } from '../../src/ui/components/AppShell';
import { HEADER, INTRO } from '../../src/ui/content/copy';
import type { SiteId } from '../../src/shared/types';

function setup(site: SiteId = 'moon', onClose = vi.fn()) {
  render(<HowToPlay open site={site} onClose={onClose} returnFocusRef={createRef()} />);
  return onClose;
}

const wordCount = (s: string) => s.trim().split(/\s+/).length;

describe('HowToPlay', () => {
  it('is a dialog named "How to play" and starts on card 1', () => {
    setup();
    const dlg = screen.getByRole('dialog', { name: 'How to play' });
    expect(dlg).toBeInTheDocument();
    expect(screen.getByText('Card 1 of 3')).toBeInTheDocument();
    expect(screen.getByText('① Your goal')).toBeInTheDocument();
    expect(screen.getByText('Keep the crew safe for 10 days and earn science points.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('moves with Next and Back, one card at a time', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Card 2 of 3')).toBeInTheDocument();
    expect(screen.getByText('② Share your power')).toBeInTheDocument();
    expect(screen.queryByText('① Your goal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Card 1 of 3')).toBeInTheDocument();
    expect(screen.getByText('① Your goal')).toBeInTheDocument();
  });

  it('Skip is on every card and calls onClose', () => {
    const onClose = setup();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the last card button closes the dialog', () => {
    const onClose = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Card 3 of 3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Got it!' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Mars card 3 mentions sol and the last button says Got it!', () => {
    setup('mars');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(/A sol is one Mars day/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Got it!' })).toBeInTheDocument();
  });

  it('Esc (cancel) closes it', () => {
    const onClose = setup();
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('starts at card 1 each time it opens', () => {
    const props = { site: 'moon' as const, onClose: () => {}, returnFocusRef: createRef<HTMLElement>() };
    const { rerender } = render(<HowToPlay open {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Card 2 of 3')).toBeInTheDocument();
    rerender(<HowToPlay open={false} {...props} />);
    rerender(<HowToPlay open {...props} />);
    expect(screen.getByText('Card 1 of 3')).toBeInTheDocument();
  });

  it('moves focus into the dialog on open', () => {
    setup();
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('returns focus to the opener even when the browser already closed the dialog (Firefox Esc)', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    const props = { site: 'moon' as const, onClose: () => {}, returnFocusRef: { current: opener } };
    const { rerender, container } = render(<HowToPlay open {...props} />);
    container.querySelector('dialog')!.removeAttribute('open'); // closed natively before React re-rendered
    expect(document.activeElement).not.toBe(opener);
    rerender(<HowToPlay open={false} {...props} />);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('every intro and header sentence is under 15 words', () => {
    const lines: string[] = [];
    for (const site of ['moon', 'mars'] as const) {
      for (const card of INTRO.cards(site)) lines.push(...card.lines);
      for (const dw of ['day', 'sol'] as const) {
        lines.push(HEADER.goal(10, dw, 35), HEADER.goal(10, dw, null), INTRO.done(dw));
      }
    }
    for (const line of lines) {
      // Split sentences on ". " so a two-sentence line is judged per sentence.
      for (const sentence of line.split(/(?<=[.!?])\s+/)) {
        expect(wordCount(sentence), sentence).toBeLessThan(15);
      }
    }
  });
});

describe('AppShell header', () => {
  const base = {
    isPlaceholder: false,
    onOpenData: () => {},
    dataButtonRef: createRef<HTMLButtonElement>(),
    onOpenHowTo: () => {},
    howToButtonRef: createRef<HTMLButtonElement>(),
  };

  it('shows the title, the goal with science, a day indicator and both buttons', () => {
    render(
      <AppShell {...base} day={3} site="moon" goal={{ site: 'moon', science: 35 }}>
        <p>x</p>
      </AppShell>,
    );
    expect(screen.getByText('Moon Base Cadets')).toBeInTheDocument();
    expect(screen.getByText('Goal: survive 10 days · Crew safe · Science ★ 35')).toBeInTheDocument();
    expect(screen.getByText('Day 3 of 10')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'How to play' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Data used' })).toBeInTheDocument();
    expect(screen.queryByText(/Survive real solar storms/)).not.toBeInTheDocument();
  });

  it('uses sols on Mars and the open-ended goal before a mission starts', () => {
    const onOpenHowTo = vi.fn();
    render(
      <AppShell {...base} onOpenHowTo={onOpenHowTo} day={null} site="mars" goal={{ site: 'mars', science: null }}>
        <p>x</p>
      </AppShell>,
    );
    expect(screen.getByText('Goal: survive 10 sols · Crew safe · Earn science ★')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'How to play' }));
    expect(onOpenHowTo).toHaveBeenCalledTimes(1);
  });
});
