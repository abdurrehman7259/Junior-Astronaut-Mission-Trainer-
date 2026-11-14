/** Replace query credentials before displaying a URL or an upstream error. */
export function redactApiKey(message: string): string {
  return message.replace(/(api_key=)[^\s&#"'<>)]*/gi, '$1***');
}

export interface HttpOptions {
  headers?: NonNullable<Parameters<typeof fetch>[1]>['headers'];
  timeoutMs?: number;
  /** Retries after the initial request; defaults to four. */
  retries?: number;
  /** Called once per HTTP attempt, including retries and failures; never includes a URL. */
  onRequestComplete?: (result: { elapsedMs: number; recordCount: number | null; status: string }) => void;
}

/** Safe status metadata lets callers handle a retired endpoint without parsing prose. */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(redactApiKey(message));
    this.name = 'HttpError';
    this.status = status;
  }
}

export class HttpTimeoutError extends Error {}

/** A transient connection failure that exhausted the configured retries. */
export class HttpNetworkError extends Error {}

const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
]);

function isTransientNetworkError(error: unknown): boolean {
  const seen = new Set<object>();
  let current = error;
  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    seen.add(current);
    if ('message' in current && (current.message === 'fetch failed' || current.message === 'terminated')) return true;
    if ('code' in current && typeof current.code === 'string' && TRANSIENT_NETWORK_CODES.has(current.code)) return true;
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}

function retryDelay(retryAfter: string | null, attempt: number): number {
  const backoff = 1_000 * 2 ** attempt;
  if (!retryAfter) return backoff;
  const seconds = Number(retryAfter);
  const requested = Number.isFinite(seconds)
    ? seconds * 1_000
    : Date.parse(retryAfter) - Date.now();
  return Number.isFinite(requested) ? Math.max(backoff, requested) : backoff;
}

/** Sequential GET attempts; the timeout covers both headers and the JSON body. */
export async function fetchJson(url: string | URL, options: HttpOptions = {}): Promise<unknown> {
  const { timeoutMs = 20_000, retries = 4, headers, onRequestComplete } = options;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isInteger(retries) || retries < 0) {
    throw new RangeError('HTTP timeout must be positive and retries a non-negative integer');
  }
  const safeUrl = redactApiKey(String(url));
  for (let attempt = 0; ; attempt++) {
    const startedAt = Date.now();
    let recordCount: number | null = null;
    let status = 'failed';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let delay: number;
    try {
      const response = await fetch(url, { headers, signal: controller.signal });
      if (response.ok) {
        const data: unknown = await response.json();
        recordCount = Array.isArray(data) ? data.length : null;
        status = 'ok';
        return data;
      }
      status = `HTTP ${response.status}`;
      const retryable = response.status === 429 || (response.status >= 500 && response.status <= 599);
      // Discard error bodies: they can echo credentials and need not be buffered.
      await response.body?.cancel();
      if (!retryable || attempt >= retries) {
        throw new HttpError(response.status, `HTTP ${response.status} from ${safeUrl} after ${attempt + 1} attempt(s)`);
      }
      delay = retryDelay(response.headers.get('Retry-After'), attempt);
    } catch (error) {
      if (controller.signal.aborted) status = 'timeout';
      if (error instanceof HttpError) throw error;
      const transient = isTransientNetworkError(error);
      if (!controller.signal.aborted && transient && attempt < retries) {
        // Transient socket/connect failures use the same bounded backoff.
        delay = retryDelay(null, attempt);
      } else {
        // Do not retain the original error as a cause: it may contain a secret URL.
        const detail = controller.signal.aborted
          ? `request timed out after ${timeoutMs} ms`
          : error instanceof Error ? error.message : String(error);
        const message = redactApiKey(`GET ${safeUrl}: ${detail}`);
        if (controller.signal.aborted) throw new HttpTimeoutError(message);
        throw transient ? new HttpNetworkError(message) : new Error(message);
      }
    } finally {
      clearTimeout(timeout);
      onRequestComplete?.({ elapsedMs: Date.now() - startedAt, recordCount, status });
    }
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
  }
}
