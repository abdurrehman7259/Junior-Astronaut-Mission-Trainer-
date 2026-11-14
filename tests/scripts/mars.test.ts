import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DonkiMarsSnapshotSchema, MarsSiteInfoSchema } from '../../src/shared/schemas';
import type { SolarEvent } from '../../src/shared/types';
import { fetchMarsRecords } from '../../scripts/fetch-mars-events';
import { buildMarsSite, fetchMarsSite, MARS_SITE_SOURCES } from '../../scripts/fetch-mars-site';
import { buildMarsSnapshot, hasMarsImpact, mapMarsCme, MARS_MODEL_TEXT, selectMarsEvents } from '../../scripts/lib/mars';

const retrievedAt = '2026-11-14T12:00:00Z';
const dateAt = (i: number) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10);
const cme = (speed = 800, location: unknown = 'Mars') => ({
  activityID: '2024-01-01T01:00:00-CME-001', startTime: '2024-01-01T01:00Z',
  link: 'https://ccmc.gsfc.nasa.gov/DONKI/view/CME/1/-1',
  cmeAnalyses: [{ speed, isMostAccurate: true, enlilList: [{ impactList: [{ location }] }] }],
});
const storm = (i: number, severity: 1 | 2 | 3): SolarEvent => ({
  ...mapMarsCme(cme(severity === 3 ? 1000 + i : severity === 2 ? 600 : 400))!,
  id: `CME-${severity}-${i}`, realDate: dateAt(i),
});
const quietDates = Array.from({ length: 15 }, (_, i) => dateAt(200 + i));

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Mars WSA-ENLIL filter and mapping', () => {
  it.each(['Mars', 'MARS', 'mars', 'Mars (glancing)'])('matches impact location %s', (location) => {
    expect(hasMarsImpact(cme(800, location))).toBe(true);
  });
  it.each([null, {}, [], { cmeAnalyses: null }, cme(800, 'Earth'), cme(800, 123),
    { note: 'Mars', impactList: [{ location: 'Mars' }] },
    { cmeAnalyses: [{ note: 'Mars', impactList: [{ location: 'Mars' }], enlilList: [{ note: 'Mars' }] }] },
    { cmeAnalyses: [{ enlilList: [{ impactList: ['Mars', null, { note: 'Mars' }] }] }] },
  ])('rejects unrelated, misplaced or malformed Mars mentions: %j', (raw) => {
    expect(hasMarsImpact(raw)).toBe(false);
    expect(mapMarsCme(raw)).toBeNull();
  });
  it('searches every analysis and run, independently of speed-analysis selection', () => {
    const raw = cme();
    raw.cmeAnalyses.unshift({ speed: 1200, isMostAccurate: true, enlilList: [] });
    expect(mapMarsCme(raw)).toMatchObject({ severity: 3, cmeSpeedKms: 1200, marsImpact: 'listed' });
  });
  it.each([[499, 1], [500, 2], [999, 2], [1000, 3]])('reuses mapCme for speed %i', (speed, severity) => {
    const event = mapMarsCme(cme(speed));
    expect(event).toMatchObject({ severity, realDate: '2024-01-01', kidText: MARS_MODEL_TEXT, marsImpact: 'listed' });
    expect(event?.kidText.split(/\s+/).length).toBeLessThanOrEqual(15);
    expect(Object.keys(event!).sort()).toEqual(['id', 'source', 'kind', 'realDate', 'realTime', 'cmeSpeedKms', 'severity', 'sourceUrl', 'kidText', 'marsImpact'].sort());
  });
  it('does not invent a speed when an impact-listed record cannot map', () => {
    expect(mapMarsCme(cme(0))).toBeNull();
  });
});

