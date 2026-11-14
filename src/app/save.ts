import { z } from 'zod';
import { AllocationSchema, GameStateSchema, TurnResultSchema } from '../shared/schemas';
import type { Allocation, GameState, SiteId, TurnResult } from '../shared/types';

/** Save slot for resuming a mission (FR-14). Game progress only; the crew name is local-only. */
export const SAVE_KEY = 'mbc.save.v1';

export interface SavedGame {
  version: 1;
  savedAt: string;
  crewName: string;
  screen: 'mission' | 'report';
  game: GameState;
  lastResult: TurnResult | null;
  allocation: Allocation;
  recentSetIds: string[];
  placeholder: boolean;
  /** Which base this mission is on. Old saves have none: that means the Moon. */
  site?: SiteId;
}

const SavedGameSchema = z
  .object({
    version: z.literal(1),
    savedAt: z.iso.datetime(),
    crewName: z.string().max(40),
    screen: z.enum(['mission', 'report']),
    game: GameStateSchema,
    lastResult: TurnResultSchema.nullable(),
    allocation: AllocationSchema,
    recentSetIds: z.array(z.string()).max(3),
    placeholder: z.boolean(),
    site: z.enum(['moon', 'mars']).optional(),
  })
  .refine((s) => (s.screen === 'mission' ? s.game.status === 'playing' : s.lastResult !== null), {
    message: 'screen does not match game state',
  });

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage blocked: the game keeps working without saving.
  }
}

export function saveGame(snapshot: Omit<SavedGame, 'version' | 'savedAt'>): void {
  try {
    const saved: SavedGame = { version: 1, savedAt: new Date().toISOString(), ...snapshot };
    localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
  } catch {
    // Private mode or quota: ignore.
  }
}

/** Returns a valid save, or null. Anything invalid or of another version is cleared. */
export function loadGame(): SavedGame | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed = SavedGameSchema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      const data = parsed.data;
      return { ...data, site: data.site ?? data.game.site ?? 'moon' } as SavedGame;
    }
  } catch {
    // Invalid JSON: fall through.
  }
  clearSave();
  return null;
}
