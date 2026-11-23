// Vanta City simulation: no drawing, no DOM, no browser globals except
// localStorage for the save. One fixed step advances the player (on foot or by
// car), traffic, pedestrians, police, the helicopter, roadblocks, missions,
// taxi fares, neon chips and stunt jumps, and returns what happened as flags.
import {
  CITY_HALF, ROAD_STEP, ROAD_HALF, DISTRICTS, MISSIONS, CREW, CHIP_SPOTS,
  JUMP_SPOTS, CARS, UNIT_NAMES, SAVE_KEY, districtAt,
} from './config.js';
import { createRandom, clamp, dist2, angleLerp } from './random.js';

export const EVENT_NONE = 0;
export const EVENT_CASH = 1;
export const EVENT_SHOT = 2;
export const EVENT_HIT = 4;
export const EVENT_BUSTED = 8;
export const EVENT_WASTED = 16;
export const EVENT_MISSION = 32;
export const EVENT_CHIP = 64;
export const EVENT_JUMP = 128;
export const EVENT_NITRO = 256;
export const EVENT_COMPLETE = 512;

const PLAYER_R = 2.2;
const CAR_R = 3.4;
const TOP_SPEED = 34;
const NITRO_MULT = 1.55;

// ---- city layout ----------------------------------------------------------
// Buildings sit inside road blocks; each block holds 1-4 boxes. The layout is
// generated once from the seed and shared with the renderer.
export function buildLayout(seed) {
  const rng = createRandom(seed ^ 0x9e3779b9);
  const buildings = [];
  const palms = [];
  const stalls = [];
  const lamps = [];
  const containers = [];
  const signs = [];
  for (let gx = -CITY_HALF + ROAD_STEP; gx < CITY_HALF; gx += ROAD_STEP) {
    for (let gz = -CITY_HALF + ROAD_STEP; gz < CITY_HALF; gz += ROAD_STEP) {
      const cx = gx + ROAD_STEP / 2;
      const cz = gz + ROAD_STEP / 2;
      const d = districtAt(cx, cz);
      if (d.id === 'beach' && cz > 300) continue; // sand, no buildings
      const n = rng.int(1, 3);
      for (let i = 0; i < n; i++) {
        const w = rng.range(18, 34);
        const dep = rng.range(18, 34);
        // Keep the whole box inside its block (blocks are 58 wide: 80 pitch
        // minus the 22-wide roads), so no building ever juts into a road.
        const maxOX = Math.max(0, 26 - w / 2);
        const maxOZ = Math.max(0, 26 - dep / 2);
        const x = cx + rng.range(-maxOX, maxOX);
        const z = cz + rng.range(-maxOZ, maxOZ);
        const tall = d.tall ? rng.range(28, 78) : rng.range(8, 22);
        buildings.push({ x, z, w, d: dep, h: tall, district: d.id, hue: rng.next() });
      }
      if (d.id === 'beach') {
        for (let i = 0; i < 3; i++) palms.push({ x: cx + rng.range(-30, 30), z: cz + rng.range(-30, 30) });
      } else if (d.id === 'oldtown') {
        if (rng.chance(0.6)) stalls.push({ x: cx + rng.range(-20, 20), z: cz + rng.range(-20, 20), hue: rng.next() });
      } else if (rng.chance(0.5)) {
        palms.push({ x: cx + rng.range(-28, 28), z: cz + rng.range(-28, 28) });
      }
      lamps.push({ x: cx - 34, z: cz - 34 });
    }
  }
  // Harbor: container stacks + cranes along the east edge.
  for (let i = 0; i < 14; i++) {
    containers.push({ x: 300 + rng.range(-30, 40), z: -180 + i * 26, hue: rng.next(), stack: rng.int(1, 3) });
  }
  // Big signs: casino strip + harbor + beach.
  signs.push({ x: -40, z: -300, text: 'CASINO', sub: 'MERIDIAN', color: '#ff2e88', big: true, ry: 0 });
  signs.push({ x: 120, z: -300, text: 'HOTEL', sub: 'LAGUNA RASI', color: '#ffb03a', big: true, ry: 0 });
  signs.push({ x: -200, z: -300, text: 'SLOTS', sub: 'PALACE', color: '#4dd8c8', big: true, ry: 0 });
  signs.push({ x: 0, z: 330, text: 'BEACH', sub: 'VANTA BAY', color: '#ff7a1a', big: true, ry: Math.PI });
  signs.push({ x: 300, z: -160, text: 'DOCKS', sub: 'FREIGHT 7', color: '#7fd4ff', big: false, ry: -Math.PI / 2 });
  signs.push({ x: -280, z: 120, text: 'MARKET', sub: 'OLD TOWN', color: '#ffd166', big: false, ry: Math.PI / 2 });
  return { buildings, palms, stalls, lamps, containers, signs };
}

