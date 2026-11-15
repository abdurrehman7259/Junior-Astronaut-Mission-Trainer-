# Deploying Moon Base Cadets (Vercel)

The game is a static site. Vercel builds it with `npm run build` and serves `dist/`.
There is no server code and no environment variable. The live banner asks NASA's keyless DONKI API
(`https://ccmc.gsfc.nasa.gov/DONKI-API/`) directly from the browser. `vercel.json` sets the security headers
(CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy) on every route.

## 1. First deploy (about 5 minutes)
1. Go to vercel.com and log in with GitHub.
2. Click **Add New…** → **Project**.
3. Under **Import Git Repository**, find `Junior-Astronaut-Mission-Trainer-` and click **Import**.
   If you don't see it, click **Adjust GitHub App Permissions** and allow access to this repository.
4. **Framework Preset:** Vite. Leave the Root Directory as `./`.
   The build command (`npm run build`) and output directory (`dist`) come from `vercel.json`; leave them as they are.
5. **Environment Variables:** add none.
6. Click **Deploy**. Wait for "Congratulations!" (usually 1–2 minutes).
7. Click **Continue to Dashboard** and copy the domain (`https://<project>.vercel.app`). This is the live URL.

If the build fails: open **Deployments** → the failed deployment → **Build Logs**, and copy the last 30 lines.
A common cause is a lockfile mismatch. Fix it by running `npm install` locally, committing `package-lock.json` and pushing.

## 2. 15-minute smoke checklist
Use a **private/incognito window**, with no login.

| # | Check | Pass if |
|---|---|---|
| 1 | Open the live URL | The start screen appears in under 3 s, with no "Dev mode" banner, login, cookie banner or pop-up. |
| 2 | DevTools → **Network**, reload | The response for the page has `content-security-policy` (with `connect-src 'self' https://ccmc.gsfc.nasa.gov`), `strict-transport-security`, `x-frame-options: DENY`, `x-content-type-options: nosniff`, `referrer-policy: no-referrer` and `permissions-policy`. |
| 3 | Live banner and **Data used** | The banner says "Live from NASA…" (when NASA answers within 3 s) or "You're playing with archived NASA records (retrieved 2026-11-14)". It never says "Live" for archived data. Data used lists DONKI, OSDR and RadLab with "Archived (retrieved 2026-11-14)" labels, and shows no dose number. |
| 4 | Start a **Moon** mission | "How to play" opens (Skip it). Day 1 starts with "Power left to share: 10", and **Start day 1** stays disabled until all 10 are shared. Then play all 10 days: each report starts with a verdict, and the end screen shows the outcome, the score, the lesson, NASA links and one NASA study. |
| 5 | **Mars** mission, reload, phone width | It says "sol", and the "Message from Earth" comes after you plan. Reload mid-mission and "Continue" works. DevTools device toolbar at iPhone or iPad size: no sideways scroll, and the Start button stays visible. |
| 6 | DevTools → **Network** and **Console** | Requests go only to your `vercel.app` domain and `ccmc.gsfc.nasa.gov` (the live banner). The Console shows no "Content Security Policy" errors. |
| 7 | DevTools → **Application** | No cookies. Local storage has only `mbc.*` keys. |
| 8 | **Safari / iPad** (optional) | Start a mission and play 2 days. Nothing is cut off, and the buttons work by touch. |

## 3. After it's live
- Every push to `main` redeploys automatically.
- Put the live URL in the README (replace `<LIVE_URL>`).
- Record the demo from the live URL: screen recording only, 30 s or less, no minors, no NASA logos.
- The repo's visibility is the owner's call: GitHub → Settings → General → Danger Zone → Change visibility.
