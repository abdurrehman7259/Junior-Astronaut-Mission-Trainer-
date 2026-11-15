import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLiveSpaceWeather } from '../../src/app/live';
import { fetchJson } from '../../scripts/lib/http';
import { checkStudyPage } from '../../scripts/fetch-osdr';
import { fetchMarsSite } from '../../scripts/fetch-mars-site';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('closed redirect policy', () => {
  it('pins every production fetch site to redirect:error', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => Response.json([]));
    vi.stubGlobal('fetch', fetchImpl);
    await fetchLiveSpaceWeather(undefined, new Date('2026-11-15T00:00:00Z'));
    await fetchJson('https://ccmc.gsfc.nasa.gov/DONKI-API/get/FLR', { retries: 0 });
    await checkStudyPage('https://osdr.nasa.gov/bio/repo/data/studies/OSD-1');
    const responses = [
      'landed in Jezero Crater on Feb. 18, 2021',
      'river channels spilled over the crater wall and created a lake',
      '%PDF-test', '24 hours, 39 minutes, 35 seconds', '%PDF-test', 'Mars Trek',
    ];
    fetchImpl.mockImplementation(async () => new Response(responses.shift()));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await fetchMarsSite();
    expect(fetchImpl).toHaveBeenCalledTimes(10);
    for (const [, init] of fetchImpl.mock.calls) expect(init?.redirect).toBe('error');
  });

  it('fails closed without a follow-up request or leaking a synthetic key', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('redirect rejected: api_key=synthetic-private-key'));
    vi.stubGlobal('fetch', fetchImpl);
    const logs = ['log', 'warn', 'error'].map((method) => vi.spyOn(console, method as 'log'));
    expect(await fetchLiveSpaceWeather()).toEqual({ live: false });
    await expect(fetchJson('https://api.nasa.gov/DONKI/FLR?api_key=synthetic-private-key', { retries: 0 }))
      .rejects.toThrow(/api_key=\*\*\*/);
    await expect(checkStudyPage('https://osdr.nasa.gov/bio/')).rejects.toThrow('redirect rejected');
    await expect(fetchMarsSite()).rejects.toThrow('redirect rejected');
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    for (const [url, init] of fetchImpl.mock.calls) {
      expect(new URL(String(url)).hostname.endsWith('.nasa.gov')).toBe(true);
      expect(init?.redirect).toBe('error');
    }
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });

  it('native fetch refuses a cross-host redirect without contacting its target', async () => {
    // Loopback only, ephemeral port; no external requests or application servers.
    let targetRequests = 0;
    const server = createServer((req, res) => {
      if (req.url === '/target') { targetRequests++; res.end('[]'); return; }
      const port = (server.address() as AddressInfo).port;
      res.writeHead(302, { Location: `http://localhost:${port}/target` });
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const port = (server.address() as AddressInfo).port;
      await expect(fetchJson(`http://127.0.0.1:${port}/redirect`, { retries: 0, timeoutMs: 1_000 }))
        .rejects.toThrow();
      expect(targetRequests).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
