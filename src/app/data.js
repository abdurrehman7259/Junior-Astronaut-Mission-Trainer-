import {
  DoseCalibrationSchema,
  DonkiMarsSnapshotSchema,
  DonkiSnapshotSchema,
  MarsSiteInfoSchema,
  OsdrSnapshotSchema,
} from '../shared/schemas.js';
import { SITES } from '../shared/sites.js';

import { STUB_EVENTS, isStubEvent } from './stub-events.js';

// Dev and test builds only (Next.js sets NODE_ENV to 'production' for production builds).
const canUsePlaceholder = () => process.env.NODE_ENV !== 'production';

/**
 * Load the archived DONKI snapshot. Placeholder (stub) events are returned only in dev and test,
 * flagged isPlaceholder. In a production build a failure throws: stub data is never shown as real.
 */
export async function loadEvents() {
  try {
    const res = await fetch('/data/donki-events.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const snapshot = DonkiSnapshotSchema.parse(await res.json());
    // Placeholder ids mean the snapshot is not real data: invalid in every build.
    if (snapshot.items.some(isStubEvent)) throw new Error('snapshot contains placeholder events');
    return { events: snapshot.items, retrievedAt: snapshot.retrievedAt, isPlaceholder: false };
  } catch (err) {
    if (canUsePlaceholder()) {
      return { events: STUB_EVENTS, retrievedAt: null, isPlaceholder: true };
    }
    throw err;
  }
}

async function loadOne(url, parse, timeoutMs) {
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
    if (!res.ok) return null;
    return parse(await res.json());
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const MARS_SITE_TIMEOUT_MS = 3000;

/** Optional extras (OSDR facts, RadLab note). Each one fails alone to null; the game never depends on them. */
export async function loadExtras() {
  const [osdr, radlab] = await Promise.all([
    loadOne('/data/osdr-facts.json', (j) => OsdrSnapshotSchema.parse(j)),
    loadOne('/data/radlab-dose.json', (j) => DoseCalibrationSchema.parse(j)),
  ]);
  return { osdr, radlab };
}

/**
 * Load the archived Mars events and the Mars site facts. Null when the events file is missing or invalid.
 * There is no placeholder for Mars, even in dev: without real data Mars is unavailable.
 */
export async function loadMarsData() {
  // Events and the optional site facts load in parallel. The site is time-bounded and may be null.
  const [snapshot, site] = await Promise.all([
    loadOne(SITES.mars.eventsFile, (j) => DonkiMarsSnapshotSchema.parse(j)),
    loadOne('/data/mars-site.json', (j) => MarsSiteInfoSchema.parse(j), MARS_SITE_TIMEOUT_MS),
  ]);
  if (!snapshot || snapshot.items.some(isStubEvent)) return null;
  return { events: snapshot.items, retrievedAt: snapshot.retrievedAt, site };
}
