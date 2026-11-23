// The look: a golden-hour coastal city in low-poly Three.js, plus the dense
// HUD the top entries win with (mission banner, dispatch panel, crew chips,
// weapon slots, district standing, radio, car card) and a circular minimap.
// All textures are canvas-made; nothing is fetched.
import * as THREE from '../vendor/three/three.module.min.js';
import { GOLDEN, DISTRICTS, CREW, WEAPONS, RADIO, rankFor, districtAt } from './config.js';
import { clamp, lerp, angleLerp, fmtCash, fmtTime } from './random.js';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function windowsTexture() {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = '#4a3a5e'; g.fillRect(0, 0, w, h);
    for (let y = 8; y < h - 8; y += 22) {
      for (let x = 8; x < w - 8; x += 18) {
        const lit = ((x * 7 + y * 13) % 10) < 6;
        g.fillStyle = lit ? (y % 44 === 8 ? '#ffd27a' : '#ff9a5c') : '#171226';
        g.fillRect(x, y, 11, 14);
      }
    }
  });
}

function roadTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#3a3348'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd166'; g.fillRect(w / 2 - 2, 0, 4, 40);
    g.fillStyle = '#ffd166'; g.fillRect(w / 2 - 2, 64, 4, 40);
    g.fillStyle = '#8d86a3'; g.fillRect(0, 0, 3, h); g.fillRect(w - 3, 0, 3, h);
  });
}

function signTexture(text, sub, color) {
  return canvasTexture(512, 192, (g, w, h) => {
    g.fillStyle = '#140f22'; g.fillRect(0, 0, w, h);
    g.strokeStyle = color; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = color; g.font = 'bold 92px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 - 22);
    g.font = 'bold 34px system-ui, sans-serif';
    g.fillStyle = '#ffe9c9';
    g.fillText(sub, w / 2, h / 2 + 52);
  });
}

function makeCarMesh(color, police) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c1a26 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.85, 4.6), bodyMat);
  body.position.y = 0.62;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 2.2), dark);
  cabin.position.set(0, 1.35, -0.3);
  g.add(body, cabin);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111016 });
  for (const [x, z] of [[-1.15, 1.5], [1.15, 1.5], [-1.15, -1.5], [1.15, -1.5]]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.7, 0.9), wheelMat);
    w.position.set(x, 0.35, z);
    g.add(w);
  }
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const x of [-0.8, 0.8]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), headMat);
    h.position.set(x, 0.7, 2.32);
    g.add(h);
  }
  if (police) {
    const barR = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2e3e }));
    barR.position.set(-0.45, 1.85, -0.3);
    const barB = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.3), new THREE.MeshBasicMaterial({ color: 0x2e7dff }));
    barB.position.set(0.45, 1.85, -0.3);
    g.add(barR, barB);
    g.userData.barR = barR; g.userData.barB = barB;
  }
  return g;
}

