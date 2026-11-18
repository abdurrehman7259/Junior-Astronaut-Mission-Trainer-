import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DonkiSnapshotSchema, SolarEventSchema } from '../../src/shared/schemas.js';

import { fetchDonkiRecords, WINDOW } from '../../scripts/fetch-donki.js';
import { findQuietDates, mapCme, mapFlare, selectEvents } from '../../scripts/lib/donki.js';
import { fetchJson, HttpNetworkError, redactApiKey } from '../../scripts/lib/http.js';

const link = 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/FLR/123';
const flare = (classType = 'X1.1') => ({
  flrID: '2024-05-10T06:00:00-FLR-001',
  classType,
  beginTime: '2024-05-10T06:00Z',
  peakTime: '2024-05-10T06:27Z',
  link,
});
const cme = (speed = 800) => ({
  activityID: '2024-05-10T08:00:00-CME-001',
  startTime: '2024-05-10T08:00Z',
  cmeAnalyses: [{ speed, isMostAccurate: true }],
  link,
});
const dateAt = (index) => new Date(Date.UTC(2024, 0, 1 + index)).toISOString().slice(0, 10);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('fetchDonkiRecords (mocked network only)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('defaults to keyless CCMC, covers every date, and limits concurrency to three requests', async () => {
    let active = 0;
    let maximumActive = 0;
    const fetch = vi.fn().mockImplementation(async () => {
      active++;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active--;
      return Response.json([]);
    });
    vi.stubGlobal('fetch', fetch);
    await expect(fetchDonkiRecords('SECRET')).resolves.toEqual({ FLR: [], CME: [] });
    expect(fetch).toHaveBeenCalledTimes(26);
    expect(maximumActive).toBe(3);
    const urls = fetch.mock.calls.map((args) => new URL(String(args[0])));
    expect(urls.every((url) => url.origin === 'https://ccmc.gsfc.nasa.gov' && !url.searchParams.has('api_key'))).toBe(
      true,
    );
    for (const kind of ['FLR', 'CME']) {
      const ranges = urls
        .filter((url) => url.pathname === `/DONKI-API/get/${kind}`)
        .sort((a, b) => a.search.localeCompare(b.search));
      expect(ranges).toHaveLength(13);
      let next = Date.parse('2024-01-01T00:00:00Z');
      for (const url of ranges) {
        const start = Date.parse(`${url.searchParams.get('startDate')}T00:00:00Z`);
        const end = Date.parse(`${url.searchParams.get('endDate')}T00:00:00Z`);
        expect(start).toBe(next);
        expect(end - start).toBeLessThanOrEqual(59 * 86_400_000);
        next = end + 86_400_000;
      }
      expect(new Date(next).toISOString().slice(0, 10)).toBe('2026-01-01');
    }
    expect(console.log).toHaveBeenCalledTimes(26);
    expect(vi.mocked(console.log).mock.calls.flat().join(' ')).not.toContain('SECRET');
    expect(vi.mocked(console.log).mock.calls[0][0]).toMatch(
      /^DONKI CCMC FLR 2024-01-01\.\.2024-02-29 \d+ ms records=0 status=ok$/,
    );
  });

  it('requests annual gateway ranges sequentially only when explicitly selected', async () => {
    let active = false;
    const fetch = vi.fn().mockImplementation(async () => {
      expect(active).toBe(false);
      active = true;
      await Promise.resolve();
      active = false;
      return Response.json([flare()]);
    });
    vi.stubGlobal('fetch', fetch);
    const result = await fetchDonkiRecords('SECRET', { gateway: true });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(result.FLR).toHaveLength(2);
    expect(result.CME).toHaveLength(2);
    const urls = fetch.mock.calls.map((args) => new URL(String(args[0])));
    expect(urls.map((url) => url.pathname)).toEqual(['/DONKI/FLR', '/DONKI/CME', '/DONKI/FLR', '/DONKI/CME']);
    expect(urls.map((url) => url.searchParams.get('startDate'))).toEqual([
      '2024-01-01',
      '2024-01-01',
      '2025-01-01',
      '2025-01-01',
    ]);
    expect(urls.every((url) => url.searchParams.get('api_key') === 'SECRET')).toBe(true);
  });

  it.each([404, 403, 429, 500, 503])('falls back once on gateway HTTP %i without retrying it', async (status) => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status }))
      .mockImplementation(() => Promise.resolve(Response.json([])));
    vi.stubGlobal('fetch', fetch);
    await expect(fetchDonkiRecords('SECRET', { gateway: true })).resolves.toEqual({ FLR: [], CME: [] });
    expect(fetch).toHaveBeenCalledTimes(27);
    const urls = fetch.mock.calls.slice(1).map((args) => new URL(String(args[0])));
    expect(urls.every((url) => url.origin === 'https://ccmc.gsfc.nasa.gov' && !url.searchParams.has('api_key'))).toBe(
      true,
    );
    expect(vi.mocked(console.log).mock.calls.flat().join(' ')).not.toContain('SECRET');
  });

  it('falls back after one gateway timeout instead of splitting the legacy range', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(new Error('api_key=SECRET timeout')), { once: true });
          }),
      )
      .mockImplementation(() => Promise.resolve(Response.json([])));
    vi.stubGlobal('fetch', fetch);
    const pending = fetchDonkiRecords('SECRET', { gateway: true });
    await vi.advanceTimersByTimeAsync(19_999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ FLR: [], CME: [] });
    expect(fetch).toHaveBeenCalledTimes(27);
    expect(
      fetch.mock.calls.slice(1).every((args) => new URL(String(args[0])).origin === 'https://ccmc.gsfc.nasa.gov'),
    ).toBe(true);
    expect(vi.mocked(console.log).mock.calls[0][0]).toContain('20000 ms records=unknown status=timeout');
    expect(vi.mocked(console.log).mock.calls.flat().join(' ')).not.toContain('SECRET');
  });

  it('restarts the whole window on CCMC after partial gateway success and a network failure', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json([{ legacy: true }]))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockImplementation(() => Promise.resolve(Response.json([])));
    vi.stubGlobal('fetch', fetch);
    await expect(fetchDonkiRecords('SECRET', { gateway: true })).resolves.toEqual({ FLR: [], CME: [] });
    expect(fetch).toHaveBeenCalledTimes(28);
    expect(new URL(String(fetch.mock.calls[2][0])).searchParams.get('startDate')).toBe('2024-01-01');
  });

  it('does not turn permission errors or a non-array response into quiet days', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    vi.stubGlobal('fetch', fetch);
    await expect(fetchDonkiRecords('SECRET')).rejects.toThrow('HTTP 403');
    expect(fetch).toHaveBeenCalledTimes(3);
    fetch.mockImplementation(() => Promise.resolve(Response.json({ error: 'not a dataset' })));
    await expect(fetchDonkiRecords('SECRET')).rejects.toThrow('did not return a JSON array');
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it('allows a slow 58-second CME response without splitting or retrying', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementation(
      (input) =>
        new Promise((resolve) => {
          setTimeout(() => resolve(Response.json([])), input.pathname.endsWith('/CME') ? 58_000 : 0);
        }),
    );
    vi.stubGlobal('fetch', fetch);
    const pending = fetchDonkiRecords('SECRET');
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({ FLR: [], CME: [] });
    expect(fetch).toHaveBeenCalledTimes(26);
    expect(vi.mocked(console.log).mock.calls.filter(([line]) => String(line).includes('CME'))).toHaveLength(13);
    expect(vi.mocked(console.log).mock.calls.flat().join(' ')).toContain('58000 ms records=0 status=ok');
  });

  it('splits a CCMC range only after 90 seconds without losing either half', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementation((input, init) => {
      const range = `${input.searchParams.get('startDate')}..${input.searchParams.get('endDate')}`;
      if (!input.pathname.endsWith('/FLR')) return Promise.resolve(Response.json([]));
      if (range === '2024-01-01..2024-02-29')
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
        });
      return Promise.resolve(
        Response.json(
          range === '2024-01-01..2024-01-30'
            ? [{ first: true }]
            : range === '2024-01-31..2024-02-29'
              ? [{ second: true }]
              : [],
        ),
      );
    });
    vi.stubGlobal('fetch', fetch);
    const pending = fetchDonkiRecords('SECRET');
    await vi.advanceTimersByTimeAsync(89_999);
    expect(fetch.mock.calls.filter(([url]) => String(url).includes('startDate=2024-01-31'))).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).FLR).toEqual([{ first: true }, { second: true }]);
    expect(fetch).toHaveBeenCalledTimes(28);
    const halves = fetch.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname.endsWith('/FLR') && url.searchParams.get('endDate') <= '2024-02-29');
    expect(halves.map((url) => [url.searchParams.get('startDate'), url.searchParams.get('endDate')])).toEqual([
      ['2024-01-01', '2024-02-29'],
      ['2024-01-01', '2024-01-30'],
      ['2024-01-31', '2024-02-29'],
    ]);
  });

  it.each(['connection', 'HTTP 503', 'HTTP 429'])(
    'splits a CCMC window once after exhausting retries for %s',
    async (failure) => {
      vi.useFakeTimers();
      const fetch = vi.fn().mockImplementation((input) => {
        const range = `${input.searchParams.get('startDate')}..${input.searchParams.get('endDate')}`;
        if (!input.pathname.endsWith('/CME')) return Promise.resolve(Response.json([]));
        if (range === '2024-01-01..2024-02-29') {
          return failure === 'connection'
            ? Promise.reject(new TypeError('terminated'))
            : Promise.resolve(new Response(null, { status: failure === 'HTTP 503' ? 503 : 429 }));
        }
        return Promise.resolve(
          Response.json(
            range === '2024-01-01..2024-01-30'
              ? [{ first: true }]
              : range === '2024-01-31..2024-02-29'
                ? [{ second: true }]
                : [],
          ),
        );
      });
      vi.stubGlobal('fetch', fetch);
      const pending = fetchDonkiRecords('SECRET');
      await vi.advanceTimersByTimeAsync(14_999);
      const firstWindowCalls = () =>
        fetch.mock.calls
          .map(([url]) => new URL(String(url)))
          .filter((url) => url.pathname.endsWith('/CME') && url.searchParams.get('endDate') <= '2024-02-29');
      expect(firstWindowCalls()).toHaveLength(4);
      await vi.advanceTimersByTimeAsync(1);
      expect((await pending).CME).toEqual([{ first: true }, { second: true }]);
      expect(
        firstWindowCalls().map((url) => [url.searchParams.get('startDate'), url.searchParams.get('endDate')]),
      ).toEqual([
        ...Array.from({ length: 5 }, () => ['2024-01-01', '2024-02-29']),
        ['2024-01-01', '2024-01-30'],
        ['2024-01-31', '2024-02-29'],
      ]);
      expect(fetch).toHaveBeenCalledTimes(32);
    },
  );

  // D-017: a failed half is split again (up to MAX_SPLIT_DEPTH) instead of aborting the run.
  it.each(['2024-01-01..2024-01-30', '2024-01-31..2024-02-29'])(
    'splits a failed half %s again and keeps every record',
    async (failedHalf) => {
      vi.useFakeTimers();
      const fetch = vi.fn().mockImplementation((input) => {
        const range = `${input.searchParams.get('startDate')}..${input.searchParams.get('endDate')}`;
        if (input.pathname.endsWith('/CME') && (range === '2024-01-01..2024-02-29' || range === failedHalf)) {
          return Promise.reject(new TypeError('terminated'));
        }
        return Promise.resolve(Response.json(input.pathname.endsWith('/CME') ? [{ range }] : []));
      });
      vi.stubGlobal('fetch', fetch);
      const pending = fetchDonkiRecords('SECRET');
      await vi.runAllTimersAsync();
      const cme = (await pending).CME;
      const firstWindow = cme.filter((r) => r.range.endsWith('2024-02-29') || r.range < '2024-03');
      // The good half is kept once; the failed half arrives as two smaller sub-windows; nothing is lost or duplicated.
      expect(firstWindow.map((r) => r.range)).not.toContain(failedHalf);
      expect(firstWindow.length).toBe(3);
      expect(new Set(firstWindow.map((r) => r.range)).size).toBe(3);
    },
  );

  it('still throws when a window keeps failing all the way down to the split limit', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementation((input) => {
      const end = input.searchParams.get('endDate');
      if (input.pathname.endsWith('/CME') && end <= '2024-02-29') return Promise.reject(new TypeError('terminated'));
      return Promise.resolve(Response.json([]));
    });
    vi.stubGlobal('fetch', fetch);
    const assertion = expect(fetchDonkiRecords('SECRET')).rejects.toThrow('terminated');
    await vi.runAllTimersAsync();
    await assertion;
    const distinct = new Set(
      fetch.mock.calls
        .map(([url]) => new URL(String(url)))
        .filter((url) => url.pathname.endsWith('/CME') && url.searchParams.get('endDate') <= '2024-02-29')
        .map((url) => `${url.searchParams.get('startDate')}..${url.searchParams.get('endDate')}`),
    );
    expect(distinct.size).toBeLessThanOrEqual(6); // the first failing branch stops at depth 5: 1 + 5 windows
  });
});

