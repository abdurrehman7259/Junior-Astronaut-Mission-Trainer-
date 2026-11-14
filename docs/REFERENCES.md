# References

Every dataset, source, library, font, icon and sound used by Moon Base Cadets.
Last updated: Sun 15 Nov 2026. Data is stored as snapshots in `public/data/`. All snapshots are **Archived (retrieved 2026-11-14)**.
Game numbers (meters, power units, game dose, strength) are game rules and are not listed here as sources; they live in `src/engine/rules.ts`.

## NASA data and services

| Dataset / service | File in `public/data/` | Retrieved | Used for | Link | Licence / terms |
|---|---|---|---|---|---|
| NASA DONKI (Space Weather Database Of Notifications, Knowledge, Information), CCMC: solar flares (FLR) and CMEs, 2024-01-01 to 2025-12-31 | `donki-events.json` | 2026-11-14 | Moon events and quiet days | https://ccmc.gsfc.nasa.gov/tools/DONKI/ | NASA open data; no key needed |
| DONKI API, keyless (D-013) | none (used by `scripts/` and the live function) | n/a | Fetching FLR and CME records, and the live 7-day banner | https://ccmc.gsfc.nasa.gov/DONKI-API/get/ (`FLR`, `CME`) | as above |
| DONKI record pages | none (linked per event) | n/a | "See the NASA record" links, e.g. https://ccmc.gsfc.nasa.gov/DONKI/view/CME/28440/-1 | https://ccmc.gsfc.nasa.gov/DONKI/view/... | as above |
| DONKI Mars-impact CMEs: CMEs whose WSA-ENLIL model run predicted a Mars impact | `donki-mars-events.json` | 2026-11-14 | Mars events. A prediction, not an observation. Dates are CME start dates at the Sun | https://ccmc.gsfc.nasa.gov/tools/DONKI/ | NASA open data |
| NASA OSDR (Open Science Data Repository), public Search API | `osdr-facts.json` | 2026-11-14 | "Real NASA science" cards (studies below) | https://osdr.nasa.gov/bio/ | NASA open data |
| NASA RadLab (OSDR visualisation), preliminary ISS dosimetry | `radlab-dose.json` | 2026-11-14 | A qualitative note only. **No dose number is shown** (D-028) | https://visualization.osdr.nasa.gov/radlab/ | NASA open data |
| NASA Mars Trek and Jezero Crater site facts | `mars-site.json` | 2026-11-14 | Mars site, sol length, radio time. Mars Trek is credited and linked (no deep link to Jezero was verified, so the home page is used) | https://trek.nasa.gov/mars/ | NASA open data |
| api.nasa.gov (optional key gateway) | none | n/a | Only the OSDR snapshot notes point to its documentation. The live function and fetch scripts use the keyless CCMC API | https://api.nasa.gov/ | NASA API terms |

Notes
- Old host: `kauai.ccmc.gsfc.nasa.gov` and `api.nasa.gov/DONKI` are no longer used (D-013).
- RadLab: the unit is µGy/hour. The preliminary value is about twice the published Columbus values (DOSIS 3D, Berger et al. 2016), so it is hidden. See `docs/DECISIONS.md` D-028.
- Mars-impact CMEs: in the snapshot, `marsImpact: "listed"` means NASA's model listed a Mars impact. `"game-only"` would mean a game rule; the Data used panel adjusts its wording for that.
- Archived DONKI records were selected by game rules (severity bands, spaced picks, verified quiet dates). Selection notes are in each file's `notes` field.

### OSDR studies shown in the debrief (6)

| ID | Study title | Link |
|---|---|---|
| OSD-21 | Effects of spaceflight on murine skeletal muscle gene expression | https://osdr.nasa.gov/bio/repo/data/studies/OSD-21 |
| OSD-326 | Gene-metabolite network linked to inhibited bioenergetics in association with spaceflight induced loss of quadriceps muscle | https://osdr.nasa.gov/bio/repo/data/studies/OSD-326 |
| OSD-342 | Targeting myostatin/activin A protects against skeletal muscle and bone loss during spaceflight [plasma proteomics] | https://osdr.nasa.gov/bio/repo/data/studies/OSD-342 |
| OSD-360 | Effects of low dose space radiation exposures on the splenic metabolome | https://osdr.nasa.gov/bio/repo/data/studies/OSD-360 |
| OSD-366 | Coalescence of DNA double strand breaks induced by galactic cosmic radiation is modulated by genetics in 15 inbred strains of mice | https://osdr.nasa.gov/bio/repo/data/studies/OSD-366 |
| OSD-396 | Gene-metabolite networks associated with impediment of bone fracture repair in spaceflight | https://osdr.nasa.gov/bio/repo/data/studies/OSD-396 |

The kid text describes what each study asked, not invented results. The radiation studies used ground-based or simulated deep-space radiation, not astronaut flight measurements.

## Science sources for player-facing facts

Checked live on 14 Nov 2026 and signed off by the science checker. Row numbers match `docs/FACT_CHECK.md`.

