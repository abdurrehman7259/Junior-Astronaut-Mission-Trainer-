/**
 * Same-origin proxy for NASA's keyless CCMC DONKI API (D-041), deployed as a Vercel Function at /api/donki.
 *
 * The player's browser only ever talks to our own host. This function calls NASA from Vercel's servers and
 * forwards none of the visitor's headers, so NASA never receives a player's IP address or user agent.
 *
 * Accepted request: GET /api/donki?type=FLR|CME&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD, nothing else.
 * The date window must end within 2 days of today (UTC) and span at most 8 days, so only a handful of
 * distinct URLs exist; the CDN caches each for 15 minutes, which keeps NASA calls and function runs low.
 */
export const DONKI_UPSTREAM = 'https://ccmc.gsfc.nasa.gov/DONKI-API/get/';
export const UPSTREAM_TIMEOUT_MS = 2500;
/** Operational limits (security audit F1), the same as the browser side. */
export const LIMIT_BYTES = 1_048_576;
export const RECORD_LIMIT = 1_000;

const DAY_MS = 86_400_000;
const TYPES = new Set(['FLR', 'CME']);
const PARAMS = new Set(['type', 'startDate', 'endDate']);
const CACHE_OK = 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600';

function parseDay(value: string | null): number | null {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  // Rejects impossible dates such as 2026-02-31, which Date.parse would roll over.
  return Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value ? null : time;
}

function respond(body: string, status: number, cacheControl: string): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** Reads at most LIMIT_BYTES; larger bodies are rejected. */
async function readBoundedText(res: Response): Promise<string> {
  const length = res.headers.get('Content-Length');
  if (length !== null && /^\d+$/.test(length) && Number(length) > LIMIT_BYTES) throw new Error('too large');
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > LIMIT_BYTES) {
      void reader.cancel().catch(() => {});
      throw new Error('too large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export async function handleDonki(
  request: Request,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<Response> {
  const url = new URL(request.url);
  const keys = [...url.searchParams.keys()];
  const type = url.searchParams.get('type') ?? '';
  const start = parseDay(url.searchParams.get('startDate'));
  const end = parseDay(url.searchParams.get('endDate'));
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  const valid =
    keys.length === PARAMS.size &&
    keys.every((k) => PARAMS.has(k)) &&
    TYPES.has(type) &&
    start !== null &&
    end !== null &&
    end >= start &&
    end - start <= 8 * DAY_MS &&
    Math.abs(end - today) <= 2 * DAY_MS;
  if (!valid) return respond('{"error":"bad request"}', 400, 'no-store');

  const query = new URLSearchParams({
    startDate: new Date(start).toISOString().slice(0, 10),
    endDate: new Date(end).toISOString().slice(0, 10),
  });
  try {
    // Only Accept is sent: no cookies, IP headers, user agent or referrer from the visitor.
    const res = await fetchImpl(`${DONKI_UPSTREAM}${type}?${query}`, {
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error('upstream');
    const body = JSON.parse(await readBoundedText(res)) as unknown;
    if (!Array.isArray(body) || body.length > RECORD_LIMIT) throw new Error('shape');
    return respond(JSON.stringify(body), 200, CACHE_OK);
  } catch {
    return respond('{"error":"upstream"}', 502, 'no-store');
  }
}

/** Vercel Function entry point (Web handler signature). Other methods get 405 from Vercel. */
export function GET(request: Request): Promise<Response> {
  return handleDonki(request);
}