describe('Mars deterministic curation and envelope', () => {
  const pool = [1, 2, 3].flatMap((s) => Array.from({ length: 100 }, (_, i) => storm(i, s as 1 | 2 | 3)));
  it('caps each group, keeps the strongest 30, samples endpoints, deduplicates and sorts', () => {
    const selected = selectMarsEvents([...pool, pool[0]], [...quietDates, quietDates[0], ...Array.from({ length: 30 }, (_, i) => dateAt(300 + i))]);
    expect(selected).toHaveLength(95);
    expect([0, 1, 2, 3].map((s) => selected.filter((e) => e.severity === s).length)).toEqual([15, 20, 30, 30]);
    expect(selected.filter((e) => e.severity === 3).map((e) => e.cmeSpeedKms)).toEqual(Array.from({ length: 30 }, (_, i) => 1070 + i));
    for (const severity of [1, 2]) {
      expect(selected.some((e) => e.id === `CME-${severity}-0`)).toBe(true);
      expect(selected.some((e) => e.id === `CME-${severity}-99`)).toBe(true);
    }
    expect(new Set(selected.map((e) => e.id)).size).toBe(selected.length);
    expect(selected.map((e) => `${e.realDate}/${e.id}`)).toEqual(selected.map((e) => `${e.realDate}/${e.id}`).sort());
  });
  it('is invariant to input order, duplicates, and equal-speed ties', () => {
    const conflict = { ...pool[0], kidText: 'Alternate draft.' };
    const events = [...pool, conflict, { ...pool[250], cmeSpeedKms: 1075 }];
    expect(selectMarsEvents(events, quietDates)).toEqual(selectMarsEvents([...events].reverse(), [...quietDates].reverse()));
  });
  it('keeps all events and quiet days below caps; excludes out-of-window and nonlisted storms', () => {
    const events = [storm(1, 3), storm(2, 2), storm(3, 1)];
    const selected = selectMarsEvents([...events, { ...storm(4, 3), marsImpact: 'game-only' },
      { ...storm(5, 3), realDate: '2023-12-31' }], quietDates.slice(0, 7));
    expect(selected).toHaveLength(10);
    const quiet = selected.find((e) => e.kind === 'QUIET')!;
    expect(quiet.id).toBe(`QUIET-${quiet.realDate}`);
    expect(new URL(quiet.sourceUrl).searchParams.get('start')).toBe(`${quiet.realDate}T00:00:00Z`);
    expect(quiet.marsImpact).toBeUndefined();
  });
  it('builds a schema-valid archive and verifies quiet days against all raw records', () => {
    const raw = { CME: Array.from({ length: 10 }, (_, i) => ({ ...cme(1100), activityID: `CME-${i}` })),
      FLR: [{ beginTime: '2024-01-02T22:00Z', endTime: '2024-01-04T01:00Z' }] };
    const { snapshot } = buildMarsSnapshot(raw, retrievedAt, 'Reused test cache.');
    expect(DonkiMarsSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(snapshot.notes).toContain('model prediction, not an observation');
    expect(snapshot.items.filter((e) => e.kind === 'QUIET').every((e) => e.realDate > '2024-01-04')).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(snapshot))).toBeLessThan(120_000);
    expect(() => buildMarsSnapshot({ CME: raw.CME.slice(0, 9), FLR: [] }, retrievedAt, '')).toThrow('Fewer than 10');
    expect(() => buildMarsSnapshot({ CME: raw.CME, FLR: [{}] }, retrievedAt, '')).toThrow('Cannot verify QUIET');
  });
  it('rejects invalid schemas including duplicate IDs and missing Mars labels', () => {
    const value = { retrievedAt, source: 'NASA', sourceUrl: 'https://ccmc.gsfc.nasa.gov/',
      items: selectMarsEvents(pool, quietDates) };
    expect(DonkiMarsSnapshotSchema.safeParse(value).success).toBe(true);
    expect(DonkiMarsSnapshotSchema.safeParse({ ...value, items: [...value.items, value.items[0]] }).success).toBe(false);
    expect(DonkiMarsSnapshotSchema.safeParse({ ...value, items: value.items.map((e) => ({ ...e, marsImpact: undefined })) }).success).toBe(false);
  });
});