describe('mapFlare', () => {
  it.each([
    ['X1.1', 3, 'An'],
    ['M5.4', 2, 'An'],
    ['C2.5', 1, 'A'],
    ['A1', 1, 'An'],
    ['B2', 1, 'A'],
  ])('maps %s to game severity %i with the correct article', (classType, severity, article) => {
    const event = mapFlare(flare(classType));
    expect(event).toMatchObject({
      kind: 'FLR',
      severity,
      flareClass: classType,
      id: flare().flrID,
      source: 'DONKI',
      sourceUrl: link,
      realDate: '2024-05-10',
      realTime: '2024-05-10T06:27Z',
    });
    expect(SolarEventSchema.safeParse(event).success).toBe(true);
    expect(event?.kidText).toBe(`${article} ${classType} solar flare peaked on 2024-05-10.`);
    expect(event.kidText.split(/\s+/).length).toBeLessThanOrEqual(15);
  });

  it.each([' x 1.1 ', 'x1.1', ' X1.1 '])('normalises %s', (classType) => {
    expect(mapFlare(flare(classType))?.flareClass).toBe('X1.1');
  });

  it.each(['Z1', 'X', 'X1.2.3', 'X-2', 'M1 class', '', 'X.5'])('rejects invalid class %s', (classType) => {
    expect(mapFlare(flare(classType))).toBeNull();
  });

  it.each([undefined, '', 'http://example.com', 'invalid'])('rejects a missing or non-HTTPS link', (badLink) => {
    expect(mapFlare({ ...flare(), link: badLink })).toBeNull();
  });

  it('uses the UTC peak date and preserves the raw timestamp', () => {
    const peakTime = '2024-05-10T23:27:00-02:00';
    expect(mapFlare({ ...flare(), peakTime })).toMatchObject({ realDate: '2024-05-11', realTime: peakTime });
  });

  it('falls back to beginTime without inventing a peak time', () => {
    const event = mapFlare({ ...flare(), peakTime: null });
    expect(event).toMatchObject({ realDate: '2024-05-10' });
    expect(event).not.toHaveProperty('realTime');
    expect(event?.kidText).toContain('began');
  });

  it('rejects missing ids, undatable records and timestamps without a timezone', () => {
    expect(mapFlare({ ...flare(), flrID: undefined })).toBeNull();
    expect(mapFlare({ ...flare(), beginTime: null, peakTime: 'invalid' })).toBeNull();
    expect(mapFlare({ ...flare(), beginTime: null, peakTime: '2024-05-10T06:27' })).toBeNull();
    expect(mapFlare(null)).toBeNull();
  });
});

