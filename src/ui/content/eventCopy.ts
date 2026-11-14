import type { SiteId, SolarEvent } from '../../shared/types';

/** Distance from the Sun to the Earth and Moon, in km (about 150 million). */
const SUN_DISTANCE_KM = 150_000_000;
const SECONDS_PER_DAY = 86_400;

/** Split text into sentences. A full stop inside "X1.1" is not a sentence end. */
export function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+(?:\s+|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Word count of each sentence in the text. */
export function countWordsInSentences(text: string): number[] {
  return splitSentences(text).map((s) => s.split(/\s+/).filter((w) => w.length > 0).length);
}

/** Stable FNV-1a hash, so the same event id always picks the same wording. */
function stableHash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function pick<T>(variants: readonly T[], id: string): T {
  return variants[stableHash(id) % variants.length] as T;
}

/**
 * Simple travel-time estimate: Sun distance / speed, in whole days (minimum 1).
 * Real CMEs slow down, so the copy always says "about".
 */
export function cmeTravelDays(speedKms: number): number {
  return Math.max(1, Math.round(SUN_DISTANCE_KM / speedKms / SECONDS_PER_DAY));
}

function daysPhrase(days: number): string {
  return `about ${days} ${days === 1 ? 'day' : 'days'}`;
}

const X_FLARE: readonly ((cls: string) => string)[] = [
  (cls) => `This ${cls} flare is the strongest kind. Raise your shield to protect your crew.`,
  () => 'Flare light reaches your base in about 8 minutes. Big flares mean more radiation, so shield up.',
  () => 'Big flash from the Sun! X is the strongest flare class, so power your shield.',
];

const M_FLARE: readonly ((cls: string) => string)[] = [
  (cls) => `This ${cls} flare is about 10 times stronger than a C flare. Shields help your crew.`,
  () => 'Flare light reaches your base in about 8 minutes. Medium flares can bring radiation, so shield up.',
  () => 'A medium flash from the Sun! Give your shield some power to help your crew.',
];

const SMALL_FLARE: readonly ((cls: string) => string)[] = [
  (cls) => `This ${cls} flare is a small burst of light from the Sun. Your base can relax a bit.`,
  () => 'Flare light reaches your base in about 8 minutes. Small flares are gentle, so try some science.',
  () => 'A small flash from the Sun! Small flares are gentle, so your crew can focus on science.',
];

const GENERIC_FLARE: readonly string[] = [
  'A flare is a sudden burst of light from the Sun. Shields help your crew.',
];

const CME_WITH_SPEED: readonly ((days: number) => string)[] = [
  (d) => `At this speed, it would take ${daysPhrase(d)} to cross to the Moon. Strong shields will help your crew.`,
  (d) => `This CME cloud would take ${daysPhrase(d)} to reach the Moon. In our game it hits your base, so shield up!`,
  (d) => `Huge Sun cloud! It would take ${daysPhrase(d)} to reach the Moon, so shield up.`,
];

const CME_NO_SPEED: readonly string[] = [
  'A CME is a huge cloud of gas from the Sun. In our game, it heads for your base, so shield up.',
  'A giant cloud of Sun gas and magnetism is coming. Power your shield to be ready.',
];

const QUIET_DAY: readonly string[] = [
  'The real Sun was calm on this day: no flares or CMEs were recorded. Calm days are great for science.',
  'Real NASA records show a calm Sun, with no flares or CMEs. Great day for science!',
  'Quiet Sun day: no flares or CMEs were recorded. Your crew can focus on science.',
];

/** Mars flare wording: no "8 minutes" (that is the Earth and Moon light time), no travel claims. */
const MARS_FLARE: Record<'X' | 'M' | 'small', readonly ((cls: string) => string)[]> = {
  X: [
    (cls) => `This ${cls} flare is the strongest kind. Raise your shield to protect your crew.`,
    () => 'Big flash from the Sun! X is the strongest flare class, so power your shield.',
  ],
  M: [
    (cls) => `This ${cls} flare is about 10 times stronger than a C flare. Shields help your crew.`,
    () => 'A medium flash from the Sun! Give your shield some power to help your crew.',
  ],
  small: [
    (cls) => `This ${cls} flare is a small burst of light from the Sun. Your base can relax a bit.`,
    () => 'A small flash from the Sun! Small flares are gentle, so your crew can focus on science.',
  ],
};

/** Mars CME wording. 'listed': NASA's model predicted Mars impact. Otherwise a real CME reused by the game. */
const MARS_CME_LISTED: readonly string[] = [
  "NASA's space-weather model predicted this CME would reach Mars. Warnings arrive a sol late in our game, so shield early.",
  'A NASA model predicted this Sun cloud would reach Mars. In our game, warnings come a sol late, so plan ahead.',
];
const MARS_CME_GAME_ONLY: readonly string[] = [
  'NASA recorded this CME. In our game, it also reaches Mars, and warnings come a sol late.',
  'This CME was recorded by NASA. In our game, it also reaches Mars, so shield early.',
];

const MARS_QUIET = 'The real Sun was calm: no flares or CMEs were recorded.';

function flareText(event: SolarEvent, site: SiteId): string {
  const cls = (event.flareClass ?? '').trim();
  const letter = cls.charAt(0).toUpperCase();
  const label = cls.length > 0 ? cls : `${letter} class`;
  const mars = site === 'mars';
  if (letter === 'X') return pick(mars ? MARS_FLARE.X : X_FLARE, event.id)(label);
  if (letter === 'M') return pick(mars ? MARS_FLARE.M : M_FLARE, event.id)(label);
  if (letter === 'C' || letter === 'B' || letter === 'A') return pick(mars ? MARS_FLARE.small : SMALL_FLARE, event.id)(label);
  return pick(GENERIC_FLARE, event.id);
}

function cmeText(event: SolarEvent, site: SiteId): string {
  if (site === 'mars') {
    return pick(event.marsImpact === 'listed' ? MARS_CME_LISTED : MARS_CME_GAME_ONLY, event.id);
  }
  const speed = event.cmeSpeedKms;
  if (typeof speed === 'number' && Number.isFinite(speed) && speed > 0) {
    return pick(CME_WITH_SPEED, event.id)(cmeTravelDays(speed));
  }
  return pick(CME_NO_SPEED, event.id);
}

/**
 * Kid-friendly text for a real DONKI event. Deterministic: wording is chosen by a stable hash of event.id.
 * One or two short sentences, each under 15 words, at most 28 words in total.
 */
export function kidTextFor(event: SolarEvent, site: SiteId = 'moon'): string {
  switch (event.kind) {
    case 'FLR':
      return flareText(event, site);
    case 'CME':
      return cmeText(event, site);
    case 'QUIET':
      return site === 'mars' ? MARS_QUIET : pick(QUIET_DAY, event.id);
  }
}