describe('Mars raw acquisition (mocked fetch)', () => {
  it('fetches complete keyless 60-day-or-smaller windows when no cache is provided', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(Response.json([])));
    vi.stubGlobal('fetch', fetch);
    expect(await fetchMarsRecords()).toMatchObject({ cachedWindows: 0, fetchedWindows: 26 });
    for (const kind of ['FLR', 'CME']) {
      const urls = fetch.mock.calls.map(([input]) => new URL(String(input))).filter((url) => url.pathname.endsWith(`/${kind}`));
      let next = Date.parse('2024-01-01T00:00Z');
      for (const url of urls) {
        expect(url.origin).toBe('https://ccmc.gsfc.nasa.gov');
        expect(url.searchParams.has('api_key')).toBe(false);
        const start = Date.parse(`${url.searchParams.get('startDate')}T00:00Z`);
        const end = Date.parse(`${url.searchParams.get('endDate')}T00:00Z`);
        expect(start).toBe(next);
        expect(end - start).toBeLessThanOrEqual(59 * 86_400_000);
        next = end + 86_400_000;
      }
      expect(new Date(next).toISOString().slice(0, 10)).toBe('2026-01-01');
    }
  });
  it('reuses split cached ranges and fetches only uncovered dates', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mars-test-'));
    try {
      await writeFile(join(dir, 'CME-2024-01-01-2024-01-30.json'), '[{"cached":1}]');
      await writeFile(join(dir, 'CME-2024-01-31-2024-02-29.json'), '[{"cached":2}]');
      const fetch = vi.fn().mockImplementation(() => Promise.resolve(Response.json([])));
      vi.stubGlobal('fetch', fetch);
      const result = await fetchMarsRecords(dir);
      expect(result.CME).toEqual([{ cached: 1 }, { cached: 2 }]);
      expect(result.cachedWindows).toBe(2);
      expect(result.fetchedWindows).toBe(25);
      const cmeUrls = fetch.mock.calls.map(([input]) => new URL(String(input))).filter((url) => url.pathname.endsWith('/CME'));
      expect(cmeUrls[0].searchParams.get('startDate')).toBe('2024-03-01');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('fails closed for a non-array API response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'unavailable' })));
    await expect(fetchMarsRecords()).rejects.toThrow('did not return an array');
  });
});

describe('Mars site source verification and committed schemas', () => {
  const page = (url: string) => url.endsWith('.pdf') ? '%PDF-1.7 mock verified paper'
    : url.endsWith('/location-map/') ? 'landed in Jezero Crater on Feb. 18, 2021'
    : url.includes('/barsoom/') ? '24 hours, 39 minutes, 35 seconds'
    : url.includes('trek.nasa.gov') ? 'Mars Trek'
    : 'river channels spilled over the crater wall and created a lake';
  it('requires every citation to return 200 and validates the dated facts', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetch = vi.fn().mockImplementation((url: string) => Promise.resolve(new Response(page(url))));
    vi.stubGlobal('fetch', fetch);
    const site = await fetchMarsSite();
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(MARS_SITE_SOURCES.map((s) => s.url));
    expect(MarsSiteInfoSchema.safeParse(site).success).toBe(true);
    expect(site).toMatchObject({ latitude: 18.4, longitude: 77.7, lightTimeMinutes: { min: 4, max: 24 } });
    expect(site.imageUrl).toBeUndefined();
    expect(site.imageCredit).toBeUndefined();
    expect(site.marsTrekUrl).toBe('https://trek.nasa.gov/mars/');
  });
  it('fails on inaccessible sources and changed HTML passages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    await expect(fetchMarsSite()).rejects.toThrow('HTTP 403');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unexpected replacement page')));
    await expect(fetchMarsSite()).rejects.toThrow('passage changed');
    expect(() => MarsSiteInfoSchema.parse({ ...buildMarsSite(retrievedAt), latitude: 100 })).toThrow();
  });
  it('validates both committed snapshots and matches the Moon quiet dates without network access', async () => {
    const fetch = vi.fn(() => { throw new Error('Tests must not use the network'); });
    vi.stubGlobal('fetch', fetch);
    const events = DonkiMarsSnapshotSchema.parse(JSON.parse(await readFile('public/data/donki-mars-events.json', 'utf8')));
    const site = MarsSiteInfoSchema.parse(JSON.parse(await readFile('public/data/mars-site.json', 'utf8')));
    const moon = JSON.parse(await readFile('public/data/donki-events.json', 'utf8')) as { items: SolarEvent[] };
    expect(events.items.filter((e) => e.kind === 'QUIET')).toEqual(moon.items.filter((e) => e.kind === 'QUIET'));
    expect(events.items.every((e) => e.kind === 'QUIET' || (e.kind === 'CME' && e.marsImpact === 'listed'))).toBe(true);
    expect(events.items.length).toBeLessThanOrEqual(120);
    expect(Buffer.byteLength(JSON.stringify(events))).toBeLessThan(120_000);
    expect(site.summary.split(/\s+/).length).toBeLessThanOrEqual(25);
    expect(fetch).not.toHaveBeenCalled();
  });
});
