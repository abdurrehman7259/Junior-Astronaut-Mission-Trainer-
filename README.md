# Moon Base Cadets

**Run a Moon base. Survive real solar storms.**

A browser game for kids aged 7–12, built for the NASA Space Apps Challenge 2026 challenge
"Build a Junior Astronaut Mission Trainer". You run a base for 10 mission days and split 10 power units a day
between Air & food, Shields and Science, while **real solar flares and CMEs from NASA's DONKI database** hit the base.
The game has two sites: a Moon base and a Mars base.

Live game: `<LIVE_URL>` (placeholder; the repo is private and the game is not deployed yet).

## Team
| Person | Roles |
|---|---|
| **Abdur Rehman Khan** | Product owner, game designer, playtester, science checker, designer, pitch lead |
| **Mairaj Alam** | Playtester |
| **Maaz Iqbal** | Playtester |

The game concept came from the team. AI tools were used for implementation only, under the team's direction.

## How to play
**Goal:** keep your crew safe for 10 days (on Mars, 10 sols) and earn science points. The goal is always shown in the header.

1. Choose a base: **Moon** (south pole, easier: you get a warning before each storm) or **Mars** (Jezero Crater, harder: storm warnings arrive one sol late). Type a crew name if you like. It stays on your device.
2. The first time you play, a 3-card **How to play** intro explains the goal, the power and the storms. Reopen it any time with the **How to play** button.
3. Each day has three numbered steps. **1. Check today's space weather.** Moon: the event card shows the day's real NASA event *before* you plan, with a "Real storm from NASA" or "Calm day (real NASA date)" badge, the storm size, the real date and a link to the NASA record. Mars: a "Message from Earth" says today's storm news comes after you plan. **This delay is a game rule.** Real radio messages take minutes, not a sol.
4. **2. Share your 10 power** between **Air & food**, **Shields** and **Science**. Each day starts with all 10 unshared, so you always choose. Quick plans (Balanced, Storm-ready, Science day) are optional. The meters show ▲/▼ what your plan would do. Shields and science use the **Battery**, which recharges a little each day.
5. **3. Start the day** (Mars: **Start sol N**). The button works once all 10 power is shared. The **day report** opens with one verdict, such as "Great call! Your shields stopped the storm." It then gives one short line per meter.
6. After day 10, the **debrief** gives the outcome and why, your science score, what you learned, what really happened each day with NASA links, and one real NASA science study.
7. Play again. You get a new set of real events.

## What is real and what is a game rule
| Real (each has a source link in the game) | Game rule (labelled as such) |
|---|---|
| The date, type and class or speed of each flare or CME | Power units, the three meters, science points |
| Quiet days with no big flare or CME in NASA's storm log | The storm size (Small, Medium, Big), radiation numbers, shield maths |
| Which CMEs NASA's model predicted would reach Mars | The Moon warning before each storm; the one-sol-late Mars warning |
| Jezero Crater, sol length, Earth to Mars radio time (4 to 24 min one way) | Mission length, event draw, balance |
| Six OSDR space biology studies, described not "solved" | Meter changes and recharge values |

All game numbers live in `src/engine/rules.ts`. The in-game **Data used** panel lists every source.
Each claim and its checked source is in [docs/FACT_CHECK.md](docs/FACT_CHECK.md).

## NASA data used
Everything is stored as a snapshot in `public/data/`. All of it is **Archived (retrieved 2026-11-14)**.

