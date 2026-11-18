import { useEffect, useState } from 'react';
import { mapCme, mapFlare } from '../shared/donki-map';
import { LiveSpaceWeatherSchema } from '../shared/schemas';
import type { LiveSpaceWeather, SolarEvent } from '../shared/types';
import { isStubEvent } from './stub-events';

/**
 * Live space weather from NASA's keyless CCMC DONKI API, through our own same-origin proxy (`api/donki.ts`,
 * D-041). The browser never contacts NASA, so a player's IP address is not sent to a third party. Only these
 * two fixed URLs are ever requested; nothing from the player goes into them. The CSP is connect-src 'self'.
 */
export const DONKI_LIVE_BASE = '/api/donki';
export const LIVE_TIMEOUT_MS = 3000;
/** Operational limits (security audit F1), not game rules. */
export const LIVE_LIMIT_BYTES = 1_048_576;
export const LIVE_RECORD_LIMIT = 1_000;

/** The two fixed request URLs for the 7 days up to `now` (UTC dates). */
export function liveUrls(now: Date): { FLR: string; CME: string } {
  const end = now.toISOString().slice(0, 10);
  const startDay = new Date(now.getTime());
  startDay.setUTCDate(startDay.getUTCDate() - 7);
  const url = (type: 'FLR' | 'CME') =>
    `${DONKI_LIVE_BASE}?${new URLSearchParams({ type, startDate: startDay.toISOString().slice(0, 10), endDate: end })}`;
  return { FLR: url('FLR'), CME: url('CME') };
}

/** Reads at most LIVE_LIMIT_BYTES of JSON; larger bodies are rejected. */
async function readBoundedJson(res: Response): Promise<unknown> {
  const length = res.headers.get('Content-Length');
  if (length !== null && /^\d+$/.test(length) && Number(length) > LIVE_LIMIT_BYTES) throw new Error('too large');
  const reader = res.body?.getReader();
  if (!reader) return JSON.parse(await res.text()) as unknown;
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > LIVE_LIMIT_BYTES) {
      void reader.cancel().catch(() => {});
      throw new Error('too large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
}

/** Both feeds within one 3 s deadline. Never throws: any failure resolves { live: false }. */
export async function fetchLiveSpaceWeather(signal?: AbortSignal, now: Date = new Date()): Promise<LiveSpaceWeather> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS);
  const onOuterAbort = () => controller.abort();
  signal?.addEventListener('abort', onOuterAbort);
  const load = async (url: string): Promise<unknown[]> => {
    const res = await fetch(url, {
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error('upstream');
    const body = await readBoundedJson(res);
    if (!Array.isArray(body) || body.length > LIVE_RECORD_LIMIT) throw new Error('shape');
    return body;
  };
  try {
    // Inside the try: an invalid clock can never escape as a rejection (SEC-D-02).
    const urls = liveUrls(now);
    const [flares, cmes] = await Promise.all([load(urls.FLR), load(urls.CME)]);
    const events = [...flares.map(mapFlare), ...cmes.map(mapCme)]
      .filter((e): e is SolarEvent => e !== null)
      .sort((a, b) => a.realDate.localeCompare(b.realDate) || a.id.localeCompare(b.id));
    const parsed = LiveSpaceWeatherSchema.parse({ live: true, fetchedAt: now.toISOString(), events });
    if (parsed.live && parsed.events.some(isStubEvent)) return { live: false };
    return parsed;
  } catch {
    return { live: false };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
    // If one feed failed early, cancel the other so nothing outlives the 3 s budget (SEC-D-01).
    controller.abort();
  }
}

export interface LiveState {
  status: 'loading' | 'live' | 'archived';
  data?: Extract<LiveSpaceWeather, { live: true }>;
}

export function useLiveSpaceWeather(): LiveState {
  const [state, setState] = useState<LiveState>({ status: 'loading' });
  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;
    fetchLiveSpaceWeather(ctrl.signal).then((r) => {
      if (cancelled) return;
      setState(r.live ? { status: 'live', data: r } : { status: 'archived' });
    });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, []);
  return state;
}
