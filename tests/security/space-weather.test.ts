import { afterEach, describe, expect, it, vi } from 'vitest';
import handler, {
  buildLiveResponse, LIVE_LIMIT_BYTES, UPSTREAM_LIMIT_BYTES, UPSTREAM_RECORD_LIMIT,
} from '../../netlify/functions/space-weather';
import * as donki from '../../scripts/lib/donki';
import { LiveSpaceWeatherSchema } from '../../src/shared/schemas';

const NOW = new Date('2026-11-15T00:00:00Z');
const encoder = new TextEncoder();
const flare = {
  flrID: 'flare-1', classType: 'M1.2', peakTime: '2026-11-14T12:00Z',
  link: 'https://ccmc.gsfc.nasa.gov/DONKI/view/FLR/1',
};

function feeds(first: () => Response = () => Response.json([])) {
  return vi.fn<typeof fetch>().mockImplementation(async (url) =>
    String(url).includes('/FLR?') ? first() : Response.json([]));
}

function stream(bytes: Uint8Array, chunkSize = bytes.length, headers?: HeadersInit) {
  let offset = 0;
  const cancel = vi.fn();
  return {
    cancel,
    response: new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.length) { controller.close(); return; }
        controller.enqueue(bytes.subarray(offset, offset + chunkSize));
        offset += chunkSize;
      }, cancel,
    }, { highWaterMark: 0 }), { headers }),
  };
}

