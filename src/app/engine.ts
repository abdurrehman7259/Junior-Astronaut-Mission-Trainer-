/**
 * The one place the UI gets its engine from.
 * Today: the stub. When B2 is accepted, switch to:
 *   import * as real from '../engine';
 *   export const engine: GameEngine = real;
 */
import type { GameEngine } from '../shared/engine-api';
import { stubEngine } from './stub-engine';

export const engine: GameEngine = stubEngine;
export const ENGINE_IS_STUB = true;
