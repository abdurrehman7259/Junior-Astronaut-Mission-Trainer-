import { afterEach, describe, expect, it, vi } from 'vitest';
import { DONKI_LIVE_BASE, LIVE_LIMIT_BYTES, fetchLiveSpaceWeather, liveUrls } from '../../src/app/live';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const jsonRes = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const NOW = new Date('2026-11-14T10:30:00Z');

const flare = {
  flrID: '2026-11-12T08:00:00-FLR-001',
  classType: 'M2.1',
  beginTime: '2026-11-12T07:50Z',
  peakTime: '2026-11-12T08:00Z',
  link: 'https://ccmc.gsfc.nasa.gov/DONKI/view/FLR/1/-1',
};
const cme = {
  activityID: '2026-11-13T01:00:00-CME-001',
  startTime: '2026-11-13T01:00Z',
  link: 'https://ccmc.gsfc.nasa.gov/DONKI/view/CME/2/-1',
  cmeAnalyses: [{ isMostAccurate: true, speed: 1200 }],
};

/** Answers FLR and CME requests from the fixed DONKI URLs. */
function donki(flares: unknown, cmes: unknown) {
  return vi.fn((url: string) => (url.includes('/FLR?') ? jsonRes(flares) : jsonRes(cmes)));
}

describe('liveUrls', () => {
  it('builds exactly two fixed NASA URLs for the last 7 days', () => {
    const u = liveUrls(NOW);
    expect(u.FLR).toBe(`${DONKI_LIVE_BASE}FLR?startDate=2026-11-07&endDate=2026-11-14`);
    expect(u.CME).toBe(`${DONKI_LIVE_BASE}CME?startDate=2026-11-07&endDate=2026-11-14`);
    expect(new URL(u.FLR).origin).toBe('https://ccmc.gsfc.nasa.gov');
  });
});

describe('fetchLiveSpaceWeather (browser, straight from NASA DONKI)', () => {
  it('returns live data mapped from both feeds, with safe fetch options', async () => {
    const fetchMock = donki([flare], [cme]);
    vi.stubGlobal('fetch', fetchMock);
    const r = await fetchLiveSpaceWeather(undefined, NOW);
    expect(r.live).toBe(true);
    if (r.live) {
      expect(r.fetchedAt).toBe('2026-11-14T10:30:00.000Z');
      expect(r.events.map((e) => e.kind)).toEqual(['FLR', 'CME']);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchMock.mock.calls as unknown as [string, RequestInit][]) {
      expect(url.startsWith(DONKI_LIVE_BASE)).toBe(true);
      expect(init).toMatchObject({ credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
    }
  });

  it('a calm week is still live (no events)', async () => {
    vi.stubGlobal('fetch', donki([], []));
    expect(await fetchLiveSpaceWeather(undefined, NOW)).toEqual({ live: true, fetchedAt: NOW.toISOString(), events: [] });
  });

  it('resolves live:false on an HTTP error', async () => {
    vi.stubGlobal('fetch', () => jsonRes({}, 500));
    expect(await fetchLiveSpaceWeather(undefined, NOW)).toEqual({ live: false });
  });

  it('resolves live:false on invalid JSON or a non-array body', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('<html>', { status: 200 })));
    expect(await fetchLiveSpaceWeather(undefined, NOW)).toEqual({ live: false });
    vi.stubGlobal('fetch', () => jsonRes({ events: 5 }));
    expect(await fetchLiveSpaceWeather(undefined, NOW)).toEqual({ live: false });
  });

  it('drops records that fail mapping (e.g. a link off the NASA allowlist)', async () => {
    vi.stubGlobal('fetch', donki([{ ...flare, link: 'https://evil.example/x' }], []));
    const r = await fetchLiveSpaceWeather(undefined, NOW);
    expect(r).toEqual({ live: true, fetchedAt: NOW.toISOString(), events: [] });
  });

  it('rejects an oversized body (security F1)', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('[' + ' '.repeat(LIVE_LIMIT_BYTES) + ']')));
    expect(await fetchLiveSpaceWeather(undefined, NOW)).toEqual({ live: false });
  });

  it('rejects more than 1000 records', async () => {
    vi.stubGlobal('fetch', () => jsonRes(Array.from({ length: 1001 }, () => ({}))));
    expect(await fetchLiveSpaceWeather(undefined, NOW)).toEqual({ live: false });
  });

  it('resolves live:false after the 3 second timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      (_u: string, init: RequestInit) =>
        new Promise((_res, rej) => {
          init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
        }),
    );
    const p = fetchLiveSpaceWeather();
    await vi.advanceTimersByTimeAsync(3000);
    expect(await p).toEqual({ live: false });
  });
});

describe('fetchLiveSpaceWeather cleanup (SEC-D)', () => {
  it('aborts the other feed when one fails early', async () => {
    let otherSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      if (url.includes('/FLR?')) return jsonRes({}, 500);
      otherSignal = init.signal ?? undefined;
      return new Promise((_res, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
    });
    expect(await fetchLiveSpaceWeather(undefined, NOW)).toEqual({ live: false });
    expect(otherSignal?.aborted).toBe(true);
  });

  it('never rejects on an invalid clock', async () => {
    vi.stubGlobal('fetch', () => jsonRes([]));
    await expect(fetchLiveSpaceWeather(undefined, new Date('invalid'))).resolves.toEqual({ live: false });
  });
});
