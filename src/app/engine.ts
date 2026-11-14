/**
 * The one place the UI gets its engine from: the real engine (B2, accepted Sat 14 Nov 12:30).
 * The stub stays in src/app/stub-engine.ts for reference and isolated UI tests.
 */
import type { GameEngine } from '../shared/engine-api';
import * as real from '../engine';

export const engine: GameEngine = real;
export const ENGINE_IS_STUB = false;
