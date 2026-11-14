import { useEffect, useState } from 'react';
import { LiveSpaceWeatherSchema } from '../shared/schemas';
import type { LiveSpaceWeather } from '../shared/types';
import { isStubEvent } from './stub-events';

export const LIVE_ENDPOINT = '/.netlify/functions/space-weather';
export const LIVE_TIMEOUT_MS = 3000;

/** Same-origin GET with a 3 s timeout. Never throws: any failure resolves { live: false }. */
export async function fetchLiveSpaceWeather(signal?: AbortSignal): Promise<LiveSpaceWeather> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS);
  const onOuterAbort = () => controller.abort();
  signal?.addEventListener('abort', onOuterAbort);
  try {
    const res = await fetch(LIVE_ENDPOINT, {
      signal: controller.signal,
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return { live: false };
    const parsed = LiveSpaceWeatherSchema.parse(await res.json());
    if (parsed.live && parsed.events.some(isStubEvent)) return { live: false };
    return parsed;
  } catch {
    return { live: false };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
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
