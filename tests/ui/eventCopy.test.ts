import { describe, expect, it } from 'vitest';
import type { SolarEvent } from '../../src/shared/types';
import { cmeTravelDays, countWordsInSentences, kidTextFor } from '../../src/ui/content/eventCopy';

function ev(partial: Partial<SolarEvent> & Pick<SolarEvent, 'id' | 'kind'>): SolarEvent {
  return {
    source: 'DONKI',
    realDate: '2024-05-10',
    severity: 1,
    kidText: 'draft',
    sourceUrl: 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/',
    ...partial,
  };
}

const flare = (id: string, flareClass: string) => ev({ id, kind: 'FLR', flareClass });
const cme = (id: string, cmeSpeedKms?: number) =>
  ev({ id, kind: 'CME', ...(cmeSpeedKms === undefined ? {} : { cmeSpeedKms }) });
const quiet = (id: string) => ev({ id, kind: 'QUIET', severity: 0 });

const BANNED = /\b(deadly|die|dies|death|kill|killer|destroy)\b/i;

const events: SolarEvent[] = [
  flare('f-x', 'X1.1'),
  flare('f-m', 'M2.0'),
  flare('f-c', 'C5.3'),
  cme('c-400', 400),
  cme('c-900', 900),
  cme('c-2000', 2000),
  quiet('QUIET-2024-06-01'),
  cme('c-none'),
];

// Many ids so every wording variant is exercised.
const manyIds = Array.from({ length: 60 }, (_, i) => `id-${i}`);
const wide: SolarEvent[] = manyIds.flatMap((id) => [
  flare(id, 'X9.9'),
  flare(id, 'M1.0'),
  flare(id, 'C1.0'),
  flare(id, 'B2.0'),
  cme(id, 400),
  cme(id, 900),
  cme(id, 2000),
  cme(id),
  quiet(id),
]);

describe('kidTextFor', () => {
  it.each([...events, ...wide])('keeps copy short, safe and clean (%#)', (event) => {
    const text = kidTextFor(event);
    const counts = countWordsInSentences(text);
    expect(counts.length).toBeGreaterThanOrEqual(1);
    expect(counts.length).toBeLessThanOrEqual(2);
    for (const n of counts) expect(n).toBeLessThan(15);
    expect(counts.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(28);
    expect(text).not.toMatch(BANNED);
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('NaN');
  });

  it('is deterministic', () => {
    for (const event of events) expect(kidTextFor(event)).toBe(kidTextFor({ ...event }));
  });

  it('computes CME travel days', () => {
    expect(cmeTravelDays(2000)).toBe(1);
    expect(cmeTravelDays(400)).toBe(4);
    expect(cmeTravelDays(900)).toBe(2);
    expect(cmeTravelDays(1e9)).toBe(1);
    for (const id of manyIds) {
      expect(kidTextFor(cme(id, 2000))).toContain('about 1 day');
      expect(kidTextFor(cme(id, 2000))).not.toContain('1 days');
      expect(kidTextFor(cme(id, 400))).toContain('about 4 days');
      expect(kidTextFor(cme(id, 900))).toContain('about 2 days');
    }
  });

  it('says the X flare is the strongest class', () => {
    const texts = manyIds.map((id) => kidTextFor(flare(id, 'X1.1')));
    expect(texts.some((t) => /strongest/.test(t))).toBe(true);
    for (const t of texts) expect(t).toMatch(/strongest|radiation/);
  });

  it('describes quiet days as calm', () => {
    for (const id of manyIds) expect(kidTextFor(quiet(id))).toMatch(/calm|quiet|no flares/i);
    for (const id of manyIds) expect(kidTextFor(quiet(id))).toMatch(/science/i);
  });

  it('handles a CME without speed', () => {
    for (const id of manyIds) {
      const text = kidTextFor(cme(id));
      expect(text).toMatch(/CME|cloud/);
      expect(text).not.toMatch(/\bdays?\b/);
    }
  });

  it('handles a flare without a class', () => {
    const text = kidTextFor(ev({ id: 'f-none', kind: 'FLR' }));
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain('undefined');
  });
});
