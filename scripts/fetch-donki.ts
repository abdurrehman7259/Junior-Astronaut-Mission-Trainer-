import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DonkiSnapshotSchema } from '../src/shared/schemas';
import type { Snapshot, SolarEvent } from '../src/shared/types';
import { findQuietDates, mapCme, mapFlare, selectEvents } from './lib/donki';
import { fetchJson, HttpError, HttpNetworkError, HttpTimeoutError, redactApiKey } from './lib/http';

export const WINDOW = { startDate: '2024-01-01', endDate: '2025-12-31' } as const;
export const SNAPSHOT_NOTES = 'Archived DONKI records: up to 40 strongest severity-3 events (game ranking: X multiplier or CME speed/1000), evenly spaced picks of up to 40 severity-2 and 30 severity-1 events, and 15 dates with no raw FLR or CME records, conservatively excluding all days touched by flare begin/peak/end times. Game-rule severity bands: A/B/C=1, M=2, X=3; CME speeds <500 km/s=1, 500–999 km/s=2, >=1000 km/s=3.';
const OUTPUT = fileURLToPath(new URL('../public/data/donki-events.json', import.meta.url));
const CCMC_BASE = 'https://ccmc.gsfc.nasa.gov/DONKI-API/get';
const GATEWAY_BASE = 'https://api.nasa.gov/DONKI';
const CCMC_CONCURRENCY = 3;

type RawDonki = { FLR: unknown[]; CME: unknown[] };
type DateWindow = { startDate: string; endDate: string };

async function fetchRange(
  base: string, kind: 'FLR' | 'CME', window: DateWindow, apiKey?: string, canSplit = true,
): Promise<unknown[]> {
  const url = new URL(`${base}/${kind}`);
  url.searchParams.set('startDate', window.startDate);
  url.searchParams.set('endDate', window.endDate);
  if (apiKey !== undefined) url.searchParams.set('api_key', apiKey);
  let response: unknown;
  try {
    response = await fetchJson(url, {
      timeoutMs: base === CCMC_BASE ? 90_000 : 20_000,
      // A failing legacy gateway must immediately yield to CCMC, without retries.
      ...(base === GATEWAY_BASE ? { retries: 0 } : {}),
      onRequestComplete: ({ elapsedMs, recordCount, status }) => {
        console.log(`DONKI ${base === CCMC_BASE ? 'CCMC' : 'gateway'} ${kind} ${window.startDate}..${window.endDate} ${elapsedMs} ms records=${recordCount ?? 'unknown'} status=${status}`);
      },
    });
  } catch (error) {
    const start = Date.parse(`${window.startDate}T00:00:00Z`);
    const end = Date.parse(`${window.endDate}T00:00:00Z`);
    const retryable = error instanceof HttpTimeoutError || error instanceof HttpNetworkError
      || (error instanceof HttpError && (error.status === 429 || (error.status >= 500 && error.status <= 599)));
    // Split a slow or exhausted CCMC window once, keeping both halves mandatory.
    if (base !== CCMC_BASE || !canSplit || !retryable || start >= end) throw error;
    const dayMs = 86_400_000;
    const middle = start + Math.floor((end - start) / dayMs / 2) * dayMs;
    const first = await fetchRange(base, kind, {
      startDate: window.startDate, endDate: new Date(middle).toISOString().slice(0, 10),
    }, apiKey, false);
    const second = await fetchRange(base, kind, {
      startDate: new Date(middle + dayMs).toISOString().slice(0, 10), endDate: window.endDate,
    }, apiKey, false);
    return [...first, ...second];
  }
  // An error object or empty body must not be mistaken for an event-free range.
  if (!Array.isArray(response)) throw new Error(`DONKI ${kind} ${window.startDate} did not return a JSON array`);
  return response;
}

async function fetchWindows(
  base: string, windows: DateWindow[], apiKey?: string, concurrency = 1,
): Promise<RawDonki> {
  const raw: RawDonki = { FLR: [], CME: [] };
  // Each worker issues one request at a time, including retries and split ranges.
  // Promise.all preserves window order regardless of response completion order.
  for (let i = 0; i < windows.length; i += concurrency) {
    const batch = await Promise.all(windows.slice(i, i + concurrency).map(async (window) => ({
      FLR: await fetchRange(base, 'FLR', window, apiKey),
      CME: await fetchRange(base, 'CME', window, apiKey),
    })));
    for (const records of batch) {
      raw.FLR.push(...records.FLR);
      raw.CME.push(...records.CME);
    }
  }
  return raw;
}

