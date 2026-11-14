import { DonkiSnapshotSchema } from '../shared/schemas';
import type { SolarEvent } from '../shared/types';
import { STUB_EVENTS } from './stub-events';

export interface LoadedEvents {
  events: SolarEvent[];
  retrievedAt: string | null;
  isPlaceholder: boolean;
}

const canUsePlaceholder = () => import.meta.env.DEV || import.meta.env.MODE === 'test';

/**
 * Load the archived DONKI snapshot. Placeholder (stub) events are returned only in dev and test,
 * flagged isPlaceholder. In a production build a failure throws: stub data is never shown as real.
 */
export async function loadEvents(): Promise<LoadedEvents> {
  try {
    const res = await fetch('/data/donki-events.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const snapshot = DonkiSnapshotSchema.parse(await res.json());
    return { events: snapshot.items, retrievedAt: snapshot.retrievedAt, isPlaceholder: false };
  } catch (err) {
    if (canUsePlaceholder()) {
      return { events: STUB_EVENTS, retrievedAt: null, isPlaceholder: true };
    }
    throw err;
  }
}
