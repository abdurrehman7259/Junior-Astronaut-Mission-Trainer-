import { z } from 'zod';
import { DraftAllocationSchema, GameStateSchema, TurnResultSchema } from '../shared/schemas.js';

import { DEFAULT_CREW } from './state.js';

/** Save slot for resuming a mission (FR-14). Game progress only; the crew name is local-only. */
export const SAVE_KEY = 'mbc.save.v1';

const SavedGameSchema = z
  .object({
    version: z.literal(1),
    savedAt: z.iso.datetime(),
    // Security audit F5: a loaded name must follow the same rule as the input (12 characters, letters,
    // numbers, spaces, hyphens). A tampered or invalid name falls back to the default crew name.
    crewName: z.string().transform((s) => {
      const t = s.trim();
      return /^[\p{L}\p{N} -]{1,12}$/u.test(t) ? t : DEFAULT_CREW;
    }),
    screen: z.enum(['mission', 'report']),
    game: GameStateSchema,
    lastResult: TurnResultSchema.nullable(),
    allocation: DraftAllocationSchema,
    recentSetIds: z.array(z.string()).max(3),
    placeholder: z.boolean(),
    site: z.enum(['moon', 'mars']).optional(),
  })
  .refine((s) => (s.screen === 'mission' ? s.game.status === 'playing' : s.lastResult !== null), {
    message: 'screen does not match game state',
  })
  .refine((s) => !s.site || !s.game.site || s.site === s.game.site, { message: 'site fields disagree' })
  .refine(isConsistent, { message: 'day, history and report disagree' });

/** Day, history and the shown report must tell one story. */
function isConsistent(s) {
  const { game, lastResult } = s;
  const last = game.history.at(-1);
  if (game.status === 'playing') {
    if (game.history.length !== game.day - 1) return false;
  } else if (!last || game.day !== last.day) {
    return false;
  }
  const same = (a, b) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
  if (s.screen === 'report') return same(lastResult, last);
  return lastResult === null || same(lastResult, last);
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage blocked: the game keeps working without saving.
  }
}

export function saveGame(snapshot) {
  try {
    const saved = { version: 1, savedAt: new Date().toISOString(), ...snapshot };
    localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
  } catch {
    // Private mode or quota: ignore.
  }
}

/** Returns a valid save, or null. Anything invalid or of another version is cleared. */
export function loadGame() {
  let raw;
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
      const site = data.game.site ?? data.site ?? 'moon';
      return { ...data, site, game: { ...data.game, site } };
    }
  } catch {
    // Invalid JSON: fall through.
  }
  clearSave();
  return null;
}
