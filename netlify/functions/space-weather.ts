import { mapCme, mapFlare } from '../../scripts/lib/donki';
import { LiveSpaceWeatherSchema } from '../../src/shared/schemas';
import type { LiveSpaceWeather, SolarEvent } from '../../src/shared/types';

const DONKI_BASE = 'https://ccmc.gsfc.nasa.gov/DONKI-API/get/';
const UPSTREAM_BUDGET_MS = 2_500;
// Operational resource limits, not scientific measurements or game rules.
export const UPSTREAM_LIMIT_BYTES = 1_048_576;
export const UPSTREAM_RECORD_LIMIT = 1_000;
export const LIVE_LIMIT_BYTES = 1_048_576;

// Netlify enforces this at the edge on all plans; no IP data is read or stored here.
// Official documentation and deployment-verification limits are recorded in the audit.
export const config = {
  path: '/.netlify/functions/space-weather',
  rateLimit: {
    action: 'rate_limit',
    windowLimit: 30,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};

/** Count actual UTF-8 bytes; Content-Length is only an early rejection hint. */
async function readBoundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing upstream body');
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  let complete = false;
  try {
    const length = response.headers.get('Content-Length');
    if (length !== null && /^\d+$/.test(length) && Number(length) > UPSTREAM_LIMIT_BYTES) {
      throw new Error('Upstream body exceeds limit');
    }
    const bytes = new Uint8Array(UPSTREAM_LIMIT_BYTES);
    let received = 0;
    for (;;) {
      if (signal.aborted) throw new Error('Upstream aborted');
      const { done, value } = await reader.read();
      if (signal.aborted) throw new Error('Upstream aborted');
      if (done) { complete = true; break; }
      if (value.byteLength > UPSTREAM_LIMIT_BYTES - received) throw new Error('Upstream body exceeds limit');
      bytes.set(value, received);
      received += value.byteLength;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, received))) as unknown;
  } finally {
    signal.removeEventListener('abort', cancel);
    if (!complete) cancel();
    reader.releaseLock();
  }
}

function jsonResponse(body: LiveSpaceWeather, status = 200): Response {
  const validated = LiveSpaceWeatherSchema.parse(body);
  const serialized = JSON.stringify(validated);
  if (new TextEncoder().encode(serialized).byteLength > LIVE_LIMIT_BYTES) throw new Error('Live body exceeds limit');
  return new Response(serialized, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${validated.live ? 900 : 60}`,
    },
  });
}

/** Fetch and parse both feeds within one deadline, including response body reads. */
export async function buildLiveResponse(fetchImpl: typeof fetch, now: Date): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const fetchedAt = now.toISOString();
    const start = new Date(now.getTime());
    start.setUTCDate(start.getUTCDate() - 7);
    const params = new URLSearchParams({
      startDate: start.toISOString().slice(0, 10),
      endDate: fetchedAt.slice(0, 10),
    });
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error('Upstream deadline exceeded'));
        controller.abort();
      }, UPSTREAM_BUDGET_MS);
    });
    const load = async (kind: 'FLR' | 'CME'): Promise<unknown[]> => {
      const response = await fetchImpl(`${DONKI_BASE}${kind}?${params}`, {
        signal: controller.signal,
        redirect: 'error',
      });
      if (!response.ok) throw new Error('Upstream response failed');
      const body = await readBoundedJson(response, controller.signal);
      if (!Array.isArray(body)) throw new Error('Expected upstream array');
      if (body.length > UPSTREAM_RECORD_LIMIT) throw new Error('Upstream record limit exceeded');
      return body;
    };
    // The explicit race also bounds mocks or body readers that ignore abort signals.
    const [flares, cmes] = await Promise.race([
      Promise.all([load('FLR'), load('CME')]),
      deadline,
    ]);
    const events = [...flares.map(mapFlare), ...cmes.map(mapCme)]
      .filter((event): event is SolarEvent => event !== null)
      .sort((a, b) => a.realDate.localeCompare(b.realDate) || a.id.localeCompare(b.id));
    return jsonResponse({ live: true, fetchedAt, events });
  } catch {
    // No request data, upstream URLs, errors, or credentials are logged.
    return jsonResponse({ live: false });
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const response = jsonResponse({ live: false }, 405);
    response.headers.set('Allow', 'GET, HEAD');
    return response;
  }
  const response = await buildLiveResponse(fetch, new Date());
  return req.method === 'HEAD' ? new Response(null, { status: response.status, headers: response.headers }) : response;
};
