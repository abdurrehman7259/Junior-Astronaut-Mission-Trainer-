# Security report: Moon Base Cadets

_Sun 15 Nov 2026, updated 21:00 PKT for the move to Vercel static hosting. Sources: the team's audit notes and the commits listed below._

## 1. Summary
- **Stack:** a React 19, TypeScript and Vite single-page app. It is hosted on **Vercel as a static site** (`dist/` only), with security headers set in `vercel.json`. There is **no server code**.
- **Data:** the static NASA snapshots live in `public/data/`. The live banner fetches two fixed URLs from NASA's keyless DONKI API (`https://ccmc.gsfc.nasa.gov/DONKI-API/get/FLR` and `/CME`) directly in the browser. That API sends `Access-Control-Allow-Origin: *`.
- **Not used:** accounts, a database, cookies, analytics and client secrets. Only `mbc.*` localStorage keys are stored.
- **Audit:** 0 Critical, 0 High, 3 Medium and 4 Low, plus one rate-limit "Needs decision". All of them are now fixed or removed along with the server.
- **Re-audit:** every item is PASS or N/A, with Critical 0, High 0, Medium 0 and Low 0. The Vercel change was then re-checked. It found 2 Low items in the new live fetch, and both are fixed: a failed feed now cancels the other request, and an invalid clock can no longer escape as an error.
- **Open findings: Critical 0, High 0, Medium 0, Low 0.**

## 2. Findings
| ID | Category | Severity | Issue | Status |
|---|---|---|---|---|
| F1 | Response size | Medium | Unbounded live body | Fixed: the browser live fetch reads at most 1 MiB and 1,000 records (`src/app/live.ts`) |
| F2 | Redirects | Medium | Upstream fetch followed redirects | Fixed: `redirect: 'error'` in `src/app/live.ts` and in every script fetch |
| F3 | Links | Medium | Data links were checked for https but not against a host allowlist | Fixed (`9c1bd10`): https on nasa.gov or noaa.gov only |
| F4 | Methods | Low | The function returned 405 for HEAD | Removed: there is no server function; static files only |
| F5 | Storage | Low | A loaded crew name could be 40 characters | Fixed (`f69b4d8`): the 12-character rule, else the default name |
| F6 | CSP | Low | Unused `api.nasa.gov` connection | Fixed: `connect-src 'self' https://ccmc.gsfc.nasa.gov` (exactly the live-banner host) |
| F7 | HSTS | Low | No explicit HSTS | Fixed: `Strict-Transport-Security: max-age=31536000` in `vercel.json` |
| F8 | Rate limiting | Needs decision | The public function had no per-IP limit | Removed: there is no endpoint of ours to abuse, and requests go to NASA directly |

## 3. Proof
- **Live fetch (`src/app/live.ts`):**
  - It requests exactly two fixed URLs, with nothing from the player in them.
  - It uses `credentials: 'omit'`, `redirect: 'error'` and `referrerPolicy: 'no-referrer'`, with a 3 s timeout, a 1 MiB / 1,000-record limit and schema validation. It never throws; any failure falls back to the archived snapshot.
  - When one feed fails, the other request is cancelled at once; an invalid clock resolves to the archived fallback instead of throwing.
  - Tests: `tests/ui/live.test.ts` and `tests/security/redirects.test.ts`.
- **Headers:** `vercel.json` applies the CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy and Cross-Origin-Opener-Policy to all routes. Tests: `tests/security/headers.test.ts` and `tests/scripts/privacy.test.ts` (both read `vercel.json`).
- **Links:** `tests/ui/link-allowlist.test.ts` and `tests/security/links.test.ts`.
- **Build output:** `tests/security/dist.test.ts` checks for no source maps and no key-like strings.
- **CI:** runs the security proof suite on the built output.
- **Secrets:** gitleaks 8.30.1 scanned all commits and found no leaks. Both `npm audit` runs report 0 vulnerabilities.

## 4. Not applicable
Passwords, MFA, RLS/IDOR, JWT, SQL/NoSQL, CSRF, webhooks, open redirects and CORS on our own endpoints don't apply. There is no auth, no database, no cookies and no server endpoint.

## 5. Manual follow-ups for Abdur Rehman Khan
- **Secrets to rotate:** none. There are no environment variables.
- **After deploy:** check the response headers in DevTools (docs/DEPLOY.md, check 2).
- **Before going public:** keep local archives and presentation files out of the repo (they are gitignored).

## 6. Remaining risks
- Each player's browser contacts `ccmc.gsfc.nasa.gov` once per visit for the live banner. NASA sees the player's IP address and browser user agent, but no referrer and no cookies.
- NASA's API is often slow. The game then shows the archived snapshot and labels it "archived".