function collideCircle(buildings, x, z, r) {
  // Push a circle out of building AABBs; returns corrected [x, z].
  for (const b of buildings) {
    const bx = clamp(x, b.x - b.w / 2, b.x + b.w / 2);
    const bz = clamp(z, b.z - b.d / 2, b.z + b.d / 2);
    const dx = x - bx, dz = z - bz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 < 0.0001) { x += r; continue; }
      const d = Math.sqrt(d2);
      x = bx + (dx / d) * r;
      z = bz + (dz / d) * r;
    }
  }
  return [x, z];
}

export function createWorld(seed) {
  const rng = createRandom(seed);
  const layout = buildLayout(seed);
  const state = freshState();

  function freshState() {
    return {
      time: 0,
      cash: 500,
      respect: 0,
      wanted: 0,
      wantedTimer: 0,
      health: 100,
      armor: 60,
      player: {
        x: 0, z: 80, heading: Math.PI / 2, speed: 0, onFoot: true,
        car: null, nitro: 100, nitroOn: false, airborne: 0, airDist: 0,
        tireDamage: 0, smoke: 0, invuln: 0,
      },
      mission: null, // {def, stage, timer, hold, startedAt, elapsed}
      missionDone: [false, false, false, false, false, false],
      missionRating: ['', '', '', '', '', ''],
      chips: new Array(12).fill(false),
      jumpsDone: [false, false, false],
      taxi: null, // {phase, x, z, destX, destZ, pay, timer}
      taxiTimer: 6,
      traffic: [],
      peds: [],
      police: [],
      heli: null,
      roadblock: null,
      roadblockTimer: 20,
      beacon: null,
      enemy: null,
      messages: [],
      stats: {
        carsStolen: 0, copsEscaped: 0, kmDriven: 0, takenOut: 0,
        longestJump: 0, crewAbilities: 0, hiddenByLocals: 0,
        fares: 0, races: 0, exports: 0,
      },
      over: null,
      crewCd: [0, 0, 0],
      weapon: 3,
      ammo: [Infinity, Infinity, 84, 208, 0, 0, 0],
      radio: 0,
      shot: 0,
    };
  }

  function reset() {
    const keep = state;
    Object.assign(state, freshState());
    spawnTraffic();
    spawnPeds();
    loadSaveInto(state);
  }

  function loadSaveInto(s) {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const sv = JSON.parse(raw);
      if (typeof sv.cash === 'number') s.cash = sv.cash;
      if (typeof sv.respect === 'number') s.respect = sv.respect;
      if (Array.isArray(sv.missionDone)) s.missionDone = sv.missionDone.slice(0, 6);
      if (Array.isArray(sv.missionRating)) s.missionRating = sv.missionRating.slice(0, 6);
      if (Array.isArray(sv.chips)) s.chips = sv.chips.slice(0, 12);
      if (sv.stats) Object.assign(s.stats, sv.stats);
    } catch { /* corrupt save: start fresh */ }
  }

  function save() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: state.cash, respect: state.respect,
        missionDone: state.missionDone, missionRating: state.missionRating,
        chips: state.chips, stats: state.stats,
      }));
    } catch { /* storage off: session only */ }
  }

  function spawnTraffic() {
    state.traffic = [];
    for (let i = 0; i < 16; i++) {
      const alongX = rng.chance(0.5);
      const lane = (Math.floor(rng.range(-4, 5)) * ROAD_STEP);
      const off = rng.chance(0.5) ? -5.5 : 5.5;
      const car = CARS[i % CARS.length];
      state.traffic.push({
        x: alongX ? rng.range(-360, 360) : lane + off,
        z: alongX ? lane + off : rng.range(-360, 360),
        heading: alongX ? (off < 0 ? Math.PI / 2 : -Math.PI / 2) : (off < 0 ? 0 : Math.PI),
        speed: rng.range(9, 15), color: car.color, name: car.name,
        parked: false, stolen: false,
      });
    }
    // Parked, stealable cars on the road by the spawn (0, 80).
    const spots = [[8, 74, 0xff7a1a, 'Calyx Sprint GT'], [-8, 86, 0x2ec4b6, 'Vireo GT'], [8, 94, 0xe63946, 'Marlin Coupe']];
    for (const [x, z, color, name] of spots) {
      state.traffic.push({ x, z, heading: Math.PI / 2, speed: 0, color, name, parked: true, stolen: false });
    }
  }

  function spawnPeds() {
    state.peds = [];
    const shirts = [0xff5c8a, 0x4dd8c8, 0xffd166, 0x7fd4ff, 0xff9a5c, 0xb8f26d, 0xe6e6fa, 0xff7a1a];
    for (let i = 0; i < 30; i++) {
      const x = rng.range(-340, 340);
      const z = rng.range(-340, 340);
      state.peds.push({
        x, z, heading: rng.range(0, Math.PI * 2), speed: rng.range(1.2, 2.6),
        color: shirts[i % shirts.length], flee: 0, down: false,
        tx: x + rng.range(-60, 60), tz: z + rng.range(-60, 60),
      });
    }
  }

  function say(text, ms) {
    state.messages.push({ text, until: state.time + (ms || 3) });
    if (state.messages.length > 4) state.messages.shift();
  }

  function setWanted(n, silent) {
    const prev = state.wanted;
    state.wanted = clamp(n, 0, 5);
    state.wantedTimer = 0;
    if (state.wanted > prev && !silent) say('WANTED LEVEL ' + state.wanted + ' — VCPD responding', 3);
    if (state.wanted === 0 && prev > 0) {
      state.stats.copsEscaped += 1;
      say('You lost them. Heat is off.', 3);
    }
  }

  function spawnPolice() {
    const want = state.wanted;
    while (state.police.length < want + 1 && state.police.length < 7) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(40, 70);
      const name = UNIT_NAMES[state.police.length % UNIT_NAMES.length] + '-' + rng.int(2, 48);
      state.police.push({
        x: clamp(state.player.x + Math.cos(a) * d, -360, 360),
        z: clamp(state.player.z + Math.sin(a) * d, -360, 360),
        heading: 0, speed: 0, name, role: 'RAMMING',
        dist: d, bustedTimer: 0,
      });
    }
    while (state.police.length > want + 1) state.police.pop();
  }

  function dispatchUnits() {
    // Named units + distance + role for the HUD dispatch panel.
    const units = state.police.map((p) => ({
      name: p.name,
      dist: Math.round(Math.sqrt(dist2(p.x, p.z, state.player.x, state.player.z))),
      role: p.role,
    }));
    if (state.wanted >= 4 && state.heli) {
      units.unshift({ name: 'AIR ONE', dist: Math.round(state.heli.h), role: 'SPOTLIGHT' });
    }
    if (state.roadblock) {
      units.push({ name: 'BULWARK 2', dist: Math.round(Math.sqrt(dist2(state.roadblock.x, state.roadblock.z, state.player.x, state.player.z))), role: 'ROADBLOCK' });
    }
    return units.slice(0, 6);
  }

  // ---- missions -----------------------------------------------------------
  function startMission(i) {
    const def = MISSIONS[i];
    state.mission = { def, stage: 0, timer: 0, hold: 0, elapsed: 0 };
    state.beacon = stageTarget(def.stages[0]);
    if (def.stages[0].wanted) setWanted(def.stages[0].wanted, true);
    say('JOB ' + def.n + '/6 — ' + def.title + ' · ' + fmtPay(def.pay), 4);
    return state.mission;
  }
  function fmtPay(n) { return '$' + n.toLocaleString('en-US'); }
  function stageTarget(st) {
    if (st.type === 'goto' || st.type === 'hold') return { x: st.x, z: st.z, r: st.r };
    return null;
  }
  function missionStageLabel() {
    if (!state.mission) return '';
    return state.mission.def.stages[state.mission.stage].label;
  }
  function advanceStage() {
    const m = state.mission;
    m.stage += 1;
    m.timer = 0; m.hold = 0;
    if (m.stage >= m.def.stages.length) { completeMission(); return; }
    const st = m.def.stages[m.stage];
    state.beacon = stageTarget(st);
    if (st.wanted) setWanted(st.wanted, true);
    say('STAGE ' + (m.stage + 1) + '/' + m.def.stages.length + ' — ' + st.label, 3);
  }
  function completeMission() {
    const m = state.mission;
    const gold = m.elapsed < 120;
    const rating = gold ? 'GOLD' : (m.elapsed < 240 ? 'SILVER' : 'BRONZE');
    state.cash += m.def.pay;
    state.respect += Math.round(m.def.pay / 8);
    state.missionDone[m.def.n - 1] = true;
    state.missionRating[m.def.n - 1] = rating;
    state.mission = null;
    state.beacon = null;
    setWanted(0, true);
    say('JOB COMPLETE — ' + m.def.title + ' · +' + fmtPay(m.def.pay) + ' · ' + rating, 5);
    save();
    return EVENT_MISSION | EVENT_CASH;
  }

  function stepMission(dt) {
    const m = state.mission;
    if (!m) return 0;
    m.elapsed += dt;
    const st = m.def.stages[m.stage];
    const p = state.player;
    if (st.type === 'goto') {
      if (dist2(p.x, p.z, st.x, st.z) < st.r * st.r) advanceStage();
    } else if (st.type === 'survive') {
      m.timer += dt;
      if (state.wanted < (st.wanted || 3)) setWanted(st.wanted || 3, true);
      if (m.timer >= st.seconds) advanceStage();
    } else if (st.type === 'hold') {
      if (dist2(p.x, p.z, st.x, st.z) < st.r * st.r) {
        m.hold += dt;
        if (m.hold >= st.seconds) advanceStage();
      } else m.hold = Math.max(0, m.hold - dt);
    }
    return 0;
  }

  // ---- combat / crew ------------------------------------------------------
  function melee() {
    const p = state.player;
    let hit = false;
    for (const ped of state.peds) {
      if (!ped.down && dist2(p.x, p.z, ped.x, ped.z) < 16) {
        ped.down = true; hit = true;
        state.stats.takenOut += 1;
        state.enemy = { x: ped.x, z: ped.z, until: state.time + 6 };
      }
    }
    if (hit) { setWanted(state.wanted + 1); say('Target down.', 2); }
    return hit ? EVENT_HIT : EVENT_NONE;
  }

  function shoot() {
    if (state.ammo[state.weapon - 1] <= 0 && state.weapon > 2) { say('Out of ammo — switch weapon.', 2); return EVENT_NONE; }
    if (state.weapon > 2) state.ammo[state.weapon - 1] -= 1;
    const p = state.player;
    // Hit the nearest ped or police car in front within 60 units.
    let best = null; let bd = 60 * 60;
    for (const ped of state.peds) {
      if (ped.down) continue;
      const d = dist2(p.x, p.z, ped.x, ped.z);
      if (d < bd) { bd = d; best = ped; }
    }
    if (best) {
      best.down = true;
      state.stats.takenOut += 1;
      state.enemy = { x: best.x, z: best.z, until: state.time + 6 };
      setWanted(state.wanted + 1);
    }
    return EVENT_SHOT;
  }

  function useCrew(i) {
    if (state.crewCd[i] > 0) { say(CREW[i].name + ' is not ready yet.', 2); return EVENT_NONE; }
    state.crewCd[i] = CREW[i].cd;
    state.stats.crewAbilities += 1;
    if (i === 0) { setWanted(state.wanted - 1); say('Mira swapped the plates — heat drops.', 3); }
    if (i === 1) {
      if (state.player.car) state.player.car.condition = 100;
      state.player.tireDamage = 0;
      say('Lio patched the car — 100% condition.', 3);
    }
    if (i === 2) { say('Kiki: police marked on your map.', 3); }
    return EVENT_NONE;
  }

  // ---- side work ----------------------------------------------------------
  function stepTaxi(dt) {
    const p = state.player;
    if (!state.taxi) {
      state.taxiTimer -= dt;
      if (state.taxiTimer <= 0) {
        const x = Math.round(rng.range(-300, 300) / 80) * 80;
        const z = Math.round(rng.range(-300, 300) / 80) * 80;
        state.taxi = {
          phase: 'wait', x, z,
          destX: Math.round(rng.range(-300, 300) / 80) * 80,
          destZ: Math.round(rng.range(-300, 300) / 80) * 80,
          pay: rng.int(60, 130), timer: 0,
        };
        say('TAXI FARE — passenger waiting (' + fmtPay(state.taxi.pay) + ').', 4);
      }
      return 0;
    }
    const t = state.taxi;
    if (t.phase === 'wait') {
      if (!p.onFoot && dist2(p.x, p.z, t.x, t.z) < 100) {
        t.phase = 'ride';
        say('Passenger in — take them to the marker.', 3);
      }
    } else if (t.phase === 'ride') {
      t.timer += dt;
      if (!p.onFoot && dist2(p.x, p.z, t.destX, t.destZ) < 144) {
        state.cash += t.pay;
        state.respect += 8;
        state.stats.fares += 1;
        say('FARE COMPLETE — +' + fmtPay(t.pay), 3);
        state.taxi = null;
        state.taxiTimer = 14;
        save();
        return EVENT_CASH;
      }
      if (t.timer > 90) { state.taxi = null; state.taxiTimer = 10; say('Fare cancelled — too slow.', 2); }
    }
    return 0;
  }

  function stepPickups() {
    const p = state.player;
    let ev = 0;
    for (let i = 0; i < CHIP_SPOTS.length; i++) {
      if (state.chips[i]) continue;
      const [x, z] = CHIP_SPOTS[i];
      if (dist2(p.x, p.z, x, z) < 25) {
        state.chips[i] = true;
        state.cash += 50;
        state.respect += 5;
        say('NEON CHIP ' + (state.chips.filter(Boolean).length) + '/12 — +$50', 3);
        ev |= EVENT_CHIP | EVENT_CASH;
        save();
      }
    }
    return ev;
  }

  function stepJumps(dt) {
    const p = state.player;
    if (p.onFoot) return 0;
    if (p.airborne > 0) {
      p.airborne -= dt;
      p.airDist += p.speed * dt;
      if (p.airborne <= 0) {
        if (p.airDist > 12) {
          state.stats.longestJump = Math.max(state.stats.longestJump, Math.round(p.airDist));
          say('STUNT JUMP — ' + Math.round(p.airDist) + ' m · +$150', 3);
          state.cash += 150;
          state.respect += 10;
          save();
          return EVENT_JUMP | EVENT_CASH;
        }
      }
      return 0;
    }
    for (let i = 0; i < JUMP_SPOTS.length; i++) {
      if (state.jumpsDone[i]) continue;
      const j = JUMP_SPOTS[i];
      if (dist2(p.x, p.z, j.x, j.z) < 400 && p.speed > 18) {
        state.jumpsDone[i] = true;
        p.airborne = 1.1;
        p.airDist = 0;
        say(j.label + ' — AIRBORNE!', 2);
        return EVENT_JUMP;
      }
    }
    return 0;
  }

  // ---- police, heli, roadblocks -------------------------------------------
  function stepPolice(dt) {
    const p = state.player;
    spawnPolice();
    const want = state.wanted;
    if (want >= 4 && !state.heli) {
      state.heli = { x: p.x + 30, z: p.z - 40, h: 42, rotor: 0 };
      say('AIR ONE overhead — spotlight on you.', 3);
    }
    if (want < 4) state.heli = null;
    if (state.heli) {
      const h = state.heli;
      h.rotor += dt * 22;
      h.x += (p.x + 26 - h.x) * dt * 1.4;
      h.z += (p.z - 34 - h.z) * dt * 1.4;
    }
    if (want >= 4) {
      state.roadblockTimer -= dt;
      if (!state.roadblock && state.roadblockTimer <= 0) {
        const ahead = 70;
        const dx = Math.sin(p.heading), dz = Math.cos(p.heading);
        state.roadblock = {
          x: p.x + dx * ahead, z: p.z + dz * ahead,
          heading: p.heading, spikes: true, until: state.time + 25,
        };
        say('ROADBLOCK AHEAD — spike strip!', 3);
        state.roadblockTimer = 26;
      }
    }
    if (state.roadblock && (state.time > state.roadblock.until || want < 4)) state.roadblock = null;

    for (const c of state.police) {
      const dx = p.x - c.x, dz = p.z - c.z;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      c.dist = d;
      const target = Math.atan2(dx, dz);
      c.heading = angleLerp(c.heading, target, dt * 1.6);
      const slow = p.onFoot ? p.speed < 2 : p.speed < 3;
      if (d < 8 && slow) {
        // Arrest: the unit holds on you instead of bouncing off — 2.5 s and
        // you are BUSTED. (Ramming while you are moving still bounces.)
        c.bustedTimer += dt;
        c.role = 'RAMMING';
        if (c.bustedTimer > 2.5) { state.over = 'busted'; return EVENT_BUSTED; }
        continue;
      }
      c.bustedTimer = Math.max(0, c.bustedTimer - dt);
      const spd = Math.min(30, 12 + want * 3.4);
      c.speed = spd;
      c.x += Math.sin(c.heading) * spd * dt;
      c.z += Math.cos(c.heading) * spd * dt;
      c.role = d < 12 ? 'RAMMING' : d < 45 ? 'FLANKING' : d < 90 ? 'CLOSING IN' : 'SPOTLIGHT';
      if (d < 7 && p.invuln <= 0) {
        // Ram: damage the player, bounce the cop back.
        p.invuln = 0.8;
        if (p.onFoot) { state.health -= 12; }
        else if (p.car) { p.car.condition -= 6; state.health -= 4; }
        c.x -= Math.sin(c.heading) * 6;
        c.z -= Math.cos(c.heading) * 6;
      }
    }
    // Spike strip: drive over it and the tires go.
    if (state.roadblock && !p.onFoot) {
      const rb = state.roadblock;
      if (dist2(p.x, p.z, rb.x, rb.z) < 49 && p.tireDamage === 0) {
        p.tireDamage = 1;
        p.smoke = 1;
        say('SPIKE STRIP — tires shredded!', 3);
      }
    }
    return 0;
  }

  function stepWanted(dt) {
    if (state.wanted === 0) return;
    // Heat cools when no police can see you (far + slow + out of sight).
    const nearest = state.police.reduce((m, c) => Math.min(m, c.dist), Infinity);
    const p = state.player;
    if (nearest > 120 && p.speed < 4) {
      state.wantedTimer += dt;
      if (state.wantedTimer > 6) { setWanted(state.wanted - 1); state.wantedTimer = 0; }
    } else state.wantedTimer = 0;
  }

  // ---- the one step ---------------------------------------------------------
  function step(dt, held, actions) {
    if (state.over) return EVENT_NONE;
    let ev = EVENT_NONE;
    state.time += dt;
    const p = state.player;
    p.invuln = Math.max(0, p.invuln - dt);
    for (let i = 0; i < 3; i++) state.crewCd[i] = Math.max(0, state.crewCd[i] - dt);
    state.messages = state.messages.filter((m) => m.until > state.time);
    if (state.enemy && state.time > state.enemy.until) state.enemy = null;

    // Crew abilities.
    if (actions & 32) ev |= useCrew(0);
    if (actions & 64) ev |= useCrew(1);
    if (actions & 128) ev |= useCrew(2);
    if (actions & 8) ev |= melee();
    if (actions & 16) ev |= shoot();
    if (actions & 4) ev |= enterOrExitCar();

    // Nitro.
    const wantNitro = held.nitro && !p.onFoot && p.nitro > 0 && p.speed > 4;
    if (wantNitro && !p.nitroOn) ev |= EVENT_NITRO;
    p.nitroOn = wantNitro;
    p.nitro = clamp(p.nitro + (wantNitro ? -26 * dt : 9 * dt), 0, 100);

    // Movement.
    const steer = (held.left ? -1 : 0) + (held.right ? 1 : 0);
    if (p.onFoot) {
      const fwd = (held.up ? 1 : 0) - (held.down ? 1 : 0);
      if (fwd !== 0 || steer !== 0) {
        p.heading = angleLerp(p.heading, Math.atan2(steer, fwd), dt * 10);
        p.speed = 7;
        p.x += Math.sin(p.heading) * p.speed * dt;
        p.z += Math.cos(p.heading) * p.speed * dt;
      } else p.speed = 0;
      const [nx, nz] = collideCircle(layout.buildings, p.x, p.z, PLAYER_R);
      p.x = nx; p.z = nz;
    } else {
      const accel = held.up ? 26 : held.down ? -18 : 0;
      const max = (TOP_SPEED * (p.nitroOn ? NITRO_MULT : 1)) * (p.tireDamage ? 0.45 : 1);
      p.speed = clamp(p.speed + accel * dt, -12, max);
      if (!held.up && !held.down) p.speed = p.speed * (1 - 0.9 * dt) + 0;
      if (held.brake) p.speed *= (1 - 3 * dt);
      const turn = steer * (0.028 + Math.min(0.02, Math.abs(p.speed) * 0.0006)) * (p.speed >= 0 ? 1 : -1);
      p.heading += turn * Math.min(1, Math.abs(p.speed) / 8 + 0.2) * 60 * dt * 0.16;
      p.x += Math.sin(p.heading) * p.speed * dt;
      p.z += Math.cos(p.heading) * p.speed * dt;
      const [nx, nz] = collideCircle(layout.buildings, p.x, p.z, CAR_R);
      if (nx !== p.x || nz !== p.z) { p.speed *= 0.4; if (p.car) p.car.condition -= 0.4; }
      p.x = nx; p.z = nz;
      state.stats.kmDriven += (Math.abs(p.speed) * dt) / 1000;
      if (p.car && p.car.condition <= 0) {
        p.car.condition = 0;
        p.smoke = 1;
        state.health -= 2 * dt;
      }
    }
    p.x = clamp(p.x, -CITY_HALF + 8, CITY_HALF - 8);
    p.z = clamp(p.z, -CITY_HALF + 8, CITY_HALF - 8);
    if (p.smoke > 0) p.smoke = Math.max(0, p.smoke - dt * 0.2);

    // Traffic + pedestrians.
    stepTraffic(dt);
    stepPeds(dt);

    // Systems.
    ev |= stepMission(dt);
    ev |= stepTaxi(dt);
    ev |= stepPickups();
    ev |= stepJumps(dt);
    ev |= stepPolice(dt);
    stepWanted(dt);

    // WASTED.
    if (state.health <= 0) {
      state.health = 0;
      state.over = 'wasted';
      ev |= EVENT_WASTED;
    }
    return ev;
  }

  function stepTraffic(dt) {
    const p = state.player;
    for (const t of state.traffic) {
      if (t.parked) continue;
      // Slow for the player in front, otherwise cruise its road.
      const d = Math.sqrt(dist2(t.x, t.z, p.x, p.z));
      const target = d < 18 ? 0 : t.speed;
      t.x += Math.sin(t.heading) * target * dt;
      t.z += Math.cos(t.heading) * target * dt;
      if (t.x > CITY_HALF) t.x = -CITY_HALF;
      if (t.x < -CITY_HALF) t.x = CITY_HALF;
      if (t.z > CITY_HALF) t.z = -CITY_HALF;
      if (t.z < -CITY_HALF) t.z = CITY_HALF;
    }
  }

  function stepPeds(dt) {
    const p = state.player;
    for (const ped of state.peds) {
      if (ped.down) continue;
      const d = Math.sqrt(dist2(ped.x, ped.z, p.x, p.z));
      if (d < 26 && (state.wanted > 0 || !p.onFoot)) ped.flee = 2;
      if (ped.flee > 0) {
        ped.flee -= dt;
        const a = Math.atan2(ped.x - p.x, ped.z - p.z);
        ped.x += Math.sin(a) * 5 * dt;
        ped.z += Math.cos(a) * 5 * dt;
      } else {
        if (dist2(ped.x, ped.z, ped.tx, ped.tz) < 9) {
          ped.tx = clamp(ped.x + rng.range(-80, 80), -350, 350);
          ped.tz = clamp(ped.z + rng.range(-80, 80), -350, 350);
        }
        const a = Math.atan2(ped.tx - ped.x, ped.tz - ped.z);
        ped.heading = angleLerp(ped.heading, a, dt * 4);
        ped.x += Math.sin(ped.heading) * ped.speed * dt;
        ped.z += Math.cos(ped.heading) * ped.speed * dt;
      }
      const [nx, nz] = collideCircle(layout.buildings, ped.x, ped.z, 1.2);
      ped.x = nx; ped.z = nz;
    }
  }

  function enterOrExitCar() {
    const p = state.player;
    if (!p.onFoot) {
      // Get out: leave the car where it is.
      const car = p.car;
      if (car) {
        state.traffic.push({
          x: p.x, z: p.z, heading: p.heading, speed: 0,
          color: car.color, name: car.name, parked: true, stolen: false,
        });
      }
      p.car = null;
      p.onFoot = true;
      p.speed = 0;
      say('On foot.', 2);
      return EVENT_NONE;
    }
    // Find the nearest parked car (12 units: the spawn sits right by them).
    let best = null; let bd = 144;
    for (const t of state.traffic) {
      if (!t.parked) continue;
      const d = dist2(p.x, p.z, t.x, t.z);
      if (d < bd) { bd = d; best = t; }
    }
    if (!best) { say('No car nearby — find a parked one.', 2); return EVENT_NONE; }
    state.traffic.splice(state.traffic.indexOf(best), 1);
    p.onFoot = false;
    p.car = { name: best.name, color: best.color, condition: 100 };
    p.heading = best.heading;
    p.speed = 0;
    if (!best.stolen) {
      best.stolen = true;
      state.stats.carsStolen += 1;
      say('Stole the ' + best.name + ' — nice.', 3);
    }
    return EVENT_NONE;
  }

  // ---- debug / test hooks ---------------------------------------------------
  // The playtest script drives these; they change nothing about normal play.
  const debug = {
    teleport(x, z) { state.player.x = x; state.player.z = z; state.player.speed = 0; },
    giveCar(name) {
      const car = CARS.find((c) => c.name === name) || CARS[0];
      state.player.onFoot = false;
      state.player.car = { name: car.name, color: car.color, condition: 100 };
      state.player.speed = 0;
    },
    startMission(i) { return startMission(i); },
    completeStage() { if (state.mission) advanceStage(); },
    setWanted(n) { setWanted(n, true); },
    setCash(n) { state.cash = n; },
    setRespect(n) { state.respect = n; },
    setHealth(n) { state.health = n; },
    setSpeed(n) { state.player.speed = n; },
    setNitro(n) { state.player.nitro = n; },
    forceRoadblock() {
      const p = state.player;
      state.roadblock = {
        x: p.x + Math.sin(p.heading) * 70, z: p.z + Math.cos(p.heading) * 70,
        heading: p.heading, spikes: true, until: state.time + 25,
      };
    },
    state: () => state,
  };

  reset();
  return { state, layout, step, reset, save, startMission, dispatchUnits, missionStageLabel, debug };
}
