// Boot and the one loop: input every frame, the world in fixed 1/60 s steps,
// the renderer paints what is there. Screens: title, play, stats (pause),
// briefing, game over. ?shot=chase|street|stats|title stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady.
import { createRandom, fmtCash } from './random.js';
import { createWorld, EVENT_CASH, EVENT_SHOT, EVENT_MISSION, EVENT_BUSTED, EVENT_WASTED, EVENT_NITRO } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer } from './render.js';
import { stageShot } from './shots.js';
import { createAudio } from './audio.js';
import { MISSIONS, DISTRICTS, rankFor } from './config.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas, world);
const audio = createAudio();
const input = createInput(canvas);

const $ = (id) => document.getElementById(id);
function show(id, on) { const n = $(id); if (n) n.classList.toggle('hidden', !on); }
function announce(msg) { status.textContent = msg; }

function saveSlotsHTML() {
  const s = world.state;
  const done = s.missionDone.filter(Boolean).length;
  const pct = Math.round((done / 6) * 100);
  const slots = [
    { name: 'SAVE 1 — RHEA COLE', act: 'JOB ' + (done + 1) + '/6', pct, cash: s.cash },
    { name: 'SAVE 2', act: 'EMPTY', pct: 0, cash: 0 },
    { name: 'SAVE 3', act: 'EMPTY', pct: 0, cash: 0 },
  ];
  return slots.map((sl) => '<div class="save-slot"><b>' + sl.name + '</b><br>' + sl.act + ' · ' + sl.pct + '% · ' + fmtCash(sl.cash) + '</div>').join('');
}

function renderStats() {
  const s = world.state;
  const done = s.missionDone.filter(Boolean).length;
  const chips = s.chips.filter(Boolean).length;
  const pct = Math.round(((done / 6) * 0.55 + (chips / 12) * 0.2 + (s.jumpsDone.filter(Boolean).length / 3) * 0.1 + (s.stats.fares > 0 ? 0.15 : 0)) * 100);
  const donut = $('stats-donut');
  if (donut) donut.style.setProperty('--pct', pct + '%');
  const pctEl = $('stats-pct');
  if (pctEl) pctEl.textContent = pct + '%';
  const cl = $('stats-checklist');
  if (cl) {
    cl.innerHTML =
      'Story jobs <b>' + done + '/6</b> · Races <b>' + s.stats.races + '/4</b><br>' +
      'Stunt jumps <b>' + s.jumpsDone.filter(Boolean).length + '/3</b> · Neon chips <b>' + chips + '/12</b><br>' +
      'Export list <b>' + s.stats.exports + '/5</b> · Taxi fares <b>' + s.stats.fares + '</b><br>' +
      'Districts FRIENDLY <b>' + DISTRICTS.filter((d) => d.mood === 'FRIENDLY').length + '/5</b> · Crew <b>3/3</b><br>' +
      'Gold ratings <b>' + s.missionRating.filter((r) => r === 'GOLD').length + '/6</b>';
  }
  const medals = $('stats-medals');
  if (medals) {
    const sym = { GOLD: '🥇', SILVER: '🥈', BRONZE: '🥉', '': '—' };
    medals.textContent = 'MISSION MEDALS · ' + s.missionRating.map((r) => sym[r] || '—').join(' ');
  }
  const career = $('stats-career');
  if (career) {
    career.innerHTML =
      'Cars stolen <b>' + s.stats.carsStolen + '</b><br>' +
      'Cops escaped <b>' + s.stats.copsEscaped + '</b><br>' +
      'Km driven <b>' + s.stats.kmDriven.toFixed(1) + '</b><br>' +
      'People taken out <b>' + s.stats.takenOut + '</b><br>' +
      'Longest jump <b>' + s.stats.longestJump + ' m</b><br>' +
      'Crew abilities <b>' + s.stats.crewAbilities + '</b><br>' +
      'Hidden by locals <b>' + s.stats.hiddenByLocals + '</b><br>' +
      'Cash <b>' + fmtCash(s.cash) + '</b> · Rank <b>' + rankFor(s.respect).cur.name + '</b>';
  }
  const dist = $('stats-districts');
  if (dist) {
    dist.innerHTML = DISTRICTS.map((d) => '<div class="dist-row"><b>' + d.name + '</b><span>' + d.mood + ' · ' + d.standing + '</span></div>').join('');
  }
  const sv = $('stats-saves');
  if (sv) sv.innerHTML = '<div class="saves" style="justify-content:flex-start;margin-top:0">' + saveSlotsHTML() + '</div>';
  drawStatsMap();
}

