import { mapCme, mapFlare } from '../../scripts/lib/donki';
import { LiveSpaceWeatherSchema } from '../../src/shared/schemas';
import type { LiveSpaceWeather, SolarEvent } from '../../src/shared/types';

const DONKI_BASE = 'https://ccmc.gsfc.nasa.gov/DONKI-API/get/';
const UPSTREAM_BUDGET_MS = 2_500;

function jsonResponse(body: LiveSpaceWeather, status = 200): Response {
  const validated = LiveSpaceWeatherSchema.parse(body);
  return new Response(JSON.stringify(validated), {
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
      });
      if (!response.ok) throw new Error('Upstream response failed');
      const body: unknown = await response.json();
      if (!Array.isArray(body)) throw new Error('Expected upstream array');
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
  if (req.method !== 'GET') return jsonResponse({ live: false }, 405);
  return buildLiveResponse(fetch, new Date());
};
