import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GLOSSARY, countWords } from '../../src/ui/content/glossary.js';
import { GlossaryTerm } from '../../src/ui/components/GlossaryTerm.jsx';

const entries = Object.entries(GLOSSARY);

describe('glossary content', () => {
  it.each(entries)('%s: definition is at most 20 words', (_k, e) => {
    expect(countWords(e.definition)).toBeLessThanOrEqual(20);
  });

  it.each(entries)('%s: every sentence is under 15 words', (_k, e) => {
    const sentences = e.definition.split(/[.!?]/).filter((s) => s.trim().length > 0);
    for (const s of sentences) expect(countWords(s)).toBeLessThan(15);
  });

  it.each(entries)('%s: source URL is https on an allowed host', (_k, e) => {
    const u = new URL(e.sourceUrl);
    expect(u.protocol).toBe('https:');
    const host = u.hostname;
    const ok =
      host === 'nasa.gov' || host.endsWith('.nasa.gov') || host === 'swpc.noaa.gov' || host === 'www.swpc.noaa.gov';
    expect(ok).toBe(true);
  });

  it('countWords counts words', () => {
    expect(countWords('  a  b c ')).toBe(3);
    expect(countWords('')).toBe(0);
  });
});

describe('GlossaryTerm', () => {
  it('opens on click and shows definition and source link', async () => {
    const user = userEvent.setup();
    render(<GlossaryTerm k="dose" />);
    const trigger = screen.getByRole('button');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(GLOSSARY.dose.definition)).toBeTruthy();
    const link = screen.getByRole('link', { name: /Source/ });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(trigger.getAttribute('aria-controls')).toBe(screen.getByRole('region').getAttribute('id'));
  });

  it('toggles with Enter and closes with Escape, returning focus', async () => {
    const user = userEvent.setup();
    render(<GlossaryTerm k="cme">custom</GlossaryTerm>);
    const trigger = screen.getByRole('button');
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    screen.getByRole('link').focus();
    await user.keyboard('{Escape}');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('shows the kid word by default and the given children when passed', () => {
    const { rerender } = render(<GlossaryTerm k="cme" />);
    expect(screen.getByRole('button')).toHaveTextContent('Solar storm cloud');
    rerender(<GlossaryTerm k="sol">sol</GlossaryTerm>);
    expect(screen.getByRole('button')).toHaveTextContent(/^sol/);
  });

  it('closes when clicking outside', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <GlossaryTerm k="sol" />
        <p>elsewhere</p>
      </div>,
    );
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('elsewhere'));
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false');
  });
});

describe('Mars glossary entries', () => {
  const marsSources = JSON.parse(readFileSync(resolve(__dirname, '../../public/data/mars-site.json'), 'utf8')).sources;

  it.each(['sol', 'commDelay', 'jezero'])('%s uses a source listed in mars-site.json', (k) => {
    expect(marsSources.map((s) => s.url)).toContain(GLOSSARY[k].sourceUrl);
  });

  it('has the expected terms', () => {
    expect(GLOSSARY.commDelay.term).toBe('Radio delay');
    expect(GLOSSARY.jezero.term).toBe('Jezero Crater');
    expect(GLOSSARY.sol.definition).toBe('A sol is one day on Mars. It is a little longer than an Earth day.');
  });
});
