/** "How to play" seen flag (P1, D-038). localStorage only, never sent anywhere; every access is guarded. */
export const INTRO_KEY = 'mbc.introSeen';

export function hasSeenIntro() {
  try {
    return localStorage.getItem(INTRO_KEY) === '1';
  } catch {
    return false;
  }
}

export function markIntroSeen() {
  try {
    localStorage.setItem(INTRO_KEY, '1');
  } catch {
    // Private mode or blocked storage: the intro just shows again next time.
  }
}
