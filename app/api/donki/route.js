// GET /api/donki — the same-origin proxy for NASA's DONKI API (D-041). All logic and input checks live in
// server/donki.js so they can be unit-tested; this file only connects it to the Next.js route.
import { handleDonki } from '../../../server/donki.js';

export function GET(request) {
  return handleDonki(request);
}