export function createRenderer(canvas, world) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(GOLDEN.skyMid);
  scene.fog = new THREE.Fog(GOLDEN.fog, 260, 900);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2000);
  camera.position.set(0, 40, 120);

  // Golden-hour light: warm directional sun low in the west + pink hemisphere.
  const sun = new THREE.DirectionalLight(GOLDEN.sun, 2.4);
  sun.position.set(GOLDEN.sunDir[0] * 300, GOLDEN.sunDir[1] * 300, GOLDEN.sunDir[2] * 300);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(GOLDEN.hemiSky, GOLDEN.hemiGround, 1.3));
  scene.add(new THREE.AmbientLight(GOLDEN.ambient, 0.35));

  // Sky dome: a big gradient sphere, backside, so every shot has a sunset sky.
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(GOLDEN.skyTop) },
      mid: { value: new THREE.Color(GOLDEN.skyMid) },
      low: { value: new THREE.Color(GOLDEN.skyLow) },
      sunDir: { value: new THREE.Vector3(...GOLDEN.sunDir).normalize() },
      sunCol: { value: new THREE.Color(GOLDEN.sun) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP;
      uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform vec3 sunDir; uniform vec3 sunCol;
      void main(){
        float h = normalize(vP).y;
        vec3 c = h > 0.25 ? mix(mid, top, smoothstep(0.25, 0.9, h)) : mix(low, mid, smoothstep(-0.08, 0.25, h));
        float s = max(dot(normalize(vP), sunDir), 0.0);
        c += sunCol * pow(s, 24.0) * 0.9 + sunCol * pow(s, 4.0) * 0.25;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(950, 24, 16), skyMat));

  // Sun disc (no cloud billboards: edge-on planes read as light pillars).
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(34, 32), new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false }));
  sunDisc.position.set(GOLDEN.sunDir[0] * 880, GOLDEN.sunDir[1] * 880, GOLDEN.sunDir[2] * 880);
  sunDisc.lookAt(0, 0, 0);
  scene.add(sunDisc);

  // Ground: warm asphalt city + sand strip + ocean to the south and east.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshLambertMaterial({ color: 0x6b5a52 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 90),
    new THREE.MeshLambertMaterial({ color: 0xf2c078 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.05, 400);
  scene.add(sand);
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 500),
    new THREE.MeshLambertMaterial({ color: 0x2e7f9e }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, -0.4, 680);
  scene.add(ocean);
  const oceanE = ocean.clone();
  oceanE.rotation.z = Math.PI / 2;
  oceanE.rotation.x = -Math.PI / 2;
  oceanE.position.set(680, -0.4, 0);
  scene.add(oceanE);

  // Roads: dark strips with dashes along every grid line.
  const roadTex = roadTexture();
  roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
  for (let g = -380; g <= 380; g += 80) {
    for (const horiz of [true, false]) {
      const tex = roadTex.clone();
      tex.repeat.set(10, 1);
      tex.needsUpdate = true;
      const r = new THREE.Mesh(new THREE.PlaneGeometry(780, 22), new THREE.MeshLambertMaterial({ map: tex }));
      r.rotation.x = -Math.PI / 2;
      if (!horiz) r.rotation.z = Math.PI / 2;
      r.position.set(horiz ? 0 : g, 0.08, horiz ? g : 0);
      scene.add(r);
    }
  }

  // Buildings: one instanced box, window-grid texture, per-instance colour.
  const layout = world.layout;
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  bGeo.translate(0, 0.5, 0);
  const bMat = new THREE.MeshLambertMaterial({ map: windowsTexture() });
  const bMesh = new THREE.InstancedMesh(bGeo, bMat, layout.buildings.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  const palette = [0x9a8fc0, 0xc98a6a, 0x7fa8b8, 0xd8a06a, 0xb88ac0, 0x8fa8c8, 0xe0b070];
  layout.buildings.forEach((b, i) => {
    m4.compose(new THREE.Vector3(b.x, 0, b.z), q, new THREE.Vector3(b.w, b.h, b.d));
    bMesh.setMatrixAt(i, m4);
    col.setHex(palette[Math.floor(b.hue * palette.length)]);
    bMesh.setColorAt(i, col);
  });
  bMesh.instanceMatrix.needsUpdate = true;
  scene.add(bMesh);

  // Palms: instanced trunks + frond cones.
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 7, 6);
  trunkGeo.translate(0, 3.5, 0);
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x8a6a4a }), Math.max(1, layout.palms.length));
  const frondGeo = new THREE.ConeGeometry(3.2, 3.4, 6);
  frondGeo.translate(0, 8, 0);
  const frondMesh = new THREE.InstancedMesh(frondGeo, new THREE.MeshLambertMaterial({ color: 0x3f9e4d }), Math.max(1, layout.palms.length));
  layout.palms.forEach((p, i) => {
    m4.compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(1, 1, 1));
    trunkMesh.setMatrixAt(i, m4);
    frondMesh.setMatrixAt(i, m4);
  });
  scene.add(trunkMesh, frondMesh);

  // Market stalls + containers.
  const stallMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(5, 3, 4), new THREE.MeshLambertMaterial({ color: 0xffffff }), Math.max(1, layout.stalls.length));
  const stallCols = [0xff5c8a, 0xffd166, 0x4dd8c8, 0xff7a1a];
  layout.stalls.forEach((s, i) => {
    m4.compose(new THREE.Vector3(s.x, 0, s.z), q, new THREE.Vector3(1, 1, 1));
    stallMesh.setMatrixAt(i, m4);
    col.setHex(stallCols[Math.floor(s.hue * stallCols.length)]);
    stallMesh.setColorAt(i, col);
  });
  scene.add(stallMesh);
  const contMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(12, 2.6, 2.6), new THREE.MeshLambertMaterial({ color: 0xffffff }), Math.max(1, layout.containers.length));
  const contCols = [0xe63946, 0x2ec4b6, 0xffd166, 0x7fd4ff, 0xff7a1a];
  layout.containers.forEach((c, i) => {
    m4.compose(new THREE.Vector3(c.x, (c.stack - 1) * 1.3, c.z), q, new THREE.Vector3(1, c.stack, 1));
    contMesh.setMatrixAt(i, m4);
    col.setHex(contCols[Math.floor(c.hue * contCols.length)]);
    contMesh.setColorAt(i, col);
  });
  scene.add(contMesh);

  // Harbor cranes: simple box-built silhouettes.
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xd84a3a });
  for (const [x, z] of [[330, -120], [330, 40], [330, 180]]) {
    const crane = new THREE.Group();
    const leg = new THREE.Mesh(new THREE.BoxGeometry(3, 42, 3), craneMat);
    leg.position.y = 21;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(46, 2.5, 2.5), craneMat);
    arm.position.set(-16, 42, 0);
    crane.add(leg, arm);
    crane.position.set(x, 0, z);
    scene.add(crane);
  }
  // A freighter at the docks.
  const ship = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(60, 8, 18), new THREE.MeshLambertMaterial({ color: 0x2b3a55 }));
  hull.position.y = 2;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(50, 6, 14), new THREE.MeshLambertMaterial({ color: 0xe63946 }));
  deck.position.y = 8;
  ship.add(hull, deck);
  ship.position.set(430, 0, -40);
  scene.add(ship);

  // Big signs (canvas textures on planes, double-sided).
  for (const s of layout.signs) {
    const tex = signTexture(s.text, s.sub, s.color);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(s.big ? 44 : 26, s.big ? 16.5 : 9.8), mat);
    plane.position.set(s.x, s.big ? 26 : 14, s.z);
    plane.rotation.y = s.ry || 0; // face the street the sign serves, never mirrored
    scene.add(plane);
  }

  // ---- dynamic actors -------------------------------------------------------
  const playerCar = makeCarMesh(0xff7a1a, false);
  scene.add(playerCar);
  const playerFoot = new THREE.Group();
  const jacket = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.5, 0.6), new THREE.MeshLambertMaterial({ color: 0xe63946 }));
  jacket.position.y = 1.0;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), new THREE.MeshLambertMaterial({ color: 0xf2c09a }));
  head.position.y = 2.05;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.5), new THREE.MeshLambertMaterial({ color: 0x2b2b3a }));
  legs.position.y = 0.4;
  // Rhea's pistol, held out in front of her — the tracer below starts here.
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.9), new THREE.MeshLambertMaterial({ color: 0x111016 }));
  gun.position.set(0.45, 1.15, 0.7);
  // Name tag floating over her head, so the on-foot player reads as a
  // person with a name instead of one more coloured block in the crowd.
  const tagTex = canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = 'rgba(20, 10, 30, 0.85)'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ff5c8a'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
    g.fillStyle = '#ffffff'; g.font = 'bold 36px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('RHEA', w / 2, h / 2 + 2);
  });
  const rheaTag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex }));
  rheaTag.scale.set(1.7, 0.43, 1);
  rheaTag.position.y = 3.1;
  playerFoot.add(jacket, head, legs, gun, rheaTag);
  scene.add(playerFoot);

  // Combat moment: a bright tracer line from Rhea's gun to the downed
  // enemy, a muzzle flash at the gun, and a pulsing red ring on the ground
  // around the enemy. Shown whenever the world has a live enemy target.
  const tracer = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffe95c, transparent: true, opacity: 0.95 }),
  );
  tracer.visible = false;
  scene.add(tracer);
  const muzzle = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xfff2a8 }),
  );
  muzzle.visible = false;
  scene.add(muzzle);
  const downRing = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 2.2, 24),
    new THREE.MeshBasicMaterial({ color: 0xff2e3e, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
  );
  downRing.rotation.x = -Math.PI / 2;
  downRing.visible = false;
  scene.add(downRing);
  // Impact burst at the enemy: a glowing hit marker so the combat moment
  // reads even where the tracer itself is short on screen.
  const impact = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe95c, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  impact.visible = false;
  scene.add(impact);

  // Market stalls for the Old Town street shot: counter + bright canopy +
  // a big sign facing back down the road (west), so the signs read from the
  // street camera. Positions come from state.marketStalls (staged shots
  // only); in normal play the stalls stay hidden.
  const marketStalls = [
    { text: 'TACOS', sub: 'STREET FOOD', color: '#ff5c8a' },
    { text: 'SPICES', sub: 'OLD TOWN', color: '#ffd166' },
    { text: 'FRUIT', sub: 'FRESH DAILY', color: '#4dd8c8' },
    { text: 'FLOWERS', sub: 'MARKET', color: '#ff7a1a' },
    { text: 'COFFEE', sub: 'HOT BREW', color: '#7fd4ff' },
  ].map((d) => {
    const g = new THREE.Group();
    const counter = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.3, 2.4), new THREE.MeshLambertMaterial({ color: 0x8a5a3a }));
    counter.position.y = 0.65;
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.25, 3.2), new THREE.MeshLambertMaterial({ color: new THREE.Color(d.color) }));
    canopy.position.y = 3.0;
    const signTex = signTexture(d.text, d.sub, d.color);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 1.7),
      new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide }),
    );
    sign.position.y = 4.15;
    sign.rotation.y = -Math.PI / 2; // face west, down the road at the camera
    g.add(counter, canopy, sign);
    for (const [px, pz] of [[-2.2, -1.4], [2.2, -1.4], [-2.2, 1.4], [2.2, 1.4]]) {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.0, 0.18), new THREE.MeshLambertMaterial({ color: 0x3a2e22 }));
      pole.position.set(px, 1.5, pz);
      g.add(pole);
    }
    // Goods on the counter: a row of small bright crates.
    for (let i = 0; i < 3; i++) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.7), new THREE.MeshLambertMaterial({ color: new THREE.Color(d.color) }));
      crate.position.set(-1.3 + i * 1.3, 1.6, 0);
      g.add(crate);
    }
    g.visible = false;
    scene.add(g);
    return g;
  });

  const trafficMeshes = [];
  for (let i = 0; i < 22; i++) {
    const m = makeCarMesh(0xffffff, false);
    m.visible = false;
    scene.add(m);
    trafficMeshes.push(m);
  }
  const policeMeshes = [];
  for (let i = 0; i < 7; i++) {
    const m = makeCarMesh(0xf2f2f2, true);
    m.visible = false;
    scene.add(m);
    policeMeshes.push(m);
  }
  // Pedestrians: two instanced meshes (bodies + heads), matrices rewritten per frame.
  // Body geometry is translated so its base sits on the ground (y = 0).
  const pedBodyGeo = new THREE.BoxGeometry(1.0, 1.5, 0.55);
  pedBodyGeo.translate(0, 0.75, 0);
  const pedBody = new THREE.InstancedMesh(
    pedBodyGeo,
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    30,
  );
  const pedHead = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.5),
    new THREE.MeshLambertMaterial({ color: 0xf2c09a }),
    30,
  );
  scene.add(pedBody, pedHead);
  const pedCol = new THREE.Color();
  const qDown = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));

  // Helicopter + searchlight cone + ground pool + spotlight.
  const heli = new THREE.Group();
  const heliBody = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.2, 7), new THREE.MeshLambertMaterial({ color: 0xe8eef4 }));
  const heliStripe = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.6, 7.1), new THREE.MeshBasicMaterial({ color: 0xff2e3e }));
  heliStripe.position.y = -0.4;
  const heliTail = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 6), new THREE.MeshLambertMaterial({ color: 0x1c2b3a }));
  heliTail.position.set(0, 0.3, -6);
  const heliGlass = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.2, 2), new THREE.MeshBasicMaterial({ color: 0x9fd8ff }));
  heliGlass.position.set(0, 0.4, 3.2);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(14, 0.18, 1.1), new THREE.MeshLambertMaterial({ color: 0x111016 }));
  rotor.position.y = 1.5;
  heli.add(heliBody, heliStripe, heliTail, heliGlass, rotor);
  heli.scale.setScalar(1.2); // the heli must read LARGE in the chase shot
  // Side profile to the chase camera (nose screen-left, tail screen-right):
  // with the tail pointing at the camera it foreshortened into a black wedge
  // clipped by the top of the frame; side-on the whole silhouette reads.
  heli.rotation.y = Math.PI / 2;
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xfff2a8, transparent: true, opacity: 0.32,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(16, 42, 20, 1, true), coneMat);
  // ConeGeometry already points apex-up: centre it 21 below the heli so the
  // apex sits at the heli and the base lands on the road.
  cone.position.y = -21;
  heli.add(cone);
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(10, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = -41;
  heli.add(pool);
  const spot = new THREE.SpotLight(0xfff2a8, 3.2, 90, 0.42, 0.5, 1.2);
  spot.position.set(0, -2, 0);
  const spotTarget = new THREE.Object3D();
  spotTarget.position.set(0, -42, 0);
  heli.add(spotTarget);
  spot.target = spotTarget;
  heli.add(spot);
  heli.visible = false;
  scene.add(heli);

  // Roadblock: two police cars + a spike strip (dark strip with teeth).
  const roadblock = new THREE.Group();
  const rb1 = makeCarMesh(0xf2f2f2, true);
  rb1.position.set(-4, 0, 0); rb1.rotation.y = Math.PI / 2;
  const rb2 = makeCarMesh(0xf2f2f2, true);
  rb2.position.set(4, 0, 0); rb2.rotation.y = -Math.PI / 2;
  const spikes = new THREE.Mesh(new THREE.BoxGeometry(10, 0.25, 1.6), new THREE.MeshLambertMaterial({ color: 0x22222e }));
  spikes.position.set(0, 0.15, 5);
  roadblock.add(rb1, rb2, spikes);
  roadblock.visible = false;
  scene.add(roadblock);

  // Mission beacon: glowing pillar + ground ring.
  const beacon = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  pillar.position.y = 30;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(4, 6, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.2;
  beacon.add(pillar, ring);
  beacon.visible = false;
  scene.add(beacon);

  // Neon chips: spinning octahedrons.
  const chipMeshes = [];
  const chipGeo = new THREE.OctahedronGeometry(1.4);
  const chipMat = new THREE.MeshBasicMaterial({ color: 0x4dd8c8 });
  for (let i = 0; i < 12; i++) {
    const c = new THREE.Mesh(chipGeo, chipMat);
    scene.add(c);
    chipMeshes.push(c);
  }

  // Nitro flame + smoke puffs.
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.45, 1.8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.9 }),
  );
  flame.rotation.x = Math.PI / 2;
  flame.visible = false;
  scene.add(flame);
  const smokePuffs = [];
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0x8a8a96, transparent: true, opacity: 0.5 });
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), smokeMat.clone());
    s.visible = false;
    scene.add(s);
    smokePuffs.push(s);
  }

  // ---- camera + HUD ---------------------------------------------------------
  let view = 'chase';
  let orbitA = 0.6;
  let snap = false; // next draw jumps the camera straight to its target (staged shots)
  const camPos = new THREE.Vector3(0, 40, 120);
  const camLook = new THREE.Vector3(0, 0, 0);
  const minimap = document.getElementById('minimap');
  const mm = minimap ? minimap.getContext('2d') : null;

  function el(id) { return document.getElementById(id); }
  function setText(id, v) {
    const n = el(id);
    if (n && n.textContent !== v) n.textContent = v;
  }

  function updateHUD(state) {
    const p = state.player;
    const d = districtAt(p.x, p.z);
    setText('hud-cash', fmtCash(state.cash));
    const r = rankFor(state.respect);
    setText('hud-rank', r.cur.name);
    setText('hud-respect', state.respect + ' / ' + (r.next ? r.next.at : 'MAX'));
    const bar = el('hud-rank-fill');
    if (bar) bar.style.width = (r.next ? (state.respect / r.next.at) * 100 : 100) + '%';
    setText('hud-district', d.name + ' · ' + d.mood + ' ' + d.standing);
    setText('hud-speed', p.onFoot ? 'ON FOOT' : Math.round(Math.abs(p.speed) * 3.2) + ' MPH');
    setText('hud-car', p.car ? p.car.name.toUpperCase() : 'ON FOOT — RHEA COLE');
    setText('hud-cond', p.car ? 'CONDITION ' + Math.round(p.car.condition) + '%' : '');
    const nf = el('hud-nitro-fill');
    if (nf) nf.style.width = Math.round(p.nitro) + '%';
    setText('hud-radio', RADIO[state.radio]);
    const hf = el('hud-health-fill');
    if (hf) hf.style.width = state.health + '%';
    const af = el('hud-armor-fill');
    if (af) af.style.width = state.armor + '%';
    // Wanted stars.
    const stars = el('hud-stars');
    if (stars) {
      let s = '';
      for (let i = 0; i < 5; i++) s += i < state.wanted ? '★' : '☆';
      if (stars.textContent !== s) stars.textContent = s;
    }
    // Mission banner.
    const mb = el('mission-banner');
    if (mb) {
      if (state.mission) {
        const m = state.mission;
        const st = m.def.stages[m.stage];
        mb.style.display = 'block';
        setText('mb-title', 'JOB ' + m.def.n + '/6 · ' + m.def.title);
        setText('mb-stage', 'STAGE ' + (m.stage + 1) + '/' + m.def.stages.length);
        setText('mb-next', 'NEXT · ' + st.label);
        let t = '';
        if (st.type === 'survive') t = fmtTime(Math.max(0, st.seconds - m.timer));
        else if (st.type === 'hold') t = Math.round((m.hold / st.seconds) * 100) + '%';
        else t = fmtTime(m.elapsed);
        setText('mb-timer', t);
        setText('mb-pay', fmtCash(m.def.pay));
      } else mb.style.display = 'none';
    }
    // Dispatch panel.
    const dp = el('dispatch-list');
    if (dp) {
      const units = world.dispatchUnits();
      const html = units.map((u) => '<div class="unit"><span class="u-name">' + u.name + '</span><span class="u-dist">' + u.dist + 'm</span><span class="u-role">' + u.role + '</span></div>').join('')
        + (state.roadblock ? '<div class="unit more">+1 more unit · roadblock ahead</div>' : '');
      if (dp._last !== html) { dp.innerHTML = html; dp._last = html; }
      const dh = el('dispatch-head');
      if (dh) setText('dispatch-head', 'VCPD DISPATCH · ' + units.length + ' UNITS · ' + state.wanted + '★');
    }
    // Crew chips + cooldowns.
    const crew = el('crew-chips');
    if (crew) {
      const html = CREW.map((c, i) => {
        const cd = Math.ceil(state.crewCd[i]);
        return '<div class="crew-chip' + (cd > 0 ? ' cooling' : '') + '" style="--cc:' + c.color + '"><b>' + c.key + '</b><span class="crew-name">' + c.name + ' · ' + c.role + '</span><span class="crew-ab">' + c.ability + (cd > 0 ? ' · ' + cd + 's' : '') + '</span></div>';
      }).join('');
      if (crew._last !== html) { crew.innerHTML = html; crew._last = html; }
    }
    // Weapon slots.
    const wp = el('weapon-slots');
    if (wp) {
      const html = WEAPONS.map((w) => {
        const ammo = w.locked ? 'LOCKED' : (w.ammo === Infinity ? '∞' : String(state.ammo[w.slot - 1]));
        return '<div class="wslot' + (state.weapon === w.slot ? ' active' : '') + (w.locked ? ' locked' : '') + '"><b>' + w.slot + '</b><span>' + w.icon + ' ' + w.name + '</span><em>' + ammo + '</em></div>';
      }).join('');
      if (wp._last !== html) { wp.innerHTML = html; wp._last = html; }
    }
    // Toasts.
    const toasts = el('toasts');
    if (toasts) {
      const html = state.messages.map((m) => '<div class="toast">' + m.text + '</div>').join('');
      if (toasts._last !== html) { toasts.innerHTML = html; toasts._last = html; }
    }
  }

  function drawMinimap(state) {
    if (!mm) return;
    const S = 190;
    const scale = S / 820;
    const toX = (x) => S / 2 + x * scale;
    const toY = (z) => S / 2 + z * scale;
    mm.clearRect(0, 0, S, S);
    mm.save();
    mm.beginPath(); mm.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); mm.clip();
    mm.fillStyle = 'rgba(20, 14, 34, 0.92)'; mm.fillRect(0, 0, S, S);
    // District blobs.
    for (const d of DISTRICTS) {
      mm.fillStyle = 'rgba(255, 154, 92, 0.25)';
      mm.beginPath(); mm.arc(toX(d.cx), toY(d.cz), d.r * scale, 0, Math.PI * 2); mm.fill();
      mm.fillStyle = '#ffe9c9'; mm.font = 'bold 8px system-ui, sans-serif'; mm.textAlign = 'center';
      mm.fillText(d.name, toX(d.cx), toY(d.cz));
    }
    // Roads.
    mm.strokeStyle = 'rgba(255, 233, 201, 0.35)'; mm.lineWidth = 1;
    for (let g = -380; g <= 380; g += 80) {
      mm.beginPath(); mm.moveTo(toX(g), 0); mm.lineTo(toX(g), S); mm.stroke();
      mm.beginPath(); mm.moveTo(0, toY(g)); mm.lineTo(S, toY(g)); mm.stroke();
    }
    // Ocean edge.
    mm.fillStyle = 'rgba(46, 127, 158, 0.8)';
    mm.fillRect(0, toY(380), S, S - toY(380));
    // Beacon / taxi / chips.
    if (state.beacon) {
      mm.fillStyle = '#ffd166';
      mm.beginPath(); mm.arc(toX(state.beacon.x), toY(state.beacon.z), 5, 0, Math.PI * 2); mm.fill();
    }
    if (state.taxi) {
      mm.fillStyle = '#4dd8c8';
      mm.font = 'bold 10px system-ui, sans-serif';
      mm.fillText('$', toX(state.taxi.x), toY(state.taxi.z));
    }
    mm.fillStyle = '#4dd8c8';
    for (let i = 0; i < 12; i++) {
      if (state.chips[i]) continue;
      const [x, z] = [[-240, -240], [-160, 200], [240, 200], [280, -200], [0, -320], [-320, 0], [120, 120], [-80, 280], [320, 80], [-280, -120], [200, -280], [40, 200]][i];
      mm.fillRect(toX(x) - 1.5, toY(z) - 1.5, 3, 3);
    }
    // Police + heli.
    mm.fillStyle = '#ff2e3e';
    for (const c of state.police) {
      mm.beginPath(); mm.arc(toX(c.x), toY(c.z), 3, 0, Math.PI * 2); mm.fill();
    }
    if (state.heli) {
      mm.fillStyle = '#ffffff';
      mm.font = 'bold 11px system-ui, sans-serif';
      mm.fillText('H', toX(state.heli.x), toY(state.heli.z));
    }
    // Player arrow.
    const p = state.player;
    mm.save();
    mm.translate(toX(p.x), toY(p.z));
    mm.rotate(Math.atan2(Math.sin(p.heading), Math.cos(p.heading)) + Math.PI);
    mm.fillStyle = '#ffffff';
    mm.beginPath(); mm.moveTo(0, -7); mm.lineTo(5, 6); mm.lineTo(-5, 6); mm.closePath(); mm.fill();
    mm.restore();
    mm.restore();
    // North marker.
    mm.fillStyle = '#ffe9c9'; mm.font = 'bold 11px system-ui, sans-serif'; mm.textAlign = 'center';
    mm.fillText('N', S / 2, 14);
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  let frame = 0;
  function draw(state, screen) {
    frame += 1;
    const p = state.player;
    const t = state.time;
    // ---- camera
    const k = snap ? 1 : 0.16;
    snap = false;
    if (view === 'orbit') {
      orbitA += 0.0016;
      const r = 360;
      camPos.set(Math.cos(orbitA) * r, 60, Math.sin(orbitA) * r);
      camLook.set(0, 25, -40);
    } else if (view === 'street') {
      // On foot: close behind Rhea and low, so she fills the frame and the
      // foreground is her and the street, not empty road.
      const bx = p.x - Math.sin(p.heading) * 8.5;
      const bz = p.z - Math.cos(p.heading) * 8.5;
      camPos.set(lerp(camPos.x, bx, k), lerp(camPos.y, 4.8, k), lerp(camPos.z, bz, k));
      camLook.set(p.x + Math.sin(p.heading) * 10, 2.2, p.z + Math.cos(p.heading) * 10);
    } else {
      // Chase: close behind + low, FOV kick on nitro.
      const dist = p.onFoot ? 10 : 11.5;
      const h = p.onFoot ? 5.5 : 5.8;
      const bx = p.x - Math.sin(p.heading) * dist;
      const bz = p.z - Math.cos(p.heading) * dist;
      camPos.set(lerp(camPos.x, bx, k), lerp(camPos.y, h + (p.airborne > 0 ? 4 : 0), k), lerp(camPos.z, bz, k));
      camLook.set(p.x + Math.sin(p.heading) * 12, 2.5, p.z + Math.cos(p.heading) * 12);
      camera.fov = lerp(camera.fov, p.nitroOn ? 74 : 62, 0.1);
      camera.updateProjectionMatrix();
    }
    camera.position.copy(camPos);
    camera.lookAt(camLook);

    // ---- actors
    if (p.onFoot) {
      playerCar.visible = false;
      playerFoot.visible = true;
      playerFoot.position.set(p.x, 0, p.z);
      playerFoot.rotation.y = p.heading;
      // Street view only: Rhea reads 1.4x larger with her gun and name tag
      // so she stands out from the crowd. Every other view keeps the plain
      // figure, so the title and stats shots are pixel-identical to before.
      const streetView = view === 'street';
      playerFoot.scale.setScalar(streetView ? 1.4 : 1);
      gun.visible = streetView;
      rheaTag.visible = streetView;
    } else {
      playerFoot.visible = false;
      playerCar.visible = true;
      playerCar.position.set(p.x, p.airborne > 0 ? 2.5 : 0, p.z);
      playerCar.rotation.y = p.heading;
      if (p.car) playerCar.children[0].material.color.setHex(p.car.color);
      flame.visible = !!p.nitroOn;
      if (p.nitroOn) {
        flame.position.set(p.x - Math.sin(p.heading) * 3, 0.6, p.z - Math.cos(p.heading) * 3);
        flame.rotation.y = p.heading;
        flame.scale.setScalar(0.7 + Math.sin(t * 40) * 0.2);
      }
      const smoking = p.smoke > 0 || (p.car && p.car.condition < 30);
      smokePuffs.forEach((s, i) => {
        s.visible = !!smoking;
        if (smoking) {
          s.position.set(p.x + Math.sin(i * 2.1) * 1.2, 1.5 + ((t * 2 + i) % 3), p.z + Math.cos(i * 2.1) * 1.2);
          s.scale.setScalar(0.6 + ((t + i) % 2) * 0.5);
          s.material.opacity = 0.45 * (p.smoke > 0 ? p.smoke : 0.6);
        }
      });
    }
    state.traffic.forEach((tr, i) => {
      const m = trafficMeshes[i];
      if (!m) return;
      m.visible = true;
      m.position.set(tr.x, 0, tr.z);
      m.rotation.y = tr.heading;
      m.children[0].material.color.setHex(tr.color);
    });
    for (let i = state.traffic.length; i < trafficMeshes.length; i++) trafficMeshes[i].visible = false;
    state.police.forEach((c, i) => {
      const m = policeMeshes[i];
      if (!m) return;
      m.visible = true;
      m.position.set(c.x, 0, c.z);
      m.rotation.y = c.heading;
      const blink = Math.floor(t * 6) % 2 === 0;
      if (m.userData.barR) m.userData.barR.visible = blink;
      if (m.userData.barB) m.userData.barB.visible = !blink;
    });
    for (let i = state.police.length; i < policeMeshes.length; i++) policeMeshes[i].visible = false;
    state.peds.forEach((ped, i) => {
      const down = ped.down;
      // Down peds lie flat (rotated 90°); standing peds stand on the ground.
      const qq = down ? qDown : q;
      m4.compose(new THREE.Vector3(ped.x, down ? 0.35 : 0, ped.z), qq, new THREE.Vector3(1, 1, 1));
      pedBody.setMatrixAt(i, m4);
      pedCol.setHex(ped.color);
      pedBody.setColorAt(i, pedCol);
      m4.compose(new THREE.Vector3(ped.x, down ? 0.5 : 1.75, ped.z), q, new THREE.Vector3(1, 1, 1));
      pedHead.setMatrixAt(i, m4);
    });
    pedBody.instanceMatrix.needsUpdate = true;
    pedHead.instanceMatrix.needsUpdate = true;
    if (pedBody.instanceColor) pedBody.instanceColor.needsUpdate = true;

    // Combat moment + market stalls (street shot staging only).
    const combat = !!state.enemy && p.onFoot;
    tracer.visible = combat;
    muzzle.visible = combat;
    downRing.visible = combat;
    impact.visible = combat;
    if (combat) {
      const sx = p.x + Math.sin(p.heading) * 1.2;
      const sz = p.z + Math.cos(p.heading) * 1.2;
      const sy = 1.6;
      const ex = state.enemy.x, ez = state.enemy.z, ey = 1.0;
      const len = Math.hypot(ex - sx, ez - sz);
      tracer.position.set((sx + ex) / 2, (sy + ey) / 2, (sz + ez) / 2);
      tracer.scale.set(0.28, 0.28, Math.max(len, 0.1));
      tracer.lookAt(ex, ey, ez);
      muzzle.position.set(sx, sy, sz);
      downRing.position.set(ex, 0.18, ez);
      downRing.scale.setScalar(1 + Math.sin(t * 5) * 0.12);
      impact.position.set(ex, 1.2, ez);
      impact.scale.setScalar(1 + Math.sin(t * 6) * 0.25);
    }
    marketStalls.forEach((g, i) => {
      const s = state.marketStalls && state.marketStalls[i];
      g.visible = !!s;
      if (s) g.position.set(s.x, 0, s.z);
    });

    // Heli + cone: the cone stretches from the heli down to the road, whatever
    // height the heli flies at, and the light pool lands on the ground.
    heli.visible = !!state.heli;
    if (state.heli) {
      heli.position.set(state.heli.x, state.heli.h, state.heli.z);
      // The mesh spin compensates the group's side-on yaw, so the blade's
      // world angle is exactly state.heli.rotor (and it still spins freely
      // in normal play, where the rotor value advances every step).
      rotor.rotation.y = state.heli.rotor - Math.PI / 2;
      coneMat.opacity = 0.26 + Math.sin(t * 3) * 0.06;
      cone.scale.y = state.heli.h / 42;
      // Keep the apex glued to the heli: the stretched cone's centre sits
      // half its height below the heli, so it spans exactly heli -> ground.
      cone.position.y = -state.heli.h / 2;
      pool.position.y = -state.heli.h + 0.15;
      pool.scale.setScalar((16 * state.heli.h) / 42 / 10); // pool matches the cone's ground radius
      spotTarget.position.y = -state.heli.h;
    }
    roadblock.visible = !!state.roadblock;
    if (state.roadblock) {
      roadblock.position.set(state.roadblock.x, 0, state.roadblock.z);
      roadblock.rotation.y = state.roadblock.heading;
    }
    beacon.visible = !!state.beacon;
    if (state.beacon) {
      beacon.position.set(state.beacon.x, 0, state.beacon.z);
      const pulse = 1 + Math.sin(t * 4) * 0.15;
      ring.scale.setScalar(pulse);
      pillar.material.opacity = 0.3 + Math.sin(t * 4) * 0.1;
    }
    chipMeshes.forEach((c, i) => {
      const [x, z] = [[-240, -240], [-160, 200], [240, 200], [280, -200], [0, -320], [-320, 0], [120, 120], [-80, 280], [320, 80], [-280, -120], [200, -280], [40, 200]][i];
      c.visible = !state.chips[i];
      c.position.set(x, 1.6 + Math.sin(t * 2 + i) * 0.4, z);
      c.rotation.y = t * 1.5 + i;
    });

    renderer.render(scene, camera);
    if (screen === 'play' || screen === 'paused') {
      updateHUD(state);
      drawMinimap(state);
    }
  }

  return {
    draw,
    setView(v) { view = v; if (v === 'chase') { camPos.set(0, 40, 120); } },
    snapNext() { snap = true; },
    getView() { return view; },
  };
}