| Data | Used for | Source |
|---|---|---|
| DONKI flares and CMEs, 2024-01-01 to 2025-12-31 | Moon events, quiet days | [NASA DONKI (CCMC)](https://ccmc.gsfc.nasa.gov/tools/DONKI/), API `https://ccmc.gsfc.nasa.gov/DONKI-API/` |
| DONKI Mars-impact CMEs (WSA-ENLIL model) | Mars events | [NASA DONKI (CCMC)](https://ccmc.gsfc.nasa.gov/tools/DONKI/) |
| OSDR studies (6) | "Real NASA science" card | [NASA OSDR](https://osdr.nasa.gov/bio/) |
| RadLab ISS dose data | A note only. **No dose number is shown** | [NASA RadLab](https://visualization.osdr.nasa.gov/radlab/) |
| Mars Trek and Jezero facts | Mars site | [NASA Mars Trek](https://trek.nasa.gov/mars/) |
| NOAA SWPC pages | Glossary: solar flare, CME | [flares](https://www.swpc.noaa.gov/phenomena/solar-flares-radio-blackouts), [CMEs](https://www.swpc.noaa.gov/phenomena/coronal-mass-ejections) |

Why no RadLab dose number (D-028): the preliminary value is about twice the published Columbus values, and it would clash with NASA's Apollo figures
for the Moon. Details are in [docs/DECISIONS.md](docs/DECISIONS.md). Full list with licences: [docs/REFERENCES.md](docs/REFERENCES.md).

## Privacy
- No accounts, cookies, analytics or third-party requests. The page talks only to its own host.
- NASA links open only when you click them.
- Your crew name and saved mission stay in your browser's localStorage, under keys that start with `mbc.`. They are never sent anywhere.
- The Netlify config (`netlify.toml`) sets a strict Content-Security-Policy.

## Accessibility
- Everything works with the keyboard, with a visible focus ring.
- Touch targets are at least 44×44 px.
- Never colour alone: every state has a number, an icon and a label.
- The layout works from 360 to 1920 px wide.
- System fonts only. Kid copy uses short sentences.

## How it works
- `src/engine/`: a pure, seeded game engine. Same seed and same plan give the same result. No UI code.
- `src/ui/` and `src/app/`: React 19 and TypeScript. The UI reaches the engine only through `src/app/engine.ts`.
- `src/shared/`: types and zod schemas. Every snapshot is validated before use.
- `scripts/`: fetch scripts that build the snapshots, and the balance simulator.
- `netlify/functions/space-weather.ts`: a live function that reads the last 7 days from DONKI.
  If it is slow or fails, the game falls back to the archived data and says so. The banner never calls archived data "live".

## Running locally
```bash
npm install
npm run dev          # http://localhost:5173
npm run typecheck
npm run lint
npm test             # unit tests
npm run build
npm run preview      # serve the production build
npm run e2e          # Playwright: builds, then serves the app on :4174 itself
```
Data and balance scripts (these need network access for NASA; they overwrite files in `public/data/`):
```bash
npm run fetch:donki
npm run fetch:radlab
npm run fetch:osdr
npx tsx scripts/fetch-mars-events.ts   # DONKI CMEs with a modelled Mars impact
npx tsx scripts/fetch-mars-site.ts     # Jezero Crater and Mars Trek facts
npm run simulate     # writes reports/balance-report.md
```

## Tests
- **Unit and integration** (Vitest): `tests/engine`, `tests/scripts`, `tests/functions`, `tests/ui`.
- **End to end** (Playwright, `e2e/`): a full mission on each site, keyboard-only play, offline play, no sideways scroll at 360, 768, 1024 and 1920 px, and a full mission under the exact `netlify.toml` CSP with no violations.
- **Privacy guard** (`tests/scripts/privacy.test.ts`): fails if the code adds a tracker or a third-party request.
- **Balance report** (`reports/balance-report.md`): 1000 simulated missions per strategy. It checks that the game is winnable but not trivial. These are game rules, not real data.

## Deploy
See [docs/DEPLOY.md](docs/DEPLOY.md). The site builds with `npm run build` and deploys to Netlify.

## Demo
The 30-second demo plan is in [docs/DEMO.md](docs/DEMO.md).

## AI use
The concept came from the team. AI was used for implementation only.

## Licence
The code is MIT-licensed: see [LICENSE](LICENSE) (copyright 2026 Abdur Rehman Khan). Third-party libraries and their licences: [docs/REFERENCES.md](docs/REFERENCES.md).
NASA, NOAA and CSA data and links stay under their own terms. They are linked and credited, not relicensed. (This version uses no CSA data; the planned food feature that would have used it was cut.)
This project is not endorsed by NASA and uses no NASA logos.