async function fallback(response: Response) {
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('public, max-age=60');
  expect(await response.text()).toBe('{"live":false}');
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('bounded public function', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])('returns 405 and Allow for %s without fetching', async (method) => {
    const fetchImpl = feeds();
    vi.stubGlobal('fetch', fetchImpl);
    const response = await handler(new Request('https://example.test/', { method, headers: { Origin: 'https://attacker.invalid' } }));
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET, HEAD');
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
    expect(await response.json()).toEqual({ live: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([true, false])('HEAD matches GET status and headers with no body (live=%s)', async (live) => {
    const fetchImpl = live ? feeds() : vi.fn<typeof fetch>().mockRejectedValue(new Error('upstream failed'));
    vi.stubGlobal('fetch', fetchImpl);
    const get = await handler(new Request('https://example.test/', { headers: { Origin: 'https://attacker.invalid' } }));
    const head = await handler(new Request('https://example.test/', { method: 'HEAD', headers: { Origin: 'https://attacker.invalid' } }));
    expect(head.status).toBe(get.status);
    expect([...head.headers]).toEqual([...get.headers]);
    expect(head.body).toBeNull();
    expect(await head.text()).toBe('');
    expect(get.headers.has('Access-Control-Allow-Origin')).toBe(false);
    expect(head.headers.has('Access-Control-Allow-Origin')).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('keeps finite named limits and maps normal feeds through the shared schema', async () => {
    expect([UPSTREAM_LIMIT_BYTES, LIVE_LIMIT_BYTES, UPSTREAM_RECORD_LIMIT]).toEqual([1_048_576, 1_048_576, 1_000]);
    const response = await buildLiveResponse(feeds(() => Response.json([flare])), NOW);
    expect(LiveSpaceWeatherSchema.parse(await response.json())).toEqual({
      live: true, fetchedAt: NOW.toISOString(), events: [donki.mapFlare(flare)],
    });
  });

  it.each([undefined, '2', 'invalid', '-1'])('counts actual bytes with Content-Length %s', async (length) => {
    const headers = length === undefined ? undefined : { 'Content-Length': length };
    const exact = stream(encoder.encode('[]' + ' '.repeat(UPSTREAM_LIMIT_BYTES - 2)), 4093, headers);
    expect((await (await buildLiveResponse(feeds(() => exact.response), NOW)).json()).live).toBe(true);
    const over = stream(encoder.encode('[]' + ' '.repeat(UPSTREAM_LIMIT_BYTES - 1)), 4093, headers);
    await fallback(await buildLiveResponse(feeds(() => over.response), NOW));
    expect(over.cancel).toHaveBeenCalledOnce();
  });

  it('rejects an oversized Content-Length without reading the body', async () => {
    const fixture = stream(encoder.encode('[]'), 1, { 'Content-Length': String(UPSTREAM_LIMIT_BYTES + 1) });
    await fallback(await buildLiveResponse(feeds(() => fixture.response), NOW));
    expect(fixture.cancel).toHaveBeenCalledOnce();
  });

  it('rejects one oversized chunk and cancels the stream', async () => {
    const fixture = stream(new Uint8Array(UPSTREAM_LIMIT_BYTES + 1));
    await fallback(await buildLiveResponse(feeds(() => fixture.response), NOW));
    expect(fixture.cancel).toHaveBeenCalledOnce();
  });

  it('handles many small chunks and a split multibyte character', async () => {
    const fixture = stream(encoder.encode(JSON.stringify([{ ...flare, flrID: 'é🚀' }])), 1);
    const result = LiveSpaceWeatherSchema.parse(await (await buildLiveResponse(feeds(() => fixture.response), NOW)).json());
    expect(result.live && result.events[0].id).toBe('é🚀');
  });

  it('measures multibyte strings in bytes, including the exact boundary', async () => {
    const prefix = '["' + 'é'.repeat((UPSTREAM_LIMIT_BYTES - 4) / 2) + '"]';
    expect(encoder.encode(prefix).length).toBe(UPSTREAM_LIMIT_BYTES);
    expect((await (await buildLiveResponse(feeds(() => new Response(prefix)), NOW)).json()).live).toBe(true);
    await fallback(await buildLiveResponse(feeds(() => new Response(prefix + ' ')), NOW));
  });

  it('rejects excessive record counts before any mapping', async () => {
    const mapper = vi.spyOn(donki, 'mapFlare');
    await fallback(await buildLiveResponse(feeds(() => Response.json(Array(UPSTREAM_RECORD_LIMIT + 1).fill(flare))), NOW));
    expect(mapper).not.toHaveBeenCalled();
  });

  it('permits the exact record boundary', async () => {
    const response = await buildLiveResponse(feeds(() => Response.json(Array(UPSTREAM_RECORD_LIMIT).fill(flare))), NOW);
    expect((await response.json()).events).toHaveLength(UPSTREAM_RECORD_LIMIT);
  });

  it('bounds huge fields before parsing and mapping', async () => {
    const mapper = vi.spyOn(donki, 'mapFlare');
    await fallback(await buildLiveResponse(feeds(() => Response.json([{ ...flare, flrID: 'x'.repeat(UPSTREAM_LIMIT_BYTES) }])), NOW));
    expect(mapper).not.toHaveBeenCalled();
  });

  it.each(['{', 'null', '{}'])('returns a generic fallback for malformed/non-array JSON %s', async (body) => {
    await fallback(await buildLiveResponse(feeds(() => new Response(body)), NOW));
  });

  it('refuses invalid UTF-8', async () => {
    await fallback(await buildLiveResponse(feeds(() => new Response(new Uint8Array([91, 34, 255, 34, 93]))), NOW));
  });

  it('cancels stalled bodies and both signals at the deadline', async () => {
    vi.useFakeTimers();
    const cancels = [vi.fn(), vi.fn()];
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () =>
      new Response(new ReadableStream({ cancel: cancels[fetchImpl.mock.calls.length - 1] })));
    const pending = buildLiveResponse(fetchImpl, NOW);
    await vi.advanceTimersByTimeAsync(2_499);
    expect(fetchImpl.mock.calls[0][1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await fallback(await pending);
    expect(cancels.every((cancel) => cancel.mock.calls.length === 1)).toBe(true);
    expect(fetchImpl.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts and cancels the other feed after a size failure', async () => {
    const cancel = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (url) =>
      String(url).includes('/FLR?') ? new Response(new Uint8Array(UPSTREAM_LIMIT_BYTES + 1))
        : new Response(new ReadableStream({ cancel })));
    await fallback(await buildLiveResponse(fetchImpl, NOW));
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true);
  });

  it('rejects serialized output over the limit even when both feeds fit', async () => {
    const records = Array.from({ length: 900 }, (_, i) => ({ ...flare, flrID: String(i).padEnd(1000, 'x') }));
    expect(encoder.encode(JSON.stringify(records)).length).toBeLessThan(UPSTREAM_LIMIT_BYTES);
    await fallback(await buildLiveResponse(feeds(() => Response.json(records)), NOW));
  });

  it('accepts the exact serialized output boundary and rejects one byte over', async () => {
    const base = encoder.encode(JSON.stringify({ live: true, fetchedAt: NOW.toISOString(), events: [donki.mapFlare(flare)] })).length;
    const exact = { ...flare, flrID: 'x'.repeat(LIVE_LIMIT_BYTES - base + flare.flrID.length) };
    expect(encoder.encode(JSON.stringify([exact])).length).toBeLessThan(UPSTREAM_LIMIT_BYTES);
    const response = await buildLiveResponse(feeds(() => Response.json([exact])), NOW);
    expect(encoder.encode(await response.text()).length).toBe(LIVE_LIMIT_BYTES);
    await fallback(await buildLiveResponse(feeds(() => Response.json([{ ...exact, flrID: exact.flrID + 'x' }])), NOW));
  });

  it('rejects the original P2 probe with 10,000 upstream events', async () => {
    await fallback(await buildLiveResponse(feeds(() => Response.json(Array(10_000).fill(flare))), NOW));
  });

  it('does not reflect CORS or expose error messages, stack traces, keys or client data', async () => {
    const logs = ['log', 'warn', 'error', 'info', 'debug'].map((method) => vi.spyOn(console, method as 'log'));
    // Synthetic credential marker only; never use an environment value in a test.
    const marker = 'synthetic-private-key';
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error(`https://ccmc.gsfc.nasa.gov/?api_key=${marker}\nstack trace`));
    vi.stubGlobal('fetch', fetchImpl);
    const response = await handler(new Request('https://example.test/private?url=https://attacker.invalid', {
      headers: { Origin: 'https://attacker.invalid', Authorization: marker },
    }));
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
    expect(response.headers.has('Access-Control-Allow-Credentials')).toBe(false);
    await fallback(response);
    for (const [url, init] of fetchImpl.mock.calls) {
      expect(new URL(String(url)).hostname).toBe('ccmc.gsfc.nasa.gov');
      expect(String(url)).not.toMatch(/attacker|private|api_key/);
      expect(init?.headers).toBeUndefined();
    }
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
});