describe('mapCme', () => {
  it('rounds only the draft speed, preserving the measurement and severity', () => {
    const event = mapCme(cme(999.6));
    expect(event).toMatchObject({ cmeSpeedKms: 999.6, severity: 2 });
    expect(event?.kidText).toBe('A coronal mass ejection was measured at 1000 km/s on 2024-05-10.');
    expect(event.kidText.split(/\s+/).length).toBeLessThanOrEqual(15);
  });

  it('prefers the most accurate analysis over the first speed', () => {
    const event = mapCme({
      ...cme(),
      cmeAnalyses: [
        { speed: 300, isMostAccurate: false },
        { speed: 1_200, isMostAccurate: true },
      ],
    });
    expect(event).toMatchObject({
      kind: 'CME',
      cmeSpeedKms: 1_200,
      severity: 3,
      id: cme().activityID,
      realDate: '2024-05-10',
      realTime: cme().startTime,
      sourceUrl: link,
    });
    expect(event.kidText.split(/\s+/).length).toBeLessThanOrEqual(15);
  });

  it('falls back to the first valid speed when the preferred analysis has none', () => {
    expect(
      mapCme({ ...cme(), cmeAnalyses: [{ isMostAccurate: true }, { speed: null }, { speed: 600 }, { speed: 1_200 }] })
        ?.cmeSpeedKms,
    ).toBe(600);
  });

  it.each([
    [499, 1],
    [500, 2],
    [999, 2],
    [1_000, 3],
  ])('maps speed %i to game severity %i', (speed, severity) => {
    const event = mapCme(cme(speed));
    expect(event?.severity).toBe(severity);
    expect(SolarEventSchema.safeParse(event).success).toBe(true);
  });

  it.each([undefined, null, 0, -1, NaN, Infinity, '800'])('rejects absent or invalid speed %s', (speed) => {
    expect(mapCme({ ...cme(), cmeAnalyses: [{ speed }] })).toBeNull();
  });

  it('rejects empty analyses, missing links, missing ids and bad timestamps', () => {
    expect(mapCme({ ...cme(), cmeAnalyses: [] })).toBeNull();
    expect(mapCme({ ...cme(), cmeAnalyses: null })).toBeNull();
    expect(mapCme({ ...cme(), link: undefined })).toBeNull();
    expect(mapCme({ ...cme(), link: 'http://example.com' })).toBeNull();
    expect(mapCme({ ...cme(), activityID: undefined })).toBeNull();
    expect(mapCme({ ...cme(), startTime: 'bad' })).toBeNull();
    expect(mapCme(null)).toBeNull();
  });
});

