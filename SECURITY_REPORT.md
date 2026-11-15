# Security report: Moon Base Cadets

_Sun 15 Nov 2026, 20:05 PKT. Sources: the team's audit notes and the commits listed below._

## 1. Summary
- **Stack:** React 19, TypeScript and Vite single-page app on Netlify, publishing `dist/` only. There is one public GET function, `netlify/functions/space-weather.ts`, which reads a fixed NASA CCMC DONKI address. The static JSON lives in `public/data/`, and the browser keeps only `mbc.*` localStorage keys. There are no accounts, database, cookies, analytics or client secrets.
- **Audit (SEC-A, builder agent model high):** 0 Critical, 0 High, 3 Medium, 4 Low, plus one rate-limit "Needs decision".
- **Now:** all 7 findings and the rate-limit item are **fixed**, with proof tests. Open findings: **0 Critical, 0 High, 0 Medium, 0 Low.**
- **Re-audit (SEC-A2, builder agent model high, 20:02):** every item is PASS or N/A, with open findings Critical 0, High 0, Medium 0, Low 0 . It confirmed 1,658 unit tests and 54 security tests pass, both npm audits show 0 vulnerabilities, and the history scan covered 90 commits.

## 2. Findings
| ID | Category | Severity | File | Issue | Status |
|---|---|---|---|---|---|
| F1 | Function abuse | Medium | `netlify/functions/space-weather.ts` | Unbounded upstream and response body | Fixed (`e7772ea`) |
| F2 | SSRF / redirects | Medium | `space-weather.ts`, `scripts/lib/http.ts`, `scripts/fetch-{osdr,mars-site}.ts` | fetch followed redirects off the fixed host | Fixed (`e7772ea`) |
| F3 | XSS / links | Medium | `src/shared/schemas.ts` | Data links were checked for https but not against a host allowlist | Fixed (`9c1bd10`) |
| F4 | Function methods | Low | `space-weather.ts` | HEAD got 405 | Fixed (`e7772ea`) |
| F5 | Storage | Low | `src/app/save.ts` | A loaded crew name could be 40 characters | Fixed (`f69b4d8`) |
| F6 | Headers | Low | `netlify.toml` | CSP allowed an unused `api.nasa.gov` connection | Fixed (`ff68a0e`) |
| F7 | Headers | Low | `netlify.toml` | No explicit HSTS | Fixed (`ff68a0e`) |
| F8 | Rate limiting | Needs decision | `space-weather.ts` | No per-IP limit | Fixed (`e7772ea`), owner option a |

## 3. Fixes and proof
- **F1:** the body is read as a bounded stream (1 MiB, at most 1,000 records) and the response is capped at 1 MiB. Test: `tests/security/space-weather.test.ts`.
- **F2:** `redirect: 'error'` is set on every upstream fetch. Test: `tests/security/redirects.test.ts`, plus `tests/functions/space-weather.test.ts` (checks `redirect === 'error'`).
- **F3:** a data link must be `https:` on `nasa.gov` or `noaa.gov`, by exact host or dot-suffix, with no credentials. Test: `tests/ui/link-allowlist.test.ts` rejects `javascript:`, `http:`, `evilnasa.gov` and `nasa.gov.evil.com`, and every link in `public/data/*.json` passes.
- **F4:** only GET and HEAD are allowed; anything else gets 405 with `Allow: GET, HEAD`. Tests: `tests/security/space-weather.test.ts`, `tests/functions/space-weather.test.ts`.
- **F5:** a loaded name must be 1–12 letters, numbers, spaces or hyphens after trimming; otherwise it falls back to "Cadets". Test: `tests/ui/save.test.ts` (tampered 40-character save, markup, trimming).
- **F6 and F7:** CSP `connect-src 'self'`; `Strict-Transport-Security: max-age=31536000` (no preload). Tests: `tests/security/headers.test.ts`, `tests/scripts/privacy.test.ts`.
- **F8:** Netlify's code-based `rateLimit` in the function `config` allows 30 requests per 60 s, grouped by IP and domain. Per docs.netlify.com, this is available on the free plan. Test: `tests/security/rate-limit.test.ts`.
- **CI:** runs the security proof suite on the built output (`.github/workflows/ci.yml`).
- **Results:** 1,658 of 1,658 unit tests pass (36 files), the security suite passes 54 of 54, and both `npm audit` runs report 0 vulnerabilities.

## 4. Not applicable 
Passwords, MFA, RLS/IDOR, JWT, SQL/NoSQL, CSRF, webhooks and open redirects don't apply. There is no auth code, no database, no cookies, no state-changing endpoint and no redirect handler; grep checks found none.

## 5. Manual follow-ups for Abdur Rehman Khan
- **Secrets to rotate:** none. gitleaks 8.30.1 scanned all 83 commits and found no leaks. Nothing deployed reads `NASA_API_KEY`.
- **After deploy:**
  1. Check that `/.netlify/functions/space-weather` answers. The function now declares an explicit `config.path` and `rateLimit`, and only Netlify can show whether they work.
  2. Check that the response headers include HSTS and the CSP.
- **Before going public:**
  1. Keep local archives and presentation files out of the repo (they are gitignored).
  2. Make the repo public only after the live smoke test passes.

## 6. Remaining risks
- Production behaviour (the Netlify rate limit, headers and function path) can only be verified on the live site.
- The rate limit can take up to about 10 s to start enforcing, and Netlify doesn't document a Retry-After value.
- The live banner uses a third-party NASA API that is often slow. The game falls back to archived data and labels it as archived.
