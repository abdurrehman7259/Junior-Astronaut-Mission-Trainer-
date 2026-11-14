import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLiveSpaceWeather } from '../../src/app/live';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const jsonRes = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('fetchLiveSpaceWeather', () => {
  it('returns live data when the function answers', async () => {
    const body = {
      live: true,
      fetchedAt: '2026-11-14T10:30:00Z',
      events: [
        {
          id: 'QUIET-2026-11-13',
          source: 'DONKI',
          kind: 'QUIET',
          realDate: '2026-11-13',
          severity: 0,
          kidText: 'Calm.',
          sourceUrl: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/',
        },
      ],
    };
    const fetchMock = vi.fn(() => jsonRes(body));
    vi.stubGlobal('fetch', fetchMock);
    const r = await fetchLiveSpaceWeather();
    expect(r.live).toBe(true);
    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe('/.netlify/functions/space-weather');
  });

  it('resolves live:false on 404', async () => {
    vi.stubGlobal('fetch', () => jsonRes({}, 404));
    expect(await fetchLiveSpaceWeather()).toEqual({ live: false });
  });

  it('resolves live:false on invalid JSON', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('<html>', { status: 200 })));
    expect(await fetchLiveSpaceWeather()).toEqual({ live: false });
  });

  it('resolves live:false on schema failure', async () => {
    vi.stubGlobal('fetch', () => jsonRes({ live: true, events: 5 }));
    expect(await fetchLiveSpaceWeather()).toEqual({ live: false });
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
