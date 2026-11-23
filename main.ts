// Vanta City: Night Runner — entrypoint for the make.fun gta6-01 bounty.
//
// What this file does, in plain terms: it takes the finished game in ./game
// and the four staged screenshots in ./screenshots (both sitting beside this
// file), copies them into the output directory the grader reads, and writes
// ./dossier.json there — the summary the judge reads — using the vendored
// make.fun library in ./vendor/makefun-game.ts.
//
// It uses nothing but the Node 22 standard library, so it runs the same way
// on any machine with Node 22: no installs, no network, no native modules.
// Run it with `node main.ts` (output goes to /output) or point it somewhere
// else while testing locally:
//
//   MAKEFUN_OUTPUT_DIR=/tmp/my-out node main.ts
//
// To check the entry by hand, serve the game with `node serve.ts` and open
// http://localhost:8080 — the same files this script copies are what the
// browser loads.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// --- locate the repo and the destination ------------------------------------
// `here` is the directory holding this file; the game and screenshots live
// next to it. The grader sets MAKEFUN_OUTPUT_DIR, and outside the grader's
// container that variable stands in for /output.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// --- copy the game and the screenshots --------------------------------------
const gameSource = join(repoRoot, 'game');
const gameTarget = join(outputDir, 'game');
const shotsSource = join(repoRoot, 'screenshots');
const shotsTarget = join(outputDir, 'screenshots');

mkdirSync(outputDir, { recursive: true });
cpSync(gameSource, gameTarget, { recursive: true });
mkdirSync(shotsTarget, { recursive: true });
if (existsSync(shotsSource)) {
  cpSync(shotsSource, shotsTarget, { recursive: true });
}

// --- write the dossier -------------------------------------------------------
// These are the scorer's own caps (see the competition's gate rules): the
// dossier text is capped at 160 KiB; at most 4 screenshots, each at most
// 256 KiB; the game is at most 993 files and 48 MiB in total, and no path
// inside game/ may be longer than 1000 bytes. buildDossier refuses an entry
// that breaks any of them, so a bad entry fails here instead of at the judge.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});

writeFileSync(join(outputDir, 'dossier.json'), dossier);
