import { describe, expect, it, vi } from 'vitest';
import { DONKI_UPSTREAM, LIMIT_BYTES, RECORD_LIMIT, handleDonki } from '../../api/donki';

// D-041: the same-origin proxy. Tests never touch the network: fetch is always a mock.
const NOW = new Date('2026-11-14T10:30:00Z');
const OK_QUERY = 'type=FLR&startDate=2026-11-07&endDate=2026-11-14';

const visitorRequest = (query: string) =>
  new Request(`https://moonbase.example/api/donki?${query}`, {
    headers: {
      'User-Agent': 'KidsTablet/1.0',
      'X-Forwarded-For': '203.0.113.7',
      Cookie: 'session=abc',
      Referer: 'https://moonbase.example/',
    },
  });

const upstream = (body: string, status = 200, headers: Record<string, string> = {}) =>
  vi.fn<typeof fetch>(() => Promise.resolve(new Response(body, { status, headers })));

describe('api/donki proxy: what it sends to NASA', () => {
  it('calls exactly the fixed DONKI URL and forwards none of the visitor headers', async () => {
    const fetchMock = upstream('[{"flrID":"x"}]');
    const res = await handleDonki(visitorRequest(OK_QUERY), fetchMock, NOW);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ flrID: 'x' }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DONKI_UPSTREAM}FLR?startDate=2026-11-07&endDate=2026-11-14`);
    expect(init.headers).toEqual({ Accept: 'application/json' });
    expect(init.redirect).toBe('error');
    const sent = JSON.stringify(init);
    for (const leaked of ['203.0.113.7', 'KidsTablet', 'session=abc', 'moonbase.example']) expect(sent).not.toContain(leaked);
  });

  it('lets the CDN cache good answers and never caches errors', async () => {
    const ok = await handleDonki(visitorRequest(OK_QUERY), upstream('[]'), NOW);
    expect(ok.headers.get('Cache-Control')).toContain('s-maxage=900');
    expect(ok.headers.get('Content-Type')).toContain('application/json');
    const bad = await handleDonki(visitorRequest(OK_QUERY), upstream('', 500), NOW);
    expect(bad.status).toBe(502);
    expect(bad.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('api/donki proxy: input rules', () => {
  const rejected = [
    ['unknown feed', 'type=GST&startDate=2026-11-07&endDate=2026-11-14'],
    ['path tricks in type', 'type=FLR%2F..%2Fother&startDate=2026-11-07&endDate=2026-11-14'],
    ['missing type', 'startDate=2026-11-07&endDate=2026-11-14'],
    ['extra parameter', `${OK_QUERY}&api_key=x`],
    ['bad date format', 'type=FLR&startDate=7-11-2026&endDate=2026-11-14'],
    ['impossible date', 'type=CME&startDate=2026-02-31&endDate=2026-03-01'],
    ['end before start', 'type=FLR&startDate=2026-11-14&endDate=2026-11-07'],
    ['window over 8 days', 'type=FLR&startDate=2026-11-01&endDate=2026-11-14'],
    ['window far from today', 'type=FLR&startDate=2020-01-01&endDate=2020-01-07'],
  ] as const;

  for (const [name, query] of rejected) {
    it(`rejects ${name} with 400 and never calls NASA`, async () => {
      const fetchMock = upstream('[]');
      const res = await handleDonki(visitorRequest(query), fetchMock, NOW);
      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it('accepts CME and a window ending tomorrow (time-zone slack)', async () => {
    const res = await handleDonki(visitorRequest('type=CME&startDate=2026-11-08&endDate=2026-11-15'), upstream('[]'), NOW);
    expect(res.status).toBe(200);
  });
});

describe('api/donki proxy: upstream failures (security F1, F2)', () => {
  it('returns 502 for invalid JSON, a non-array body or too many records', async () => {
    for (const body of ['<html>', '{"events":1}', JSON.stringify(Array.from({ length: RECORD_LIMIT + 1 }, () => ({})))]) {
      expect((await handleDonki(visitorRequest(OK_QUERY), upstream(body), NOW)).status).toBe(502);
    }
  });

  it('returns 502 for an oversized body, by header or by streamed size', async () => {
    const big = upstream('[]', 200, { 'Content-Length': String(LIMIT_BYTES + 1) });
    expect((await handleDonki(visitorRequest(OK_QUERY), big, NOW)).status).toBe(502);
    const streamed = upstream('[' + ' '.repeat(LIMIT_BYTES) + ']');
    expect((await handleDonki(visitorRequest(OK_QUERY), streamed, NOW)).status).toBe(502);
  });

  it('returns 502 when NASA is unreachable or redirects', async () => {
    const down = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('fetch failed')));
    expect((await handleDonki(visitorRequest(OK_QUERY), down, NOW)).status).toBe(502);
  });
});
