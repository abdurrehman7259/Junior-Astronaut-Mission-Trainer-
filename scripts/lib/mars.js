import { DonkiMarsSnapshotSchema } from '../../src/shared/schemas.js';

import { findQuietDates, mapCme } from './donki.js';

export const MARS_WINDOW = { startDate: '2024-01-01', endDate: '2025-12-31' };
export const MARS_MODEL_TEXT = "NASA's space-weather model predicted this CME would reach Mars.";

function record(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
}

/** Only the location in an actual WSA-ENLIL impact list counts, never notes or links. */
export function hasMarsImpact(raw) {
  const analyses = record(raw)?.cmeAnalyses;
  return (
    Array.isArray(analyses) &&
    analyses.some((analysis) => {
      const runs = record(analysis)?.enlilList;
      return (
        Array.isArray(runs) &&
        runs.some((run) => {
          const impacts = record(run)?.impactList;
          return (
            Array.isArray(impacts) &&
            impacts.some((impact) => {
              const location = record(impact)?.location;
              return typeof location === 'string' && /Mars/i.test(location);
            })
          );
        })
      );
    })
  );
}

export function mapMarsCme(raw) {
  if (!hasMarsImpact(raw)) return null;
  const mapped = mapCme(raw);
  return mapped ? { ...mapped, marsImpact: 'listed', kidText: MARS_MODEL_TEXT } : null;
}

const textOrder = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const chronological = (a, b) => textOrder(a.realDate, b.realDate) || textOrder(a.id, b.id);

function evenlySpaced(values, count) {
  if (values.length <= count) return [...values];
  return Array.from({ length: count }, (_, i) => values[Math.round((i * (values.length - 1)) / (count - 1))]);
}

export function selectMarsEvents(events, quietDates) {
  const unique = new Map();
  for (const event of [...events].sort(
    (a, b) => chronological(a, b) || textOrder(JSON.stringify(a), JSON.stringify(b)),
  )) {
    if (
      event.kind === 'CME' &&
      event.marsImpact === 'listed' &&
      event.realDate >= MARS_WINDOW.startDate &&
      event.realDate <= MARS_WINDOW.endDate &&
      !unique.has(event.id)
    )
      unique.set(event.id, event);
  }
  const storms = [...unique.values()];
  const strong = storms
    .filter((e) => e.severity === 3)
    .sort((a, b) => (b.cmeSpeedKms ?? 0) - (a.cmeSpeedKms ?? 0) || chronological(a, b))
    .slice(0, 30);
  const moderate = evenlySpaced(storms.filter((e) => e.severity === 2).sort(chronological), 30);
  const minor = evenlySpaced(storms.filter((e) => e.severity === 1).sort(chronological), 20);
  const quiet = evenlySpaced(
    [...new Set(quietDates)].filter((date) => date >= MARS_WINDOW.startDate && date <= MARS_WINDOW.endDate).sort(),
    15,
  ).map((date) => {
    const url = new URL('https://ccmc.gsfc.nasa.gov/DONKI/events/');
    url.searchParams.set('start', `${date}T00:00:00Z`);
    url.searchParams.set('end', `${date}T23:59:59Z`);
    return {
      id: `QUIET-${date}`,
      source: 'DONKI',
      kind: 'QUIET',
      realDate: date,
      severity: 0,
      sourceUrl: url.toString(),
      kidText: `No flares or CMEs were recorded on ${date}.`,
    };
  });
  return [...strong, ...moderate, ...minor, ...quiet].sort(chronological);
}

export function buildMarsSnapshot(raw, retrievedAt, cacheNote) {
  const pool = raw.CME.map(mapMarsCme)
    .filter((e) => e !== null)
    .filter((e) => e.realDate >= MARS_WINDOW.startDate && e.realDate <= MARS_WINDOW.endDate);
  if (new Set(pool.map((e) => e.id)).size < 10) {
    throw new Error('Fewer than 10 mappable Mars-listed CMEs; stop for review');
  }
  const quietDates = findQuietDates(raw.FLR, raw.CME, MARS_WINDOW);
  const snapshot = DonkiMarsSnapshotSchema.parse({
    retrievedAt,
    source: 'NASA DONKI (CCMC): CMEs whose WSA-ENLIL model run predicted a Mars impact',
    sourceUrl: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/',
    window: MARS_WINDOW,
    notes:
      `Archived (retrieved ${retrievedAt.slice(0, 10)}). ${cacheNote} ` +
      'Mars impact means a model prediction, not an observation. Dates are CME start dates at the Sun, not predicted arrival dates. ' +
      'Selection: up to 30 strongest severity-3 CMEs by speed; endpoint-inclusive evenly spaced chronological picks of up to 30 severity-2 and 20 severity-1 CMEs; all verified quiet dates up to 15. ' +
      'Quiet dates reuse the Moon method: no raw FLR or CME, excluding every day touched by flare begin/peak/end times. ' +
      'Severity uses the shared DONKI game-rule speed bands, not measured impacts or radiation dose. Snapshot assembled from the stated inputs at retrievedAt; cached records were not refreshed upstream.',
    items: selectMarsEvents(pool, quietDates),
  });
  if (snapshot.items.length > 120 || Buffer.byteLength(JSON.stringify(snapshot, null, 2) + '\n') >= 120_000) {
    throw new Error('Mars snapshot exceeds 120 items or 120 KB');
  }
  return { snapshot, pool };
}
