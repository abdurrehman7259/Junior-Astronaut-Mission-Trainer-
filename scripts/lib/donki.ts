import { SolarEventSchema } from '../../src/shared/schemas';
import type { Severity, SolarEvent } from '../../src/shared/types';

/** Game rules only; these bands do not describe measured effects or radiation dose. */
export const SEVERITY_RULES = {
  flare: { A: 1, B: 1, C: 1, M: 2, X: 3 },
  cme: [
    { belowKms: 500, severity: 1 },
    { belowKms: 1_000, severity: 2 },
    { belowKms: Infinity, severity: 3 },
  ],
} as const;

type DateWindow = { startDate: string; endDate: string };
type RawRecord = Record<string, unknown>;
const DAY_MS = 86_400_000;

function record(value: unknown): RawRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as RawRecord : null;
}

/** Require an explicit timezone so results never depend on the machine's timezone. */
function utcDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    return undefined;
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return undefined;
  const date = new Date(ms).toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}

function eventOrNull(value: unknown): SolarEvent | null {
  const parsed = SolarEventSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function mapFlare(raw: unknown): SolarEvent | null {
  const flare = record(raw);
  if (!flare || typeof flare.classType !== 'string') return null;
  const flareClass = flare.classType.trim().toUpperCase().replace(/\s+/g, '');
  if (!/^[ABCMX]\d+(\.\d+)?$/.test(flareClass)) return null;
  const peakDate = utcDate(flare.peakTime);
  const realDate = peakDate ?? utcDate(flare.beginTime);
  if (!realDate) return null;
  const letter = flareClass[0] as keyof typeof SEVERITY_RULES.flare;
  return eventOrNull({
    id: flare.flrID,
    source: 'DONKI',
    kind: 'FLR',
    realDate,
    ...(typeof flare.peakTime === 'string' && flare.peakTime.length > 0
      ? { realTime: flare.peakTime } : {}),
    flareClass,
    severity: SEVERITY_RULES.flare[letter],
    sourceUrl: flare.link,
    kidText: `${'AMX'.includes(letter) ? 'An' : 'A'} ${flareClass} solar flare ${peakDate ? 'peaked' : 'began'} on ${realDate}.`,
  });
}

function validSpeed(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function mapCme(raw: unknown): SolarEvent | null {
  const cme = record(raw);
  if (!cme || !Array.isArray(cme.cmeAnalyses)) return null;
  const analyses = cme.cmeAnalyses.map(record).filter((a): a is RawRecord => a !== null);
  const best = analyses.find((a) => a.isMostAccurate === true && validSpeed(a.speed))
    ?? analyses.find((a) => validSpeed(a.speed));
  const speed = best?.speed;
  const realDate = utcDate(cme.startTime);
  if (!validSpeed(speed) || !realDate) return null;
  const severity: Severity = SEVERITY_RULES.cme.find((band) => speed < band.belowKms)!.severity;
  return eventOrNull({
    id: cme.activityID,
    source: 'DONKI',
    kind: 'CME',
    realDate,
    realTime: cme.startTime,
    cmeSpeedKms: speed,
    severity,
    sourceUrl: cme.link,
    kidText: `A coronal mass ejection was measured at ${Math.round(speed)} km/s on ${realDate}.`,
  });
}

/** Evenly spaced, endpoint-inclusive picks from an already sorted list. */
/** QUIET days: at least the schema minimum (10), at most 15. Solar maximum 2024-2025 has only 13 (D-016). */
export const QUIET_MIN = 10;
export const QUIET_MAX = 15;

function evenlySpaced<T>(values: readonly T[], count: number): T[] {
  if (values.length <= count) return [...values];
  if (count <= 0) return [];
  if (count === 1) return [values[Math.floor((values.length - 1) / 2)]];
  return Array.from({ length: count }, (_, i) => values[Math.round(i * (values.length - 1) / (count - 1))]);
}

function windowBounds(window: DateWindow): [number, number] {
  const start = Date.parse(`${window.startDate}T00:00:00Z`);
  const end = Date.parse(`${window.endDate}T00:00:00Z`);
  if (![start, end].every(Number.isFinite) || start > end
    || new Date(start).toISOString().slice(0, 10) !== window.startDate
    || new Date(end).toISOString().slice(0, 10) !== window.endDate) {
    throw new Error('Invalid DONKI date window');
  }
  return [start, end];
}

/**
 * Count raw records even if their class, speed or link prevents mapping.
 * Conservatively exclude every UTC day touched by a flare's begin/peak/end times.
 * Undatable raw records fail closed rather than allowing an unverified QUIET day.
 */
export function findQuietDates(
  rawFlares: readonly unknown[], rawCmes: readonly unknown[], window: DateWindow,
): string[] {
  const [start, end] = windowBounds(window);
  const busy = new Set<string>();
  for (const [records, fields] of [
    [rawFlares, ['beginTime', 'peakTime', 'endTime']],
    [rawCmes, ['startTime']],
  ] as const) {
    for (const raw of records) {
      const item = record(raw);
      const dates = fields.map((field) => utcDate(item?.[field])).filter((d): d is string => d !== undefined).sort();
      if (dates.length === 0) throw new Error('Cannot verify QUIET days: a raw DONKI record has no usable UTC date');
      const first = Math.max(start, Date.parse(`${dates[0]}T00:00:00Z`));
      const last = Math.min(end, Date.parse(`${dates[dates.length - 1]}T00:00:00Z`));
      for (let day = first; day <= last; day += DAY_MS) busy.add(new Date(day).toISOString().slice(0, 10));
    }
  }
  const candidates: string[] = [];
  for (let day = start; day <= end; day += DAY_MS) {
    const date = new Date(day).toISOString().slice(0, 10);
    if (!busy.has(date)) candidates.push(date);
  }
  if (candidates.length < QUIET_MIN) {
    throw new Error(`Only ${candidates.length} truly QUIET dates in the DONKI window; need at least ${QUIET_MIN}`);
  }
  return evenlySpaced(candidates, QUIET_MAX);
}

function quietEvent(date: string): SolarEvent {
  // Verified current DONKI UI parameters: start/end, not startDate/endDate.
  const url = new URL('https://ccmc.gsfc.nasa.gov/DONKI/events/');
  url.searchParams.set('start', `${date}T00:00:00Z`);
  url.searchParams.set('end', `${date}T23:59:59Z`);
  return SolarEventSchema.parse({
    id: `QUIET-${date}`, source: 'DONKI', kind: 'QUIET', realDate: date, severity: 0,
    sourceUrl: url.toString(),
    kidText: `No flares or CMEs were recorded on ${date}.`,
  });
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function chronological(a: SolarEvent, b: SolarEvent): number {
  return compareText(a.realDate, b.realDate) || compareText(a.id, b.id);
}

/**
 * Game curation ranking only: X-class multiplier and CME speed / 1000.
 * This ordering is not a scientific equivalence between flares and CMEs.
 */
function strength(event: SolarEvent): number {
  return event.kind === 'FLR' ? Number(event.flareClass?.slice(1)) : (event.cmeSpeedKms ?? 0) / 1_000;
}

export function selectEvents(events: readonly SolarEvent[], quietDates: readonly string[]): SolarEvent[] {
  // Canonicalize duplicate records independently of response order.
  const unique = new Map<string, SolarEvent>();
  for (const event of [...events].sort((a, b) => chronological(a, b)
    || compareText(JSON.stringify(a), JSON.stringify(b)))) {
    if (!unique.has(event.id)) unique.set(event.id, event);
  }
  const mapped = [...unique.values()].filter((e) => e.kind !== 'QUIET');
  const strong = mapped.filter((e) => e.severity === 3)
    .sort((a, b) => strength(b) - strength(a) || chronological(a, b)).slice(0, 40);
  const moderate = evenlySpaced(mapped.filter((e) => e.severity === 2).sort(chronological), 40);
  const minor = evenlySpaced(mapped.filter((e) => e.severity === 1).sort(chronological), 30);
  const quiet = evenlySpaced([...new Set(quietDates)].sort(), QUIET_MAX).map(quietEvent);
  return [...strong, ...moderate, ...minor, ...quiet].sort(chronological);
}
