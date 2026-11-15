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

// Kid wording (D-038): no flare class numbers and no "CME" here. Class and speed sit behind "More details" on the card.
// "storm cloud" is the kid word for a CME; the card links it to the glossary.

const X_FLARE: readonly string[] = [
  'This flare is the strongest class. Raise your shield to protect your crew.',
  'Flare light reaches your base in about 8 minutes. Big flares mean more radiation, so shield up.',
  'Big flash from the Sun! It is the strongest flare class, so power your shield.',
];

const M_FLARE: readonly string[] = [
  'This medium flare is about 10 times stronger than the next smaller class. Shields help your crew.',
  'Flare light reaches your base in about 8 minutes. Medium flares can bring radiation, so shield up.',
  'A medium flash from the Sun! Give your shield some power to help your crew.',
];

const SMALL_FLARE: readonly string[] = [
  'This small flare is a gentle burst of light from the Sun. Your base can relax a bit.',
  'Flare light reaches your base in about 8 minutes. Small flares are gentle, so try some science.',
  'A small flash from the Sun! Small flares are gentle, so your crew can focus on science.',
];

const GENERIC_FLARE: readonly string[] = [
  'A flare is a sudden burst of light from the Sun. Shields help your crew.',
];

const CME_WITH_SPEED: readonly ((days: number) => string)[] = [
  (d) => `A rough guess: this cloud needs ${daysPhrase(d)} to reach the Moon. Strong shields help your crew.`,
  (d) => `This Sun cloud would take ${daysPhrase(d)} to reach the Moon. In this game it hits your base, so shield up!`,
  (d) => `Huge Sun cloud! A rough estimate: ${daysPhrase(d)} to reach the Moon, so shield up.`,
];

const CME_NO_SPEED: readonly string[] = [
  'A huge cloud of gas from the Sun is coming. In this game, it heads for your base, so shield up.',
  'A giant cloud of Sun gas and magnetism is coming. Power your shield to be ready.',
];

const QUIET_DAY: readonly string[] = [
  "NASA's storm log shows no big flares or storm clouds this day. Calm days are great for science.",
  "NASA's records show no big flares or storm clouds this day. Great day for science!",
  'Calm Sun day: no big flares or storm clouds were logged. Your crew can focus on science.',
];

/** Mars flare wording: no "8 minutes" (that is the Earth and Moon light time), no travel claims. */
const MARS_FLARE: Record<'X' | 'M' | 'small', readonly string[]> = {
  X: [
    'This flare is the strongest class. Raise your shield to protect your crew.',
    'Big flash from the Sun! It is the strongest flare class, so power your shield.',
  ],
  M: [
    'This medium flare is about 10 times stronger than the next smaller class. Shields help your crew.',
    'A medium flash from the Sun! Give your shield some power to help your crew.',
  ],
  small: [
    'This small flare is a gentle burst of light from the Sun. Your base can relax a bit.',
    'A small flash from the Sun! Small flares are gentle, so your crew can focus on science.',
  ],
};

/**
 * Mars storm-cloud wording. Whether NASA's model predicted Mars impact is shown once, as the card note
 * (EVENT.marsListed / EVENT.marsGameOnly), so this text does not repeat it.
 */
const MARS_CME: readonly string[] = [
  'A huge cloud of gas left the Sun. In this game, its warning comes a sol late, so plan ahead.',
  'A huge cloud of gas and magnetism left the Sun. In this game, warnings come a sol late, so shield early.',
];

const MARS_QUIET = "NASA's storm log shows no big flares or storm clouds this day.";

function flareText(event: SolarEvent, site: SiteId): string {
  const letter = (event.flareClass ?? '').trim().charAt(0).toUpperCase();
  const mars = site === 'mars';
  if (letter === 'X') return pick(mars ? MARS_FLARE.X : X_FLARE, event.id);
  if (letter === 'M') return pick(mars ? MARS_FLARE.M : M_FLARE, event.id);
  if (letter === 'C' || letter === 'B' || letter === 'A') return pick(mars ? MARS_FLARE.small : SMALL_FLARE, event.id);
  return pick(GENERIC_FLARE, event.id);
}

function cmeText(event: SolarEvent, site: SiteId): string {
  if (site === 'mars') {
    return pick(MARS_CME, event.id);
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
