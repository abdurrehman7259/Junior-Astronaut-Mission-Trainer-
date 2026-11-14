# Moon Base Cadets

**Run a Moon base. Survive real solar storms.**

A browser game for kids aged 7–12, built for the NASA Space Apps Challenge 2026 challenge
"Build a Junior Astronaut Mission Trainer". You run a base for 10 mission days and split 10 power units a day
between Life support, Shielding and Science, while **real solar flares and CMEs from NASA's DONKI database** hit the base.
The game has two sites: a Moon base and a Mars base.

Live game: `<LIVE_URL>` (placeholder; the repo is private and the game is not deployed yet).

## Team
| Person | Roles |
|---|---|
| **Abdur Rehman Khan** | Product owner, game designer, playtester, science checker, designer, pitch lead |
| **Mairaj Alam** | Playtester |

The game concept came from the team. AI tools were used for implementation only, under the team's direction.

## How to play
1. Type a crew name (optional). It stays on your device.
2. Choose a base: **Moon** (south pole) or **Mars** (Jezero Crater).
3. A mission lasts 10 days (Moon) or 10 sols (Mars). A sol is one Mars day.
4. Each day, split **10 power units** between **Life support**, **Shielding** and **Science**.
5. Moon: an event card shows the day's real NASA event *before* you allocate. It has a "Real event" or "Real quiet day" badge, the real date and a link to the NASA record.
6. Mars: the card is a "Message from Earth" that says "Arrives tomorrow". The warning arrives one sol late. **This delay is a game rule.** Real radio messages take minutes, not a sol.
7. Press **Run day N** (Mars: **Run sol N**). The **day report** shows each meter before and after, with an arrow and a sentence on why.
8. After day 10, the **debrief** lists what really happened each day with NASA links, plus one real NASA science study.
9. Play again. You get a new set of real events.

## What is real and what is a game rule
| Real (each has a source link in the game) | Game rule (labelled as such) |
|---|---|
| The date, type and class or speed of each flare or CME | Power units, the three meters, science points |
| Quiet days with no big flare or CME in NASA's storm log | "Game strength" of an event, "game dose", shield maths |
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
npm run e2e          # Playwright (needs a build)
```
Data and balance scripts (these need network access for NASA; they overwrite files in `public/data/`):
```bash
npm run fetch:donki
npm run fetch:radlab
npm run fetch:osdr
npm run simulate     # writes reports/balance-report.md
```

## Tests
- **Unit and integration** (Vitest): `tests/engine`, `tests/scripts`, `tests/functions`, `tests/ui`.
- **End to end** (Playwright, `e2e/`): a full mission on each site, keyboard-only play, offline play, no sideways scroll at 360, 768, 1024 and 1920 px.
- **Privacy guard** (`tests/scripts/privacy.test.ts`): fails if the code adds a tracker or a third-party request.
- **Balance report** (`reports/balance-report.md`): 1000 simulated missions per strategy. It checks that the game is winnable but not trivial. These are game rules, not real data.

## Deploy
See [docs/DEPLOY.md](docs/DEPLOY.md). The site builds with `npm run build` and deploys to Netlify.

## Demo
The 30-second demo plan is in [docs/DEMO.md](docs/DEMO.md).

## AI use
The concept came from the team. AI was used for implementation only.

## Licence
MIT (see `license` in `package.json`). Third-party libraries and their licences: [docs/REFERENCES.md](docs/REFERENCES.md).
NASA and NOAA data are linked and credited, not relicensed. This project is not endorsed by NASA and uses no NASA logos.
