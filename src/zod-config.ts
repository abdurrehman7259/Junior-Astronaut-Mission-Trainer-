import { z } from 'zod';

// Imported first by main.tsx, before any schema exists. zod decides at schema creation
// whether to probe new Function(); our CSP has no 'unsafe-eval', so that probe would
// log a securitypolicyviolation on every load (A3 C4). jitless skips it.
z.config({ jitless: true });
