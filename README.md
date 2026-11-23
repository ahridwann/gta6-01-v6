# Vanta City: Night Runner

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/ahridwann/gta6-01-v6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/ahridwann/gta6-01-v6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game for the **Make GTA 6** bounty on [make.fun](https://make.fun/bounty/gta6-01). Rhea “Wraith” Cole drives for fixer Silas Kane in **Vanta City**, a golden-hour coastal city at sunset — five districts, six story jobs, the whole precinct on her tail. Built from scratch in low-poly Three.js (vendored, offline), with procedural WebAudio and a localStorage save. No third-party names, assets, or network requests.

## Play

```sh
node serve.ts
# open http://localhost:8080
```

WASD drive / walk · **Shift** nitro · **Space** brake · **E** steal a parked car · **F** melee · **G** shoot · **Z / X / C** crew abilities · **1–7** switch weapon · **P** pause / map & stats · **M** mute. Pull over (stop the car) and press **Enter** to take the next job from Silas.

## The city

- **5 districts**, each with a standing value: Downtown Core, Harbor Docks, Old Town Market, Beach Strip, Casino Strip.
- **6 story jobs** ($250–$1,800): First Drop, Heat Wave, The Armored Haul, Midnight Grand Prix, The Escort, and the finale **The Vault** — crack the Meridian vault and escape at 5 stars.
- **Wanted 0–5★** with a police dispatch panel (named units + distance + role), roadblocks with spike strips at 4–5 stars, and a **helicopter with a searchlight cone** hunting you at 4–5 stars. BUSTED and WASTED paths both work.
- **Crew of 3** with abilities: Mira (Swap Plates), Lio (Quick Fix), Kiki (Eyes Out).
- **Side work**: taxi fares ($60–$130), 12 neon chips ($50 each), 3 stunt jumps ($150 each), ranks from Street Rookie to Night Kingpin.
- **HUD**: mission banner with stage + timer + next step, cash, rank + respect, district standing, health/armor, 7 weapon slots, car name + condition, nitro meter, radio station, circular minimap, fixer dialogue.

## Screenshots

Staged deterministically with `?shot=chase|street|stats|title&seed=1`:

1. `1-chase.jpg` — the Vault escape at 5 stars: helicopter + searchlight cone, roadblock, dispatch panel.
2. `2-street.jpg` — on foot in the Old Town market: crowds, stalls, a combat moment.
3. `3-stats.jpg` — map & stats: full city map, district standing, checklist, medals, career stats, save slots.
4. `4-title.jpg` — title over the dusk skyline panorama.

## License

MIT — see [LICENSE](LICENSE).

---

Built for the make.fun bounty — referral `kc98nxwf`.