function drawStatsMap() {
  const c = $('stats-map');
  if (!c) return;
  const g = c.getContext('2d');
  const W = c.width, H = c.height;
  const s = world.state;
  const toX = (x) => W / 2 + (x / 820) * W;
  const toY = (z) => H / 2 + (z / 820) * H;
  g.fillStyle = '#140f22'; g.fillRect(0, 0, W, H);
  // Ocean south.
  g.fillStyle = '#2e7f9e'; g.fillRect(0, toY(360), W, H - toY(360));
  g.fillStyle = '#f2c078'; g.fillRect(0, toY(320), W, toY(360) - toY(320));
  // Roads.
  g.strokeStyle = 'rgba(255,233,201,0.3)'; g.lineWidth = 2;
  for (let v = -380; v <= 380; v += 80) {
    g.beginPath(); g.moveTo(toX(v), 0); g.lineTo(toX(v), H); g.stroke();
    g.beginPath(); g.moveTo(0, toY(v)); g.lineTo(W, toY(v)); g.stroke();
  }
  // Districts.
  for (const d of DISTRICTS) {
    g.fillStyle = 'rgba(255,154,92,0.3)';
    g.beginPath(); g.arc(toX(d.cx), toY(d.cz), 34, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ffd166'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#ffe9c9'; g.font = 'bold 11px system-ui, sans-serif'; g.textAlign = 'center';
    g.fillText(d.name, toX(d.cx), toY(d.cz) - 2);
    g.font = '10px system-ui, sans-serif'; g.fillStyle = '#c9a98a';
    g.fillText(d.mood + ' · ' + d.standing, toX(d.cx), toY(d.cz) + 12);
  }
  // Chips + beacon + player.
  g.fillStyle = '#4dd8c8';
  for (let i = 0; i < 12; i++) {
    if (s.chips[i]) continue;
    const [x, z] = [[-240, -240], [-160, 200], [240, 200], [280, -200], [0, -320], [-320, 0], [120, 120], [-80, 280], [320, 80], [-280, -120], [200, -280], [40, 200]][i];
    g.fillRect(toX(x) - 2, toY(z) - 2, 4, 4);
  }
  if (s.beacon) {
    g.fillStyle = '#ffd166';
    g.beginPath(); g.arc(toX(s.beacon.x), toY(s.beacon.z), 7, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(toX(s.player.x), toY(s.player.z), 5, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffe9c9'; g.font = 'bold 12px system-ui, sans-serif';
  g.fillText('N ↑', 16, 18);
}

function showDialogue(who, line, ms) {
  const d = $('dialogue');
  if (!d) return;
  $('dlg-who').textContent = who;
  $('dlg-line').textContent = line;
  d.classList.remove('hidden');
  clearTimeout(showDialogue._t);
  showDialogue._t = setTimeout(() => d.classList.add('hidden'), ms || 6000);
}

function nextMissionIndex() {
  return world.state.missionDone.findIndex((d) => !d);
}

function openBriefing(i) {
  const def = MISSIONS[i];
  if (!def) return;
  $('brf-kicker').textContent = 'JOB ' + def.n + '/6 · ' + def.fixer.toUpperCase();
  $('brf-title').textContent = def.title;
  $('brf-text').textContent = def.brief + ' Stages: ' + def.stages.map((st) => st.label).join(' → ') + '.';
  $('brf-pay').textContent = 'REWARD ' + fmtCash(def.pay);
  $('btn-start-job').textContent = 'START JOB';
  $('btn-start-job').onclick = () => {
    show('briefing', false);
    world.startMission(i);
    showDialogue('SILAS KANE · FIXER', def.brief, 6000);
    setScreen('play');
    announce('Job ' + def.n + ': ' + def.title);
  };
  show('briefing', true);
}

function setScreen(name) {
  screen = name; // the loop reads this same variable: menus must move the game, not just the DOM
  show('title', name === 'title');
  show('hud', name === 'play'); // stats screen is a full overlay: no HUD behind it
  show('stats-screen', name === 'paused');
  show('gameover', name === 'over');
  if (name === 'title') {
    renderer.setView('orbit');
    $('title-saves').innerHTML = saveSlotsHTML();
    $('continue-job').textContent = String((nextMissionIndex() === -1 ? 5 : nextMissionIndex()) + 1);
  }
  if (name === 'paused') { renderStats(); renderer.setView('orbit'); }
  if (name === 'play') renderer.setView(world.state.player.onFoot ? 'street' : 'chase');
}

let screen = 'title';

window.__vanta = {
  world, version: 'v6-golden-hour',
  get state() { return world.state; },
  get screen() { return screen; },
  startMission: (i) => world.startMission(i),
  setScreen,
};

function runShot(name) {
  const staged = stageShot(name, world);
  renderer.setView(staged.view);
  if (staged.screen === 'title') setScreen('title');
  else if (staged.screen === 'stats') { setScreen('paused'); renderStats(); }
  else {
    setScreen('play');
    if (world.state.dialogue) showDialogue(world.state.dialogue.who, world.state.dialogue.line, 60000);
  }
  let painted = 0;
  renderer.snapNext();
  function paint() {
    renderer.draw(world.state, staged.screen === 'stats' ? 'paused' : staged.screen);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();
  let m6Done = false;

  setScreen('title');
  announce('Vanta City: Night Runner. Press Enter or click to start.');

  $('btn-continue').onclick = () => {
    audio.unlock();
    const i = nextMissionIndex();
    if (i === -1) { setScreen('play'); screen = 'play'; }
    else openBriefing(i);
  };
  $('btn-new').onclick = () => {
    audio.unlock();
    try { window.localStorage.removeItem('vanta-city-save-v1'); } catch { /* noop */ }
    world.reset();
    openBriefing(0);
  };
  $('btn-stats-title').onclick = () => { renderStats(); setScreen('paused'); screen = 'paused'; };
  $('btn-how').onclick = () => {
    $('brf-kicker').textContent = 'HOW TO PLAY';
    $('brf-title').textContent = 'GOLDEN HOUR, FIVE DISTRICTS';
    $('brf-text').textContent = 'WASD drive or walk · SHIFT nitro · SPACE brake · E steal a parked car · F melee · G shoot · Z/X/C crew abilities · 1–7 switch weapon · P pause / map · M mute. Take jobs from Silas, run taxi fares, grab the 12 neon chips, hit the 3 stunt jumps. At 4–5 stars the helicopter hunts you and roadblocks with spike strips appear — dodge them or lose your tires.';
    $('brf-pay').textContent = 'SIX JOBS · $250 – $1,800';
    $('btn-start-job').textContent = 'GOT IT';
    $('btn-start-job').onclick = () => show('briefing', false);
    show('briefing', true);
  };
  $('btn-later').onclick = () => show('briefing', false);
  $('tab-resume').onclick = () => { setScreen('play'); screen = 'play'; };
  $('tab-stats').onclick = () => renderStats();
  $('tab-title2').onclick = () => { setScreen('title'); screen = 'title'; };
  $('btn-retry').onclick = () => {
    const s = world.state;
    s.over = null; s.health = 100; s.wanted = 0; s.police = []; s.heli = null; s.roadblock = null;
    s.player.x = 0; s.player.z = 80; s.player.heading = Math.PI / 2; s.player.speed = 0; s.player.onFoot = true; s.player.car = null;
    setScreen('play'); screen = 'play';
  };
  $('btn-over-title').onclick = () => { setScreen('title'); screen = 'title'; };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') audio.toggleMute();
    if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' || e.code === 'Digit4' || e.code === 'Digit5' || e.code === 'Digit6' || e.code === 'Digit7') {
      world.state.weapon = Number(e.code.slice(-1));
    }
  });
  canvas.addEventListener('pointerdown', () => audio.unlock());

  function handleActions(actions) {
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      if (screen === 'title') { $('btn-continue').click(); return; }
      if (screen === 'over') { $('btn-retry').click(); return; }
      if (screen === 'play' && !world.state.mission && world.state.player.speed < 1) {
        const i = nextMissionIndex();
        if (i !== -1) openBriefing(i);
      }
    }
    if (actions & ACTION_PAUSE) {
      if (screen === 'play') { setScreen('paused'); screen = 'paused'; announce('Paused. Map and stats.'); }
      else if (screen === 'paused') { setScreen('play'); screen = 'play'; announce('Playing.'); }
    }
  }

  function step(actions) {
    const events = world.step(1 / 60, input.held, actions);
    if (events & EVENT_CASH) audio.cash();
    if (events & EVENT_SHOT) audio.shot();
    if (events & EVENT_NITRO) audio.nitro();
    if (events & EVENT_MISSION) audio.cash();
    audio.setEngine(world.state.player.onFoot ? 0 : Math.abs(world.state.player.speed) / 34, world.state.player.nitroOn);
    audio.setSiren(world.state.wanted > 0);
    if (!m6Done && world.state.missionDone[5]) {
      m6Done = true;
      world.state.over = 'complete';
    }
    if (world.state.over) {
      const o = world.state.over;
      if (o === 'busted') {
        audio.busted();
        world.state.cash = Math.floor(world.state.cash * 0.85);
        $('over-title').textContent = 'BUSTED';
        $('over-title').className = 'big-end red';
        $('over-text').textContent = 'The VCPD took you in. Bail cost 15% of your cash — Silas is not happy.';
      } else if (o === 'wasted') {
        audio.wasted();
        world.state.cash = Math.floor(world.state.cash * 0.9);
        $('over-title').textContent = 'WASTED';
        $('over-title').className = 'big-end red';
        $('over-text').textContent = 'Rhea is down. The city keeps moving without her.';
      } else {
        audio.cash();
        $('over-title').textContent = 'NIGHT KINGPIN';
        $('over-title').className = 'big-end gold';
        $('over-text').textContent = 'The Vault is empty, the city is yours. Rhea Cole runs Vanta City now.';
      }
      world.save();
      setScreen('over');
      screen = 'over';
      announce($('over-title').textContent);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === 'play') {
      // One-shot presses (E, F, G, crew) act on the FIRST step of the frame
      // only: on a slow frame the loop catches up with several steps, and a
      // press must not enter-then-exit a car in the same frame.
      let first = true;
      while (accumulator >= 1 / 60) {
        step(first ? actions : 0);
        first = false;
        accumulator -= 1 / 60;
        if (screen !== 'play') break;
      }
    } else if (screen === 'title' || screen === 'paused') {
      // Ambient world behind the menus: traffic cruises, peds walk.
      while (accumulator >= 1 / 60) {
        world.step(1 / 60, { up: false, down: false, left: false, right: false, nitro: false, brake: false }, 0);
        accumulator -= 1 / 60;
      }
    } else accumulator = 0;
    renderer.draw(world.state, screen);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') { setScreen('paused'); screen = 'paused'; }
  });

  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
