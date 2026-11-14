import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEvents, loadMarsData } from '../../src/app/data';
import { fetchLiveSpaceWeather } from '../../src/app/live';
import type { SolarEvent } from '../../src/shared/types';

const SRC = 'https://ccmc.gsfc.nasa.gov/tools/DONKI/';
const ev = (id: string, kind: SolarEvent['kind'], severity: SolarEvent['severity'], i: number): SolarEvent => ({
  id,
  source: 'DONKI',
  kind,
  realDate: `2024-03-${String((i % 28) + 1).padStart(2, '0')}`,
  severity,
  kidText: 'Something happened on the Sun.',
  sourceUrl: SRC,
  ...(kind === 'CME' ? { cmeSpeedKms: 800, marsImpact: 'listed' as const } : {}),
  ...(kind === 'FLR' ? { flareClass: 'X1.0' } : {}),
});

/** Valid for DonkiSnapshotSchema: 30 items, 5 severity-3, 10 QUIET. */
function moonItems(prefix: string): SolarEvent[] {
  return [
    ...Array.from({ length: 5 }, (_, i) => ev(`${prefix}-F${i}`, 'FLR', 3, i)),
    ...Array.from({ length: 15 }, (_, i) => ev(`${prefix}-C${i}`, 'FLR', 1, i + 5)),
    ...Array.from({ length: 10 }, (_, i) => ev(`${prefix}-Q${i}`, 'QUIET', 0, i + 20)),
  ];
}
/** Valid for DonkiMarsSnapshotSchema. */
function marsItems(prefix: string): SolarEvent[] {
  return [
    ...Array.from({ length: 9 }, (_, i) => ev(`${prefix}-S${i}`, 'CME', ((i % 3) + 1) as 1 | 2 | 3, i)),
    ...Array.from({ length: 8 }, (_, i) => ev(`${prefix}-Q${i}`, 'QUIET', 0, i + 10)),
  ];
}
const snap = (items: SolarEvent[]) => ({
  retrievedAt: '2026-11-14T08:00:00Z',
  source: 'NASA DONKI',
  sourceUrl: SRC,
  items,
});
const jsonRes = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
const notFound = () => Promise.resolve(new Response('no', { status: 404 }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('placeholder events at ingestion boundaries', () => {
  it('loadEvents accepts a real snapshot', async () => {
    vi.stubGlobal('fetch', () => jsonRes(snap(moonItems('REAL'))));
    const r = await loadEvents();
    expect(r.isPlaceholder).toBe(false);
    expect(r.events).toHaveLength(30);
  });

  it('loadEvents treats a snapshot with a STUB item as invalid (dev falls back, flagged)', async () => {
    const items = moonItems('REAL');
    items[0] = { ...items[0]!, id: 'STUB-FLR-1' };
    vi.stubGlobal('fetch', () => jsonRes(snap(items)));
    const r = await loadEvents();
    expect(r.isPlaceholder).toBe(true);
    expect(r.events.every((e) => e.id.startsWith('STUB-'))).toBe(true);
    expect(r.retrievedAt).toBeNull();
  });

  it('loadEvents throws in production for a snapshot with a STUB item', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('MODE', 'production');
    const items = moonItems('REAL');
    items[3] = { ...items[3]!, id: 'STUB-FLR-9' };
    vi.stubGlobal('fetch', () => jsonRes(snap(items)));
    await expect(loadEvents()).rejects.toThrow();
  });

  it('loadMarsData rejects a snapshot with a STUB item', async () => {
    const items = marsItems('M');
    items[0] = { ...items[0]!, id: 'STUB-CME-1' };
    vi.stubGlobal('fetch', (url: string) => (url.includes('mars-site') ? notFound() : jsonRes(snap(items))));
    expect(await loadMarsData()).toBeNull();
  });

  it('fetchLiveSpaceWeather returns live:false when any event is a STUB', async () => {
    vi.stubGlobal('fetch', () =>
      jsonRes({
        live: true,
        fetchedAt: '2026-11-14T10:30:00Z',
        events: [ev('STUB-QUIET-10', 'QUIET', 0, 1)],
      }),
    );
    expect(await fetchLiveSpaceWeather()).toEqual({ live: false });
  });
});

describe('optional Mars metadata', () => {
  it('returns events with site null when mars-site.json stalls past 3 s', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      if (url.includes('mars-site')) {
        return new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }
      return jsonRes(snap(marsItems('M')));
    });
    const p = loadMarsData();
    await vi.advanceTimersByTimeAsync(3100);
    const r = await p;
    expect(r).not.toBeNull();
    expect(r!.site).toBeNull();
    expect(r!.events).toHaveLength(17);
  });

  it('returns site null when mars-site.json fails fast', async () => {
    vi.stubGlobal('fetch', (url: string) => (url.includes('mars-site') ? notFound() : jsonRes(snap(marsItems('M')))));
    const r = await loadMarsData();
    expect(r?.site).toBeNull();
    expect(r?.events).toHaveLength(17);
  });
});
