# Deploying Moon Base Cadets to Netlify

**Deadline: deploy by Sun 15 Nov, 18:00.** The live check, the demo recording and the Space Apps submission all need the live URL before 22:00 (D-021).
Time needed: about 10 minutes to set up and about 3 minutes per build, then the 15-minute smoke checklist below.

Before you start:
- `main` on GitHub is green. CI runs typecheck, tests and build on every push.
- No API key is needed. The live function uses NASA's keyless CCMC DONKI API (D-013), and nothing in the site reads `NASA_API_KEY`. **Never paste a key into chat or commit it.**

## 1. Create the site (one time)
1. Go to **https://app.netlify.com** and sign in with **GitHub**.
2. Click **Add new project** → **Import an existing project** → **GitHub**.
3. If Netlify asks for access: **Configure the Netlify app on GitHub** → **Only select repositories** → tick **`Junior-Astronaut-Mission-Trainer-`** → **Save**. The repo is private, which is fine.
4. Pick **`abdurrehman7259/Junior-Astronaut-Mission-Trainer-`**.
5. **Build settings**: these come from our `netlify.toml`, so leave the fields as Netlify shows them:
   | Field | Expected value |
   |---|---|
   | Branch to deploy | `main` |
   | Base directory | _(empty)_ |
   | Build command | `npm run build` |
   | Publish directory | `dist` |
   | Functions directory | `netlify/functions` |
   If any field differs, don't edit it in the UI. Tell lead agent, because `netlify.toml` is the source of truth.
6. **Environment variables: skip.** Don't add `NASA_API_KEY`. The deployed function uses NASA's keyless CCMC DONKI API, and neither the build nor the function reads a key. Storing an unused secret is only risk.
7. Click **Deploy** (Netlify may label it "Deploy moon-base-cadets"). Wait for **Published** (about 2–4 minutes).
8. Optional: **Project configuration** → **Change project name** → `moon-base-cadets` gives `https://moon-base-cadets.netlify.app`.
9. Send lead agent the URL.

## 2. If the build fails
- Open **Deploys** → the failed deploy → **Deploy log**. Copy the last 30 lines to lead agent. They never contain the key; Netlify masks env values.
- Common causes: the Node version (we pin `NODE_VERSION = "24"` in `netlify.toml`), or a lockfile mismatch (fix by running `npm install` locally, committing `package-lock.json` and pushing).

## 3. 15-minute post-deploy smoke checklist (17 min with the optional Safari check)
Use a **private/incognito window**, with no login.

| # | Check (min) | Pass if |
|---|---|---|
| 1 | Open the URL (1) | The start screen appears in under 3 s. There is no "Dev mode" banner and no login, cookie banner or pop-up. |
| 2 | **Data used** button (1) | DONKI shows "Archived (retrieved 2026-11-14)". OSDR and RadLab are listed. No dose number is shown. |
| 3 | Live banner (1) | It says either "Live from NASA…" or "Live NASA feed unavailable… archived". Never "Live" with archived data. |
| 4 | Start a **Moon** mission (3) | The "How to play" intro opens (Skip it). Day 1 shows a "Real storm from NASA" or "Calm day (real NASA date)" badge, a real date and a "See the NASA record" link that opens a ccmc.gsfc.nasa.gov page. |
| 5 | Play all 10 days (4) | Each day has a report with arrows and a sentence per meter. The end screen shows a timeline with NASA links and one "Real NASA science" study. |
| 6 | **Mars** mission, if shipped (3) | It says "sol". "Message from Earth: arrives tomorrow" appears. The report reveals the storm. Jezero Crater and Mars Trek are credited in Data used. |
| 7 | Reload mid-mission (1) | "Continue mission (Day N)" appears and works. |
| 8 | Tablet width (1) | DevTools → toggle device toolbar → iPad. Nothing is cut off, and there is no sideways scroll. |
| 9 | DevTools → **Network** and **Console** (1) | Every request goes to your netlify.app domain. There are **no third-party domains** (NASA links only open when clicked). The Console shows no "Content Security Policy" errors. |
| 10 | DevTools → **Application** → Cookies (0.5) | None. Local storage has only `mbc.*` keys. |
| 11 | Offline (1) | DevTools → Network → Offline → reload is not expected to work. Instead go offline *after* loading and play a day: the game keeps working. |
| 12 | **Safari / iPad**, if you have one (2) | Start a mission and play 2 days. Nothing is cut off, and the buttons work by touch. (Not testable locally: D-033.) |

Note the results (pass/fail plus a note) for each row.

## 4. After it's live
- Every push to `main` redeploys automatically. After **Gate 3 (Sun 16:00)**, only fixes get pushed.
- Record the demo from the live URL (screen recording only, 30 s or less, no minors, no NASA logos).
- Put the live URL into the README. If the repo must be public for judging, switch it to public in GitHub → Settings → General → Danger Zone → Change visibility. **This is your call.**