describe('findQuietDates', () => {
  it('excludes unmappable raw events and every date touched by a flare', () => {
    const window = { startDate: '2024-01-01', endDate: '2024-01-20' };
    const rawFlares = [
      {
        beginTime: '2024-01-01T23:00Z',
        peakTime: '2024-01-02T01:00Z',
        endTime: '2024-01-03T00:01Z',
        classType: 'invalid',
      },
    ];
    const rawCmes = [{ startTime: '2024-01-20T12:00Z' }];
    const result = findQuietDates(rawFlares, rawCmes, window);
    expect(result).toHaveLength(15);
    expect(result[0]).toBe('2024-01-04');
    expect(result.at(-1)).toBe('2024-01-19');
    for (const date of ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-20']) {
      expect(result).not.toContain(date);
    }
    expect(findQuietDates(rawFlares, rawCmes, window)).toEqual(result);
  });

  it('spreads deterministic picks across the full window, independent of raw ordering', () => {
    const raw = [flare(), { ...flare(), peakTime: '2025-01-01T01:00Z', beginTime: '2025-01-01T00:00Z' }];
    const result = findQuietDates(raw, [], WINDOW);
    expect(findQuietDates([...raw].reverse(), [], WINDOW)).toEqual(result);
    expect(result).toHaveLength(15);
    expect(result[0]).toBe(WINDOW.startDate);
    expect(result.at(-1)).toBe(WINDOW.endDate);
    expect(new Set(result).size).toBe(15);
  });

  it('converts raw event dates to UTC', () => {
    const dates = findQuietDates([], [{ startTime: '2024-01-01T23:30:00-02:00' }], WINDOW);
    expect(dates).not.toContain('2024-01-02');
  });

  it('fails closed when dates cannot be verified or fewer than 10 are quiet', () => {
    expect(() => findQuietDates([{}], [], WINDOW)).toThrow('no usable UTC date');
    expect(() => findQuietDates([], [], { startDate: '2024-01-01', endDate: '2024-01-09' })).toThrow(
      'need at least 10',
    );
    expect(() => findQuietDates([flare()], [], { startDate: '2024-05-10', endDate: '2024-05-10' })).toThrow('Only 0');
    expect(() => findQuietDates([], [], { startDate: '2024-02-30', endDate: '2024-03-31' })).toThrow('Invalid');
  });
});

