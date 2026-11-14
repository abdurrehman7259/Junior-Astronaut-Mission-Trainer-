export const CREW_NAME_KEY = 'mbc.crewName';
export const CREW_NAME_MAX = 12;
export const DEFAULT_CREW_NAME = 'Cadets';

/** Keeps letters, numbers, spaces and hyphens, at most 12 characters. Not trimmed (so typing a space works). */
export function sanitizeCrewName(raw: string): string {
  return raw.replace(/[^\p{L}\p{N} -]/gu, '').slice(0, CREW_NAME_MAX);
}

export function loadCrewName(): string {
  try {
    const stored = localStorage.getItem(CREW_NAME_KEY);
    return stored ? sanitizeCrewName(stored).trim() : '';
  } catch {
    return '';
  }
}

export function saveCrewName(name: string): void {
  try {
    localStorage.setItem(CREW_NAME_KEY, name);
  } catch {
    // Private mode or blocked storage: the game works without it.
  }
}
