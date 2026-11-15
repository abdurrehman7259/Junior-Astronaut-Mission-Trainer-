# Moon Base Cadets

Run a Moon base. Survive real solar storms.

## Live demo

`<LIVE_URL>`

## What it is

Moon Base Cadets is a free browser game for kids aged 7 to 12. You run a base on the Moon or on Mars for 10 days. Real solar flares and storm clouds from NASA's records hit the base, and your job is to keep the crew safe and earn science points. There is no sign-up, and the game collects no personal data.

## How to play

- Choose a base: the Moon (easier, you see each storm before you plan) or Mars (harder, storm news arrives one sol late; this delay is a game rule).
- Each day, share 10 power between Air & food, Shields and Science. Shields and science use the battery.
- Press **Start day N**. The day report says whether your choice was good and what changed.
- Survive 10 days to win. The debrief shows what really happened each day, with NASA links and a real NASA study.

## NASA data used

| Data | Used for |
|---|---|
| [DONKI](https://ccmc.gsfc.nasa.gov/tools/DONKI/) (NASA CCMC): solar flares and CMEs, 2024 to 2025, plus a live 7-day feed | Daily events on the Moon and calm days |
| [DONKI](https://ccmc.gsfc.nasa.gov/tools/DONKI/) Mars-impact CMEs (WSA-ENLIL model) | Events on Mars |
| [OSDR](https://osdr.nasa.gov/bio/) (Open Science Data Repository) | Six space biology studies in the debrief |
| [RadLab](https://visualization.osdr.nasa.gov/radlab/) | A note on space station radiation (no dose number shown) |
| [Mars Trek](https://trek.nasa.gov/mars/) | The Jezero Crater base |

All data is stored as snapshots and labelled "Archived (retrieved 2026-11-14)" in the game. Full list: [docs/REFERENCES.md](docs/REFERENCES.md).

## Tech stack

TypeScript, React 19, Vite 8, zod 4, plain CSS. Vitest and Playwright for tests, oxlint, GitHub Actions CI. Static hosting on Vercel; the live banner reads NASA DONKI directly from the browser.

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit and integration tests
npm run build    # production build in dist/
```

Also: `npm run typecheck`, `npm run lint`, `npm run preview`, `npm run e2e` (Playwright), `npm run simulate` (balance report in `reports/`).

## Project structure

```
src/
  engine/      pure, seeded game rules (no UI)
  app/         app state, data loading, saves
  ui/          React screens, components and kid copy
  shared/      types and schemas for every data file
public/data/   NASA snapshots (JSON)
scripts/       data fetch scripts and the balance simulator
tests/, e2e/   unit, security and end-to-end tests
docs/          references, science sources, AI use, deploy guide
```

## Security

No accounts, cookies or analytics. The only outside request is the live banner, which asks NASA DONKI for the last 7 days. See [SECURITY_REPORT.md](SECURITY_REPORT.md).

## AI use

The team designed the game; AI tools were used for implementation under the team's direction.

## Science sources

Every real fact in the game and its checked source: [docs/SCIENCE_SOURCES.md](docs/SCIENCE_SOURCES.md).

## License

The code is MIT-licensed: see [LICENSE](LICENSE). NASA, NOAA and CSA data and links stay under their own terms. This version uses no CSA data. This project is not endorsed by NASA and uses no NASA logos.

## Team

- **Abdur Rehman Khan**: product owner, design, science check, pitch
- **Mairaj Alam**: playtester
- **Maaz Iqbal**: playtester

Built for the NASA Space Apps Challenge 2026: "Build a Junior Astronaut Mission Trainer".
