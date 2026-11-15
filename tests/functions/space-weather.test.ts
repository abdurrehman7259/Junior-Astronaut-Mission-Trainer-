import { afterEach, describe, expect, it, vi } from 'vitest';
import handler, { buildLiveResponse } from '../../netlify/functions/space-weather';
import { mapCme, mapFlare } from '../../scripts/lib/donki';
import { LiveSpaceWeatherSchema } from '../../src/shared/schemas';

const NOW = new Date('2026-11-01T00:30:00+05:00');
const flare = {
  flrID: 'flare-1', classType: 'M1.2', peakTime: '2026-10-30T12:00Z',
  link: 'https://ccmc.gsfc.nasa.gov/DONKI/view/FLR/1',
};
const cme = {
  activityID: 'cme-1', startTime: '2026-10-25T12:00Z',
  cmeAnalyses: [{ isMostAccurate: true, speed: 750 }],
  link: 'https://ccmc.gsfc.nasa.gov/DONKI/view/CME/1',
};

function mockFeeds(flares: unknown = [], cmes: unknown = []) {
  return vi.fn<typeof fetch>().mockImplementation(async (input) =>
    Response.json(new URL(String(input)).pathname.endsWith('/FLR') ? flares : cmes));
}

async function expectFallback(response: Response, status = 200) {
  expect(response.status).toBe(status);
  expect(response.headers.get('Content-Type')).toBe('application/json');
  expect(response.headers.get('Cache-Control')).toBe('public, max-age=60');
  expect(response.headers.has('Set-Cookie')).toBe(false);
  const body: unknown = await response.json();
  expect(body).toEqual({ live: false });
  expect(LiveSpaceWeatherSchema.safeParse(body).success).toBe(true);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('space-weather', () => {
  it('maps both feeds identically to snapshots, skips nulls, and sorts by date', async () => {
    const response = await buildLiveResponse(mockFeeds([flare, null, {}], [cme, {}]), NOW);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=900');
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.has('Set-Cookie')).toBe(false);
    const body: unknown = await response.json();
    expect(body).toEqual({
      live: true, fetchedAt: NOW.toISOString(), events: [mapCme(cme), mapFlare(flare)],
    });
    expect(LiveSpaceWeatherSchema.safeParse(body).success).toBe(true);
  });

  it('falls back on an upstream 500 and aborts the other request', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 500 }));
    await expectFallback(await buildLiveResponse(fetchImpl, NOW));
    expect(fetchImpl.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('falls back on a network error', async () => {
    await expectFallback(await buildLiveResponse(
      vi.fn<typeof fetch>().mockRejectedValue(new Error('private upstream detail')), NOW,
    ));
  });

  it('starts both requests together and enforces one 2.5 second budget', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
    const pending = buildLiveResponse(fetchImpl, NOW);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const signal = fetchImpl.mock.calls[0][1]?.signal;
    expect(signal).toBe(fetchImpl.mock.calls[1][1]?.signal);
    let settled = false;
    void pending.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(2_499);
    expect(settled).toBe(false);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expectFallback(await pending);
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('includes hanging JSON body reads in the total budget', async () => {
    vi.useFakeTimers();
    const response = new Response();
    vi.spyOn(response, 'json').mockImplementation(() => new Promise(() => {}));
    const pending = buildLiveResponse(vi.fn<typeof fetch>().mockResolvedValue(response), NOW);
    await vi.advanceTimersByTimeAsync(2_500);
    await expectFallback(await pending);
  });

  it('falls back on invalid JSON', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => new Response('{'));
    await expectFallback(await buildLiveResponse(fetchImpl, NOW));
  });

  it('falls back if the live response fails schema validation', async () => {
    vi.spyOn(LiveSpaceWeatherSchema, 'parse').mockImplementationOnce(() => {
      throw new Error('Schema validation failed');
    });
    await expectFallback(await buildLiveResponse(mockFeeds(), NOW));
  });

  it.each([null, {}, 'unavailable', 42])('falls back on a non-array body: %j', async (body) => {
    await expectFallback(await buildLiveResponse(mockFeeds([], body), NOW));
  });

  it('returns an empty live week without synthesizing events', async () => {
    const response = await buildLiveResponse(mockFeeds(), NOW);
    expect(await response.json()).toEqual({ live: true, fetchedAt: NOW.toISOString(), events: [] });
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=900');
  });

  it('uses exactly today minus seven days through today in UTC, without a key', async () => {
    const fetchImpl = mockFeeds();
    await buildLiveResponse(fetchImpl, NOW);
    expect(fetchImpl.mock.calls.map(([input]) => String(input))).toEqual([
      'https://ccmc.gsfc.nasa.gov/DONKI-API/get/FLR?startDate=2026-10-24&endDate=2026-10-31',
      'https://ccmc.gsfc.nasa.gov/DONKI-API/get/CME?startDate=2026-10-24&endDate=2026-10-31',
    ]);
  });

  it.each(['POST', 'PUT', 'OPTIONS']) /* HEAD is allowed since SEC-B F4 */('rejects %s without fetching', async (method) => {
    const fetchImpl = mockFeeds();
    vi.stubGlobal('fetch', fetchImpl);
    await expectFallback(await handler(new Request('https://example.test/', { method })), 405);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not forward or log client data on GET success or failure', async () => {
    const spies = ['log', 'warn', 'error', 'info', 'debug'].map((method) =>
      vi.spyOn(console, method as 'log').mockImplementation(() => {}));
    const fetchImpl = mockFeeds();
    vi.stubGlobal('fetch', fetchImpl);
    const request = new Request('https://example.test/?crew=private', {
      headers: { 'X-Forwarded-For': '192.0.2.1', Cookie: 'private', Authorization: 'private' },
    });
    expect((await handler(request)).headers.has('Set-Cookie')).toBe(false);
    fetchImpl.mockRejectedValue(new Error('private'));
    await expectFallback(await handler(request));
    for (const [input, init] of fetchImpl.mock.calls) {
      expect(String(input)).not.toContain('private');
      expect(Object.keys(init ?? {}).sort()).toEqual(['redirect', 'signal']);
      expect((init as RequestInit).redirect).toBe('error'); // SEC-B F2: no cross-host redirects
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
