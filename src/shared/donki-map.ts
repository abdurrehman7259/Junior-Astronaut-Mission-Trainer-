/**
 * DONKI record mappers, shared by the fetch scripts and the browser's live banner (D-040: no server function).
 * Pure: no I/O. Severity bands are game rules, not measurements.
 */
import { SolarEventSchema } from './schemas';
import type { Severity, SolarEvent } from './types';

/** Game rules only; these bands do not describe measured effects or radiation dose. */
export const SEVERITY_RULES = {
  flare: { A: 1, B: 1, C: 1, M: 2, X: 3 },
  cme: [
    { belowKms: 500, severity: 1 },
    { belowKms: 1_000, severity: 2 },
    { belowKms: Infinity, severity: 3 },
  ],
} as const;

export type RawRecord = Record<string, unknown>;

export function record(value: unknown): RawRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as RawRecord : null;
}

/** Require an explicit timezone so results never depend on the machine's timezone. */
export function utcDate(value: unknown): string | undefined {
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