export async function fetchDonkiRecords(apiKey: string, options: { gateway?: boolean } = {}): Promise<RawDonki> {
  if (options.gateway) {
    const annualWindows = [
      { startDate: WINDOW.startDate, endDate: '2024-12-31' },
      { startDate: '2025-01-01', endDate: WINDOW.endDate },
    ];
    try {
      return await fetchWindows(GATEWAY_BASE, annualWindows, apiKey);
    } catch {
      // Restart the entire window once on CCMC after any legacy failure.
      console.log('NASA DONKI gateway failed; falling back to the current NASA CCMC service.');
    }
  }
  // Current NASA service: https://ccmc.gsfc.nasa.gov/tools/DONKI/
  // 13 windows x 2 kinds = 26 requests without retries/splits, with no API key.
  const windows: Array<{ startDate: string; endDate: string }> = [];
  const dayMs = 86_400_000;
  const end = Date.parse(`${WINDOW.endDate}T00:00:00Z`);
  for (let start = Date.parse(`${WINDOW.startDate}T00:00:00Z`); start <= end; start += 60 * dayMs) {
    windows.push({
      startDate: new Date(start).toISOString().slice(0, 10),
      endDate: new Date(Math.min(start + 59 * dayMs, end)).toISOString().slice(0, 10),
    });
  }
  return fetchWindows(CCMC_BASE, windows, undefined, CCMC_CONCURRENCY);
}

export async function main(): Promise<void> {
  try { process.loadEnvFile('.env'); } catch { /* Environment variables or DEMO_KEY suffice. */ }
  // CCMC is the default; --ccmc remains a redundant compatible flag.
  const raw = await fetchDonkiRecords(process.env.NASA_API_KEY || 'DEMO_KEY', {
    gateway: process.argv.includes('--gateway'),
  });
  const quietDates = findQuietDates(raw.FLR, raw.CME, WINDOW);
  const mapped = [...raw.FLR.map(mapFlare), ...raw.CME.map(mapCme)]
    .filter((event): event is SolarEvent => event !== null)
    .filter((event) => event.realDate >= WINDOW.startDate && event.realDate <= WINDOW.endDate);
  const retrievedAt = new Date().toISOString();
  const snapshot: Snapshot<SolarEvent> = DonkiSnapshotSchema.parse({
    retrievedAt,
    source: 'NASA DONKI (Space Weather Database Of Notifications, Knowledge, Information), CCMC',
    sourceUrl: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/',
    window: WINDOW,
    notes: SNAPSHOT_NOTES,
    items: selectEvents(mapped, quietDates),
  });
  const json = `${JSON.stringify(snapshot, null, 2)}\n`;
  const bytes = Buffer.byteLength(json, 'utf8');
  if (snapshot.items.length > 150 || bytes >= 150_000) {
    throw new Error(`Snapshot exceeds limits: ${snapshot.items.length} items, ${bytes} bytes`);
  }
  await mkdir(dirname(OUTPUT), { recursive: true });
  const temporary = `${OUTPUT}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, json, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, OUTPUT);
  } finally {
    await rm(temporary, { force: true });
  }
  const byKind = { FLR: 0, CME: 0, QUIET: 0 };
  const bySeverity = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const event of snapshot.items) {
    byKind[event.kind]++;
    bySeverity[event.severity]++;
  }
  console.log(`Archived (retrieved ${retrievedAt.slice(0, 10)}): ${snapshot.items.length} items; kinds ${JSON.stringify(byKind)}; severities ${JSON.stringify(bySeverity)}; ${bytes} bytes; ${OUTPUT}`);
  console.log(`QUIET picks: ${quietDates[0]} to ${quietDates[quietDates.length - 1]}; raw FLR=${raw.FLR.length}, CME=${raw.CME.length}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error: unknown) => {
    console.error(redactApiKey(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
}
