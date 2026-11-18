import { describe, expect, it } from 'vitest';

import { cmeTravelDays, countWordsInSentences, kidTextFor } from '../../src/ui/content/eventCopy.js';

function ev(partial) {
  return {
    source: 'DONKI',
    realDate: '2024-05-10',
    severity: 1,
    kidText: 'draft',
    sourceUrl: 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/',
    ...partial,
  };
}

const flare = (id, flareClass) => ev({ id, kind: 'FLR', flareClass });
const cme = (id, cmeSpeedKms) => ev({ id, kind: 'CME', ...(cmeSpeedKms === undefined ? {} : { cmeSpeedKms }) });
const quiet = (id) => ev({ id, kind: 'QUIET', severity: 0 });

const BANNED = /\b(deadly|die|dies|death|kill|killer|destroy)\b/i;
// Jargon that must not appear on screen without explanation (D-038): the numbers live behind "More details".
const JARGON = /game dose|reserve|\bCMEs?\b|\b[XMCBA]\d+(\.\d+)?\b|\bClass\b/;

const events = [
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
const wide = manyIds.flatMap((id) => [
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
    expect(text).not.toMatch(JARGON);
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
    for (const t of texts) expect(t).not.toMatch(/X1\.1/);
  });

  it('describes quiet days as calm', () => {
    for (const id of manyIds) expect(kidTextFor(quiet(id))).toMatch(/calm|quiet|no big flares/i);
    for (const id of manyIds) expect(kidTextFor(quiet(id))).toMatch(/science/i);
  });

  it('handles a CME without speed', () => {
    for (const id of manyIds) {
      const text = kidTextFor(cme(id));
      expect(text).toMatch(/cloud/);
      expect(text).not.toMatch(/\bdays?\b/);
    }
  });

  it('handles a flare without a class', () => {
    const text = kidTextFor(ev({ id: 'f-none', kind: 'FLR' }));
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain('undefined');
  });
});

describe('kidTextFor on the Moon (kid words, no class numbers)', () => {
  const SNAPSHOT = [
    'This flare is the strongest class. Raise your shield to protect your crew.',
    'A medium flash from the Sun! Give your shield some power to help your crew.',
    'This small flare is a gentle burst of light from the Sun. Your base can relax a bit.',
    'This Sun cloud would take about 4 days to reach the Moon. In this game it hits your base, so shield up!',
    'A rough guess: this cloud needs about 2 days to reach the Moon. In this game, it hits today.',
    'This huge cloud would need about 1 day to reach the Moon. In this game, it hits today!',
    // Fact-check fix (D-028): DONKI logs notable events only, so say "no big flares".
    "NASA's records show no big flares or storm clouds this day. Great day for science!",
    'A giant cloud of Sun gas and magnetism is coming. Power your shield to be ready.',
  ];

  it('matches the recorded kid texts', () => {
    expect(events.map((e) => kidTextFor(e))).toEqual(SNAPSHOT);
    expect(events.map((e) => kidTextFor(e, 'moon'))).toEqual(SNAPSHOT);
  });

  it('keeps the 8-minute flare light time on the Moon', () => {
    const moon = manyIds.map((id) => kidTextFor(flare(id, 'X1.1')));
    expect(moon.some((t) => /about 8 minutes/.test(t))).toBe(true);
  });

  it('phrases the CME travel time as an estimate', () => {
    for (const id of manyIds) expect(kidTextFor(cme(id, 900))).toMatch(/about 2 days/);
  });
});

describe('kidTextFor on Mars', () => {
  const MARS_BANNED = /\b(hit|hits|measured|deadly|die|dies|death|kill|killer|destroy)\b/i;
  const listed = (id, speed) => ({ ...cme(id, speed), marsImpact: 'listed' });
  const gameOnly = (id, speed) => ({ ...cme(id, speed), marsImpact: 'game-only' });
  const marsEvents = manyIds.flatMap((id) => [
    flare(id, 'X9.9'),
    flare(id, 'M1.0'),
    flare(id, 'C1.0'),
    listed(id, 900),
    listed(id),
    gameOnly(id, 400),
    gameOnly(id),
    cme(id, 400),
    quiet(id),
  ]);

  it.each(marsEvents)('keeps copy short, safe and clean (%#)', (event) => {
    const text = kidTextFor(event, 'mars');
    const counts = countWordsInSentences(text);
    expect(counts.length).toBeGreaterThanOrEqual(1);
    expect(counts.length).toBeLessThanOrEqual(2);
    for (const n of counts) expect(n).toBeLessThan(15);
    expect(counts.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(28);
    expect(text).not.toMatch(MARS_BANNED);
    expect(text).not.toMatch(JARGON);
    expect(text).not.toMatch(/undefined|NaN|Moon/);
    expect(text).not.toMatch(/minutes/);
    expect(text).toBe(kidTextFor({ ...event }, 'mars'));
  });

  it('leaves the "model predicted" claim to the card note and keeps the sol hint', () => {
    for (const id of manyIds) {
      for (const e of [listed(id, 900), gameOnly(id, 900)]) {
        const text = kidTextFor(e, 'mars');
        expect(text).not.toMatch(/predicted/);
        expect(text).toMatch(/In this game/);
        expect(text).toMatch(/\bsol\b/);
      }
    }
  });

  it('describes a quiet Mars day with real records', () => {
    expect(kidTextFor(quiet('q'), 'mars')).toBe("NASA's storm log shows no big flares or storm clouds this day.");
  });
});