function fixtures() {
  const events = [];
  for (let i = 0; i < 70; i++) {
    for (const classType of [`X${1 + i}`, 'M3', 'C1']) {
      events.push(mapFlare({ ...flare(classType), flrID: `${classType}-${i}`, peakTime: `${dateAt(i * 5)}T12:00Z` }));
    }
    events.push(mapCme({ ...cme(1_000 + i * 1_000), activityID: `CME-${i}`, startTime: `${dateAt(i * 5)}T13:00Z` }));
  }
  return events;
}

describe('selectEvents', () => {
  it('enforces all caps, unique ids and chronological sorting; snapshot parses', () => {
    const events = fixtures();
    const quiet = findQuietDates([], [], WINDOW);
    const items = selectEvents([...events, events[0]], [...quiet, quiet[0]]);
    expect(items).toHaveLength(125);
    expect(items.filter((e) => e.severity === 3)).toHaveLength(40);
    expect(items.filter((e) => e.severity === 2)).toHaveLength(40);
    expect(items.filter((e) => e.severity === 1)).toHaveLength(30);
    expect(items.filter((e) => e.kind === 'QUIET')).toHaveLength(15);
    expect(new Set(items.map((e) => e.id)).size).toBe(items.length);
    const keys = items.map((e) => `${e.realDate} ${e.id}`);
    expect(keys).toEqual([...keys].sort());
    expect(selectEvents([...events].reverse(), [...quiet].reverse())).toEqual(items);
    const snapshot = {
      retrievedAt: '2026-11-14T12:00:00Z',
      source: 'NASA DONKI',
      sourceUrl: link,
      window: WINDOW,
      items,
    };
    expect(DonkiSnapshotSchema.parse(snapshot).items).toEqual(items);
    expect(Buffer.byteLength(JSON.stringify(snapshot, null, 2))).toBeLessThan(150_000);
    for (const event of items) expect(event.kidText.split(/\s+/).length).toBeLessThanOrEqual(15);
  });

  it('retains the strongest severity-3 events according to the documented game ranking', () => {
    const items = selectEvents(fixtures(), []);
    const strong = items.filter((e) => e.severity === 3);
    expect(strong.some((e) => e.id === 'X70-69')).toBe(true);
    expect(strong.some((e) => e.id === 'CME-69')).toBe(true);
    expect(strong.some((e) => e.id === 'X1-0')).toBe(false);
    expect(strong.some((e) => e.id === 'CME-0')).toBe(false);
    expect(items.some((e) => e.id === 'M3-0')).toBe(true);
    expect(items.some((e) => e.id === 'M3-69')).toBe(true);
    expect(items.some((e) => e.id === 'C1-0')).toBe(true);
    expect(items.some((e) => e.id === 'C1-69')).toBe(true);
  });

  it('keeps all severity-3 events when there are fewer than 40 and lets the schema reject insufficient data', () => {
    const input = fixtures().slice(0, 12);
    const items = selectEvents(input, []);
    expect(items).toHaveLength(12);
    expect(items.filter((e) => e.severity === 3)).toHaveLength(input.filter((e) => e.severity === 3).length);
    expect(
      DonkiSnapshotSchema.safeParse({ retrievedAt: '2026-11-14T12:00:00Z', source: 'NASA', sourceUrl: link, items })
        .success,
    ).toBe(false);
  });

  it('makes QUIET records without invented measurements and uses current date-search parameters', () => {
    const item = selectEvents([], ['2024-03-02'])[0];
    expect(item).toMatchObject({ id: 'QUIET-2024-03-02', severity: 0, source: 'DONKI' });
    for (const field of ['realTime', 'flareClass', 'cmeSpeedKms']) expect(item).not.toHaveProperty(field);
    const url = new URL(item.sourceUrl);
    expect(url.origin + url.pathname).toBe('https://ccmc.gsfc.nasa.gov/DONKI/events/');
    expect(url.searchParams.get('start')).toBe('2024-03-02T00:00:00Z');
    expect(url.searchParams.get('end')).toBe('2024-03-02T23:59:59Z');
  });
});