| Source | Link | Claims it supports (FACT_CHECK rows) |
|---|---|---|
| NASA Space Radiation Analysis Group (SRAG) FAQ | https://srag.jsc.nasa.gov/spaceradiation/faq/faq.cfm | Dose is how much radiation energy a body soaks up (#1) |
| NOAA SWPC: Solar Flares / Radio Blackouts | https://www.swpc.noaa.gov/phenomena/solar-flares-radio-blackouts | A flare is a sudden flash of energy and light (#2). Flare classes A, B, C, M, X; each about 10 times the last (#9) |
| NOAA SWPC: Coronal Mass Ejections | https://www.swpc.noaa.gov/phenomena/coronal-mass-ejections | A CME is a huge cloud of solar gas and magnetism (#3). Travel-time estimate from speed (#11) |
| NASA NTRS 20110012713 | https://ntrs.nasa.gov/citations/20110012713 | Shielding (water, plastic, Moon soil) blocks some radiation (#4) |
| NASA: Barsoom (definition of a sol) | https://www.nasa.gov/image-article/barsoom/ | A sol is one Mars day, 24 h 39 min 35 s (#5) |
| NASA NTRS 20250009282, "Why Moon to Mars" (2025 IAC), page 3 | https://ntrs.nasa.gov/api/citations/20250009282/downloads/2025%20IAC%20-%20Why%20Moon%20and%20Mars%20-%200916%20Edits.pdf | Radio takes about 4 to 24 minutes one way between Earth and Mars (#6) |
| NASA: Mars 2020 Perseverance | https://science.nasa.gov/mission/mars-2020-perseverance/ | Jezero once held a lake; Perseverance landed there on 18 Feb 2021 (#7) |
| NASA: Perseverance location map | https://science.nasa.gov/mission/mars-2020-perseverance/location-map/ | Landing date and location (mars-site.json source) |
| NASA NTRS 20210023904 (Fassett and Goudge, crater lakes), Table 4 | https://ntrs.nasa.gov/api/citations/20210023904/downloads/ANUGAdraft_16_NoLine_ForSTI.pdf | Jezero is at about 18.4°N, 77.7°E (#8) |
| NASA Solar Cycle 25 blog: Solar Flares FAQs | https://science.nasa.gov/blogs/solar-cycle-25/2022/06/10/solar-flares-faqs/ | Flare light reaches the Moon in about 8 minutes (#10). Flare classes (#9) |
| NASA Apollo Lunar Surface Journal: radiation on the Moon | https://www.nasa.gov/wp-content/uploads/static/history/alsj/WOTM/WOTM-Radiation.html | The ISS is inside Earth's magnetic field; the Moon's surface is not, so radiation there is higher (#15) |
| DONKI WSA-ENLIL Mars-impact lists and DONKI CME/FLR record pages | https://ccmc.gsfc.nasa.gov/tools/DONKI/ | Real event dates and sizes (#19). "NASA's space-weather model predicted this CME would reach Mars" (#12). Quiet-day wording: DONKI logs notable events only (#13, #14) |
| NASA OSDR study pages | see the OSDR table above | Study descriptions (#18) |
| DOSIS 3D, Berger et al. 2016 (cited in D-028; no URL kept in the repo) | none | Published Columbus dose values used to decide not to show a RadLab number (#16) |

## Libraries (runtime, shipped)

Exact versions are those installed (`npm ls`, `package-lock.json`).

| Package | Version | Licence | Link |
|---|---|---|---|
| react | 19.3.1 | MIT | https://react.dev |
| react-dom | 19.3.1 | MIT | https://react.dev |
| zod | 4.6.7 | MIT | https://zod.dev |

## Libraries (build, test and lint only; not shipped)

| Package | Version | Licence |
|---|---|---|
| vite | 8.3.8 | MIT |
| @vitejs/plugin-react | 6.3.0 | MIT |
| typescript | 7.0.2 | Apache-2.0 |
| vitest | 5.1.0 | MIT |
| @vitest/coverage-v8 | 5.1.0 | MIT |
| tsx | 4.23.15 | MIT |
| jsdom | 31.0.1 | MIT |
| @playwright/test | 1.65.1 | Apache-2.0 |
| @testing-library/react | 16.3.3 | MIT |
| @testing-library/user-event | 14.6.10 | MIT |
| @testing-library/jest-dom | 7.0.1 | MIT |
| oxlint | 1.93.0 | MIT |
| @types/node | 24.19.2 | MIT |
| @types/react | 19.3.0 | MIT |
| @types/react-dom | 19.3.0 | MIT |

Transitive dependencies are listed in `package-lock.json`. Their licences were not audited one by one.

## Fonts, icons, images, sounds

- **Fonts:** system font stack only. No web fonts and no font CDN.
- **Icons:** original inline SVG drawn for this project (`src/ui/components/icons.tsx`, plus the Moon, Mars, antenna and base art in the screens). No icon library.
- **Favicon:** original SVG (`public/favicon.svg`): a simple Moon shape. No agency insignia.
- **Images:** none loaded. No photos, no NASA imagery, no NASA logos or insignia, and no likeness of any person.
- **Sounds:** none.
- **AI-generated images:** none.
