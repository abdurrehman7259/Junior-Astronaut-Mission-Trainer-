/**
 * The one place the UI gets its engine from: the real engine (B2, accepted Sat 14 Nov 12:30).
 * The stub stays in src/app/stub-engine.js for reference and isolated UI tests.
 */

import * as real from '../engine/index.js';

export const engine = real;
export const ENGINE_IS_STUB = false;