describe('fetchJson (mocked network only)', () => {
  it('reports each attempt with duration and record count, excluding retry backoff', async () => {
    vi.useFakeTimers();
    const onRequestComplete = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 503 }))
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve(Response.json([{}, {}])), 30);
            }),
        ),
    );
    const pending = fetchJson('https://api.nasa.gov/?api_key=SECRET', { onRequestComplete });
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual([{}, {}]);
    expect(onRequestComplete.mock.calls).toEqual([
      [{ elapsedMs: 0, recordCount: null, status: 'HTTP 503' }],
      [{ elapsedMs: 30, recordCount: 2, status: 'ok' }],
    ]);
    expect(JSON.stringify(onRequestComplete.mock.calls)).not.toContain('SECRET');
  });

  it('retries transient fetch failures with bounded backoff', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(Response.json([]));
    vi.stubGlobal('fetch', fetch);
    const pending = fetchJson('https://example.com');
    await vi.advanceTimersByTimeAsync(999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['terminated', new TypeError('terminated')],
    ...[
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'EPIPE',
      'UND_ERR_SOCKET',
      'UND_ERR_CONNECT_TIMEOUT',
      'UND_ERR_HEADERS_TIMEOUT',
      'UND_ERR_BODY_TIMEOUT',
    ].map((code) => [
      code,
      new TypeError('body failed', {
        cause: new Error('nested transport error', { cause: { code } }),
      }),
    ]),
  ])('retries a body failure with %s and then succeeds', async (_label, error) => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.reject(error) })
      .mockResolvedValueOnce(Response.json([{ recovered: true }]));
    vi.stubGlobal('fetch', fetch);
    const pending = fetchJson('https://example.com');
    await vi.advanceTimersByTimeAsync(999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual([{ recovered: true }]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-transient TypeError, even with a cyclic cause chain', async () => {
    const failure = new TypeError('invalid request api_key=SECRET');
    failure.cause = failure;
    const fetch = vi.fn().mockRejectedValue(failure);
    vi.stubGlobal('fetch', fetch);
    const error = await fetchJson('https://example.com/?api_key=SECRET').catch((e) => e);
    expect(String(error)).toContain('invalid request api_key=***');
    expect(String(error)).not.toContain('SECRET');
    expect(error).not.toHaveProperty('cause');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('bounds network retries to 1, 2, 4, 8 seconds and redacts the exhausted error', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockRejectedValue(
      new TypeError('body failed api_key=SECRET', {
        cause: new Error('nested api_key=SECRET', { cause: { code: 'UND_ERR_SOCKET' } }),
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const pending = fetchJson('https://example.com/?api_key=SECRET').catch((e) => e);
    for (const [index, delay] of [1_000, 2_000, 4_000, 8_000].entries()) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(fetch).toHaveBeenCalledTimes(index + 1);
      await vi.advanceTimersByTimeAsync(1);
    }
    const error = await pending;
    expect(error).toBeInstanceOf(HttpNetworkError);
    expect(String(error)).toContain('body failed api_key=***');
    expect(String(error)).not.toContain('SECRET');
    expect(error).not.toHaveProperty('cause');
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it('redacts credentials in upstream exceptions and does not preserve a secret cause', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed https://api.nasa.gov/?api_key=SECRET&x=1')));
    const error = await fetchJson('https://api.nasa.gov/?api_key=SECRET').catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain('api_key=***');
    expect(String(error)).not.toContain('SECRET');
    expect(error).not.toHaveProperty('cause');
    expect(redactApiKey('API_KEY=SECRET#frag api_key=OTHER&x=1')).toBe('API_KEY=***#frag api_key=***&x=1');
  });

  it('retries 429 sequentially and honours Retry-After seconds', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '3' } }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetch);
    const pending = fetchJson('https://api.nasa.gov/?api_key=SECRET');
    await vi.advanceTimersByTimeAsync(2_999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('honours an HTTP-date Retry-After', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 503,
          headers: { 'Retry-After': 'Sat, 14 Nov 2026 12:00:04 GMT' },
        }),
      )
      .mockResolvedValueOnce(Response.json([]));
    vi.stubGlobal('fetch', fetch);
    const pending = fetchJson('https://example.com');
    await vi.advanceTimersByTimeAsync(3_999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual([]);
  });

  it('backs off 1, 2, 4, 8 seconds and stops after four retries, with a redacted HTTP error', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(null, { status: 503 })));
    vi.stubGlobal('fetch', fetch);
    const pending = fetchJson('https://api.nasa.gov/?api_key=SECRET').catch((e) => e);
    for (const [index, delay] of [1_000, 2_000, 4_000, 8_000].entries()) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(fetch).toHaveBeenCalledTimes(index + 1);
      await vi.advanceTimersByTimeAsync(1);
    }
    const error = await pending;
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(String(error)).toContain('HTTP 503');
    expect(String(error)).toContain('5 attempt(s)');
    expect(String(error)).not.toContain('SECRET');
  });

  it('does not retry other 4xx responses or echo response bodies', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('api_key=SECRET', { status: 403 }));
    vi.stubGlobal('fetch', fetch);
    await expect(fetchJson('https://api.nasa.gov/?api_key=SECRET')).rejects.toThrow('HTTP 403');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('aborts a request after 20 seconds without leaking the URL', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(new Error('aborted api_key=SECRET')), { once: true });
          }),
      ),
    );
    const pending = fetchJson('https://api.nasa.gov/?api_key=SECRET').catch((e) => e);
    await vi.advanceTimersByTimeAsync(20_000);
    const error = await pending;
    expect(String(error)).toContain('timed out after 20000 ms');
    expect(String(error)).not.toContain('SECRET');
  });

  it('keeps the timeout active while reading the body', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url, init) =>
        Promise.resolve({
          ok: true,
          json: () =>
            new Promise((_resolve, reject) => {
              init.signal.addEventListener('abort', () => reject(new Error('body aborted')), { once: true });
            }),
        }),
      ),
    );
    const pending = fetchJson('https://example.com').catch((e) => e);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(String(await pending)).toContain('timed out');
  });
});
