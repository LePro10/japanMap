import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Vehicle } from './physics.js';
import { buildWorld, ground, loopPath, DRIFT, BUMPS, RAMP, LOOP } from './world.js';
import { EngineSound } from './audio.js';

// ------------------------------------------------------------------ Grundgerüst
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
renderer.shadowMap.enabled = true;
// Grafikstufen: Pixeldichte und Schatten sind hier die teuren Posten
const QUALITY = {
  hoch:    { pr: () => Math.min(devicePixelRatio, 2), shadows: true, map: 2048 },
  mittel:  { pr: () => Math.min(devicePixelRatio, 1.25), shadows: true, map: 1024 },
  niedrig: { pr: () => 0.7, shadows: false, map: 512 },
};
let quality = 'mittel';
try { quality = localStorage.getItem('carlab.quality') || 'mittel'; } catch { /* privat */ }
if (!QUALITY[quality]) quality = 'mittel';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.9;
const camera = new THREE.PerspectiveCamera(55, 1, 0.03, 2000);
const orbit = new OrbitControls(camera, canvas);
orbit.enableDamping = true; orbit.enabled = false; orbit.maxPolarAngle = Math.PI * 0.49;

const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x4a4436, 1.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 3.0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 120 });
sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);
const world = buildWorld(scene);

const SKY = { day: { bg: 0xa9c9e8, fog: 0xc4d6e6, hemi: 1.0, sun: 3.0, env: 0.9, exp: 1.0 },
              night: { bg: 0x070b16, fog: 0x0a0f1c, hemi: 0.08, sun: 0.15, env: 0.12, exp: 1.25 } };
let night = false;
function applySky() {
  const s = night ? SKY.night : SKY.day;
  scene.background = new THREE.Color(s.bg);
  scene.fog = new THREE.Fog(s.fog, 60, night ? 260 : 520);
  hemi.intensity = s.hemi; sun.intensity = s.sun; scene.environmentIntensity = s.env;
  sun.color.set(night ? 0x8fa8ff : 0xfff1dc);
  renderer.toneMappingExposure = s.exp;
  // zwölf Punktlichter kosten je Pixel — auf „niedrig“ bleiben nur die Leuchtkörper
  world.lamps.forEach(l => (l.intensity = night && quality !== 'niedrig' ? 60 : 0));
  world.lampMat.emissiveIntensity = night ? 3 : 0;
  if (car) setLights(night || lightsOn);
}


// ------------------------------------------------------------------ Zustand
const loader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
const sound = new EngineSound();
let fleet = [], car = null, vehicle = null;
let camMode = 'chase', lightsOn = false, xray = false, muted = false;
const tuneState = {};
const keys = {};
const AP = { mode: null, t: 0, idx: 0, phase: 0 };
const CAM_LABEL = { chase: 'Verfolger', cockpit: 'Cockpit', hood: 'Haube', wheel: 'Rad-Kamera', orbit: 'Showroom' };
const MODE_LABEL = { null: 'Selbst fahren', drive: 'Autopilot: Rundkurs', drift: 'Autopilot: Drift', suspension: 'Federungstest',
  steer: 'Lenkungstest', jump: 'Schanze' };
const path = loopPath(360);

const $ = (s) => document.querySelector(s);
function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._h); toast._h = setTimeout(() => t.classList.remove('show'), ms);
}

// ------------------------------------------------------------------ Auto laden
function rigCar(gltf, meta) {
  const root = gltf.scene;
  const find = (re) => { let r = null; root.traverse(o => { if (!r && re.test(o.name)) r = o; }); return r; };
  // Nur oberste Treffer: ein Mesh mit mehreren Materialien wird im glTF zur
  // Gruppe mit gleichnamigen Kindern — beide zu drehen dreht doppelt.
  const all = (re) => { const r = []; root.traverse(o => { if (re.test(o.name) && !(o.parent && re.test(o.parent.name))) r.push(o); }); return r; };
  const rig = {
    root, meta,
    carRoot: find(/^car_/) || root,
    bodyRoot: find(/^body_root/),
    steering: find(/^steering_wheel/),
    eye: find(/^eye/),
    driver: find(/^driver/),
    popups: all(/^popup_(L|R)/),
    drs: all(/^drs_flap/),
    arms: all(/^arm_(FL|FR|RL|RR)_\d/),
    wheels: {}, spins: {}, tune: [], mats: { glass: [], head: [], tail: [], rev: [], glow: [], body: [] },
  };
  for (const k of ['FL', 'FR', 'RL', 'RR']) {
    rig.wheels[k] = find(new RegExp('^wheel_' + k));
    rig.spins[k] = find(new RegExp('^spin_' + k));
    rig.wheels[k].userData.base = rig.wheels[k].position.clone();
  }
  if (rig.steering) rig.steering.userData.q0 = rig.steering.quaternion.clone();
  rig.drs.forEach(d => (d.userData.q0 = d.quaternion.clone()));
  rig.popups.forEach(p => (p.userData.q0 = p.quaternion.clone()));
  root.traverse(o => {
    if (o.userData && o.userData.tune_slot) rig.tune.push(o);
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const m = o.material; const n = m.name || '';
    for (const k of ["map", "emissiveMap"]) if (m[k]) m[k].anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (n.endsWith('_glass')) {
      o.material = new THREE.MeshPhysicalMaterial({ name: n, color: 0x0a0e12, metalness: 0, roughness: 0.03, transparent: true,
        opacity: 0.3, envMapIntensity: 1.4, depthWrite: false, side: THREE.DoubleSide });
      o.castShadow = false; o.renderOrder = 2;
      rig.mats.glass.push(o.material);
    } else if (/_(head|head_bright)$/.test(n)) rig.mats.head.push(m);
    else if (/_tail$/.test(n)) rig.mats.tail.push(m);
    else if (/_reverse$/.test(n)) rig.mats.rev.push(m);
    else if (/_glow$/.test(n)) rig.mats.glow.push(m);
    if (/_paint$/.test(n)) { rig.paint = m; m.userData.map0 = m.map; }
    // Rad-Materialien doppelseitig: ein Teil der Drehkörper (Reifenflanke, Felgenhorn)
    // hat nach außen gewandte Rückseiten und war von außen unsichtbar
    if (/_(tire|rim\d?|rim_dark|lip\d?|stripe\d?|disc|nut|caliper)$/.test(n)) m.side = THREE.DoubleSide;
    let p = o; let inEngine = false; while (p) { if (/^engine_o/.test(p.name)) inEngine = true; p = p.parent; }
    if (!inEngine && !n.endsWith('_glass')) rig.mats.body.push(o.material);
  });
  rig.mats.body = [...new Set(rig.mats.body)];
  for (const m of rig.mats.head) m.userData.e0 = m.emissiveIntensity;
  for (const m of rig.mats.tail) m.userData.e0 = m.emissiveIntensity;
  // Scheinwerferkegel + Unterbodenlicht (nur nachts / Licht an)
  const spots = [];
  for (const sx of [1, -1]) {
    const s = new THREE.SpotLight(0xe8f0ff, 0, 70, 0.42, 0.5, 1.4);
    s.position.set(sx * meta.W * 0.3, 0.7, meta.L * 0.46);
    s.target.position.set(sx * meta.W * 0.3, 0, meta.L * 0.46 + 20);
    rig.bodyRoot.add(s, s.target); spots.push(s);
  }
  rig.spots = spots;
  if (meta.underglow) {
    rig.under = new THREE.PointLight(meta.underglow, 0, 6, 1.5);
    rig.under.position.set(0, 0.12, 0); rig.bodyRoot.add(rig.under);
  }
  return rig;
}

async function selectCar(id) {
  const meta = fleet.find(f => f.id === id);
  if (!meta) return;
  $('#loading').classList.remove('hide'); $('#loading').textContent = `Lade ${meta.name} …`;
  const gltf = await loader.loadAsync(`models/${id}.glb`);
  if (car) { scene.remove(car.root); car.root.traverse(o => { if (o.isMesh) { o.geometry.dispose(); } }); }
  car = rigCar(gltf, meta);
  scene.add(car.root);
  const keep = vehicle ? { x: vehicle.pos.x, z: vehicle.pos.z, h: vehicle.heading } : { x: 60, z: LOOP.hz, h: -Math.PI / 2 };
  vehicle = new Vehicle(meta, ground);
  vehicle.reset(keep.x, keep.z, keep.h);
  if (!tuneState[id]) tuneState[id] = { wheels: 0, aero: 0, engine: 0, paint: 0, ride: 0, camber: meta.klass === 'Drift Missile' ? -4 : 0, track: 0 };
  applyTune();
  sound.setProfile(meta.sound);
  document.querySelectorAll('.card').forEach(c => c.classList.toggle('on', c.dataset.id === id));
  renderInfo(); renderTune(); renderGallery();
  setLights(lightsOn || night);
  setXray(xray);
  $('#loading').classList.add('hide');
  toast(`${meta.name} — ${meta.tagline}`, 3000);
}

// ------------------------------------------------------------------ Tuning
const STAGE_HP = [1, 1.22, 1.5];
function applyTune() {
  if (!car) return;
  const t = tuneState[car.meta.id];
  for (const o of car.tune) o.visible = o.userData.tune_opt === t[o.userData.tune_slot];
  vehicle.power = car.meta.hp * 745.7 * 0.92 * STAGE_HP[t.engine];
  vehicle.mu = 1.05 * (car.meta.grip ?? 1) * (1 + 0.03 * (t.aero === 2 ? 1 : 0));
  if (car.paint) {
    if (t.paint === 0) { car.paint.map = car.paint.userData.map0; car.paint.needsUpdate = true; }
    else texLoader.load(`textures/${car.meta.id}_paint${t.paint}.png`, (tx) => {
      tx.flipY = false; tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8;
      car.paint.map = tx; car.paint.needsUpdate = true;
    });
  }
}

function setLights(on) {
  if (!car) return;
  car.mats.head.forEach(m => (m.emissiveIntensity = on ? Math.max(4, m.userData.e0 * 3) : m.userData.e0 * 0.6));
  car.spots.forEach(s => (s.intensity = on ? 120 : 0));
  if (car.under) car.under.intensity = night ? 18 : 3;
  car.mats.glow.forEach(m => (m.emissiveIntensity = night ? 10 : 5));
}

function setXray(on) {
  xray = on;
  if (!car) return;
  for (const m of car.mats.body) {
    if (m.userData.op0 === undefined) m.userData.op0 = { t: m.transparent, o: m.opacity, d: m.depthWrite };
    m.transparent = on ? true : m.userData.op0.t;
    m.opacity = on ? 0.1 : m.userData.op0.o;
    m.depthWrite = on ? false : m.userData.op0.d;
    m.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ Eingaben
addEventListener('keydown', (e) => {
  if (e.target === $('#cmd')) return;
  keys[e.code] = true;
  sound.start();
  if (e.code === 'KeyC') cycleCam();
  if (e.code === 'KeyL') { lightsOn = !lightsOn; setLights(lightsOn || night); toast(lightsOn ? 'Licht an' : 'Licht aus'); }
  if (e.code === 'KeyX') { setXray(!xray); toast(xray ? 'Röntgenblick: Motor' : 'Röntgen aus'); }
  if (e.code === 'KeyR') resetCar();
  if (e.code === 'KeyM') { muted = !muted; toast(muted ? 'Ton aus' : 'Ton an'); }
  if (e.code === 'KeyG') cycleQuality();
  if (e.code === 'Enter') { e.preventDefault(); $('#cmd').focus(); }
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && AP.mode) {
    AP.mode = null; updateTags(); toast('Autopilot aus — du fährst');
  }
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('pointerdown', () => sound.start(), { once: false });
let look = { yaw: 0, pitch: 0, drag: false };
canvas.addEventListener('pointerdown', (e) => { look.drag = true; look.x = e.clientX; look.y = e.clientY; });
addEventListener('pointerup', () => (look.drag = false));
addEventListener('pointermove', (e) => {
  if (!look.drag || (camMode !== 'cockpit' && camMode !== 'hood')) return;
  look.yaw -= (e.clientX - look.x) * 0.004; look.pitch -= (e.clientY - look.y) * 0.003;
  look.pitch = Math.max(-0.6, Math.min(0.5, look.pitch)); look.yaw = Math.max(-2.2, Math.min(2.2, look.yaw));
  look.x = e.clientX; look.y = e.clientY;
});

function manualInput() {
  const up = keys.KeyW || keys.ArrowUp, dn = keys.KeyS || keys.ArrowDown;
  const l = keys.KeyA || keys.ArrowLeft, r = keys.KeyD || keys.ArrowRight;
  const fwd = vehicle.forwardSpeed;
  let throttle = up ? 1 : 0, brake = 0, reverse = false;
  if (dn) { if (fwd > 0.5) brake = 1; else { throttle = 1; reverse = true; } }
  if (up && fwd < -0.5) { brake = 1; throttle = 0; }
  return { throttle, brake, reverse, steer: (l ? 1 : 0) - (r ? 1 : 0), handbrake: !!keys.Space };
}

// ------------------------------------------------------------------ Autopilot
function pursuit(target, speedKmh) {
  const v = vehicle;
  const s = Math.sin(v.heading), c = Math.cos(v.heading);
  const dx = target.x - v.pos.x, dz = target.z - v.pos.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;      // Fahrzeugsystem: lx links, lz vorn
  const alpha = Math.atan2(lx, lz);
  const Ld = Math.max(Math.hypot(lx, lz), 1);
  const steer = Math.max(-1, Math.min(1, Math.atan2(2 * v.wb * Math.sin(alpha), Ld) / (Math.min(v.lock, 0.66) / (1 + v.speed / 12))));
  const err = speedKmh / 3.6 - v.forwardSpeed;
  return { steer, throttle: err > 0 ? Math.min(1, err * 0.35) : 0, brake: err < -2 ? Math.min(1, -err * 0.12) : 0, handbrake: false };
}
function nearestIdx() {
  let best = 0, bd = 1e9;
  for (let i = 0; i < path.length; i++) {
    const d = (path[i].x - vehicle.pos.x) ** 2 + (path[i].z - vehicle.pos.z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
function autopilot(dt) {
  AP.t += dt;
  const v = vehicle;
  const top = Math.min(v.vmax * 3.6 * 0.8, car.meta.klass === 'Formula' ? 170 : 120);
  if (AP.mode === 'drive' || AP.mode === 'jump') {
    const i = nearestIdx();
    const la = Math.round((6 + v.speed * 0.55) / (path.length ? 1.9 : 1));
    const tgt = path[(i + la) % path.length];
    // Kurvigkeit voraus → Zieltempo
    const a0 = path[(i + 5) % path.length], a1 = path[(i + 25) % path.length], a2 = path[(i + 45) % path.length];
    const turn = Math.abs(Math.atan2(a2.z - a1.z, a2.x - a1.x) - Math.atan2(a1.z - a0.z, a1.x - a0.x));
    const bend = Math.min(turn > Math.PI ? 2 * Math.PI - turn : turn, 1.2);
    let spd = top * (1 - bend * 0.55);
    if (Math.abs(v.pos.z - BUMPS.z) < 12 && v.pos.x > BUMPS.x0 - 10 && v.pos.x < BUMPS.x1 + 5) spd = Math.min(spd, 55);
    if (Math.abs(v.pos.z - RAMP.z) < 12 && v.pos.x > RAMP.x0 - 50 && v.pos.x < RAMP.x1 + 10) spd = Math.max(spd, 78);
    return pursuit(tgt, spd);
  }
  if (AP.mode === 'drift') {
    const dx = v.pos.x - DRIFT.x, dz = v.pos.z - DRIFT.z;
    const d = Math.hypot(dx, dz);
    if (AP.phase === 0 || d > DRIFT.r + 25) {
      // Tangential auf den Kreis setzen: ψ = 0 (vorwärts +Z), Mitte links → x = Mitte − R
      v.reset(DRIFT.x - (DRIFT.r - 2), DRIFT.z, 0);
      v.vel.z = 9; AP.phase = 1; AP.t = 0;
    }
    if (AP.phase === -1) {
      // zum Kreis fahren, tangential einlenken
      // Linkskreis (Gieren positiv) heißt fallender Polarwinkel atan2(dz, dx):
      // Position = Mitte − links·R = (−R cos ψ, R sin ψ) → θ = π − ψ. Mit +0.6
      // fuhr die Anfahrt im Uhrzeigersinn an und der Donut-Regler dagegen.
      const ang = Math.atan2(dz, dx) - 0.6;
      const tgt = { x: DRIFT.x + Math.cos(ang) * (DRIFT.r - 3), z: DRIFT.z + Math.sin(ang) * (DRIFT.r - 3) };
      if (d < DRIFT.r + 2 && v.speed > 8) { AP.phase = 1; AP.t = 0; }
      return pursuit(tgt, 34);
    }
    // Donut-Regler auf den Driftwinkel: im Linkskreis bricht das Heck nach
    // rechts aus, slipAngle wird negativ. Ziel ~35°: darunter Gas + Handbremse
    // tippen, darüber Gas lupfen und gegenlenken. Ein fester Einschlag ohne
    // Regler drehte sich in der ersten Fassung ein und blieb bei 5 km/h stehen.
    // Zweite Fassung: Gegenlenken = Vorderräder in Richtung der Vorderachs-
    // Geschwindigkeit stellen (plus etwas nach innen), den Winkel über das Gas
    // halten. Die erste gegenlenkte nur pauschal −0,35 — die Vorderräder
    // schoben dann quer und bremsten den Drift auf 7 km/h herunter.
    const beta = -(v.slipAngle || 0);
    const rwd = car.meta.drive === 'RWD';
    const sh = Math.sin(v.heading), ch = Math.cos(v.heading);
    const vx = v.vel.x * sh + v.vel.z * ch, vyL = v.vel.x * ch - v.vel.z * sh;
    const radial = Math.max(-0.2, Math.min(0.35, (d - (DRIFT.r - 3)) * 0.06));   // zu weit außen → mehr nach innen
    // Radiuskorrektur nur bei kleinem Winkel: beim Ausbrechen lenkte sie nach
    // innen und fraß das Gegenlenken auf (gemessen: 67° und Dreher)
    const want = Math.atan2(vyL + v.a * v.yawRate, Math.max(vx, 1)) + 0.04 + (beta < 0.3 ? radial : 0);
    const lockNow = v.lock / (1 + v.speed / 38);
    let steer = Math.max(-1, Math.min(1, want / v.lock));
    let throttle = Math.max(0.1, Math.min(1, 0.7 + 2.4 * (0.45 - beta))) * (v.speed > 12.5 ? 0.45 : v.speed > 10 ? 0.8 : 1);
    // Handbremse nur als einmaliger Einleit-Impuls; danach hält allein das Gas den Winkel
    let hb = (AP.t < 0.3 && v.speed > 9) || (!rwd && beta < 0.2 && v.speed > 9 && (AP.t % 1.2) < 0.2);
    if (v.speed < 7) { steer = 0.7; throttle = 1; hb = false; }

    return { steer, throttle, brake: 0, handbrake: hb, fullLock: true };
  }
  if (AP.mode === 'suspension') {
    if (v.pos.x < BUMPS.x0 - 10 || AP.t < 0.05) { v.reset(BUMPS.x1 + 20, BUMPS.z, -Math.PI / 2); AP.t = 0.06; }
    return { ...pursuit({ x: v.pos.x - 20, z: BUMPS.z }, 38) };
  }
  if (AP.mode === 'steer') {
    return { steer: Math.sin(AP.t * 1.3), throttle: 0, brake: 1, handbrake: false };
  }
  return { steer: 0, throttle: 0, brake: 1, handbrake: false };
}

// ------------------------------------------------------------------ Befehle
const CARS_ALIAS = { f1: 'hanami', formel: 'hanami', formula: 'hanami', kei: 'mame', starter: 'mame', truck: 'hauler', laster: 'hauler',
  ae86: 'hachi', '86': 'hachi', trueno: 'hachi', z: 'kaze', '350z': 'kaze', rx7: 'rotor', fd: 'rotor', r34: 'raiden', gtr: 'raiden',
  skyline: 'raiden', supra: 'suprema', impreza: 'kumo', rally: 'kumo', subaru: 'kumo', cruiser: 'yama', offroad: 'yama', landcruiser: 'yama' };
function command(raw) {
  const s = raw.trim().toLowerCase();
  if (!s) return;
  sound.start();
  const has = (...w) => w.some(x => s.includes(x));
  const num = (s.match(/\d/) || [])[0];
  const t = car && tuneState[car.meta.id];
  // Tuning direkt
  const slots = [['felge', 'wheels'], ['rad', 'wheels'], ['wheel', 'wheels'], ['aero', 'aero'], ['flügel', 'aero'], ['spoiler', 'aero'],
                 ['motor', 'engine'], ['engine', 'engine'], ['stufe', 'engine'], ['lack', 'paint'], ['farbe', 'paint'], ['paint', 'paint']];
  if (num && t) {
    for (const [w, slot] of slots) if (s.includes(w)) {
      const o = Math.max(0, Math.min(2, +num - 1)); t[slot] = o; applyTune(); renderTune(); renderInfo();
      return toast(`${slot === 'wheels' ? 'Felge' : slot === 'aero' ? 'Aero' : slot === 'engine' ? 'Motor' : 'Lack'} ${o + 1}: ${labelFor(slot, o)}`);
    }
  }
  // Auto wechseln
  for (const f of fleet) if (s.includes(f.id) || s.includes(f.name.toLowerCase().split(' ')[0])) return selectCar(f.id);
  for (const [a, id] of Object.entries(CARS_ALIAS)) if (s.split(/\s+/).includes(a)) return selectCar(id);
  if (has('hilfe', 'help', '?')) { $('#help').hidden = false; return; }
  if (has('grafik', 'graphic', 'qualit')) { if (has('niedrig', 'low', 'runter')) setQuality('niedrig'); else if (has('hoch', 'high')) setQuality('hoch'); else if (has('mittel', 'mid')) setQuality('mittel'); else return cycleQuality(); return toast(`Grafik: ${quality}`); }
  if (has('drift')) return startAP('drift', 'chase', 'Drift! Handbremse rein, Gas stehen lassen.');
  if (has('feder', 'suspension', 'fahrwerk', 'welle', 'bump')) return startAP('suspension', 'wheel', 'Federungstest über die Bodenwellen.');
  if (has('lenk', 'steer')) return startAP('steer', 'cockpit', 'Lenkung von Anschlag zu Anschlag.');
  if (has('spring', 'jump', 'schanze', 'sprung')) {
    vehicle.reset(RAMP.x0 - 70, RAMP.z, Math.PI / 2);
    vehicle.vel.x = 22; return startAP('jump', 'chase', 'Anlauf auf die Schanze …');
  }
  if (has('cockpit', 'fpv', 'innen', 'ego', 'first')) { setCam('cockpit'); if (!AP.mode) startAP('drive', 'cockpit', 'Ich-Perspektive, Autopilot fährt.'); return; }
  if (has('fahr', 'drive', 'los', 'go')) return startAP('drive', camMode === 'orbit' ? 'chase' : camMode, 'Autopilot fährt den Rundkurs.');
  if (has('stop', 'halt', 'anhalt', 'brems')) { AP.mode = 'stop'; updateTags(); return toast('Anhalten.'); }
  if (has('selbst', 'manuell', 'manual')) { AP.mode = null; updateTags(); return toast('Du fährst: W A S D, Leertaste = Handbremse'); }
  if (has('nacht', 'night', 'dunkel')) { night = true; applySky(); return toast('Nacht — Licht an!'); }
  if (has('tag', 'day', 'hell')) { night = false; applySky(); return toast('Tag'); }
  if (has('licht', 'light', 'scheinwerfer', 'popup')) { lightsOn = !lightsOn; setLights(lightsOn || night); return toast(lightsOn ? 'Licht an' : 'Licht aus'); }
  if (has('motor', 'engine', 'röntgen', 'xray')) { setXray(!xray); if (xray) setCam('orbit'); return toast(xray ? 'Röntgenblick auf den Motor' : 'Röntgen aus'); }
  if (has('tuning', 'tune')) { tab('tune'); return; }
  if (has('tiefer', 'lower')) { t.ride = Math.max(-0.06, t.ride - 0.02); renderTune(); return toast(`Tieferlegung ${Math.round(t.ride * 100)} cm`); }
  if (has('höher', 'hoch', 'higher', 'raise')) { t.ride = Math.min(0.06, t.ride + 0.02); renderTune(); return toast(`Höhe ${Math.round(t.ride * 100)} cm`); }
  if (has('sturz', 'camber', 'stance')) { t.camber = t.camber <= -6 ? 0 : t.camber - 3; renderTune(); return toast(`Sturz ${t.camber}°`); }
  if (has('kamera', 'camera', 'cam')) return cycleCam();
  if (has('showroom', 'orbit')) return setCam('orbit');
  if (has('reset', 'zurück')) return resetCar();
  if (has('ton', 'sound', 'mute')) { muted = !muted; return toast(muted ? 'Ton aus' : 'Ton an'); }
  toast(`Unbekannt: „${raw}“ — tippe „hilfe“`);
}
function startAP(mode, cam, msg) { AP.mode = mode; AP.t = 0; AP.phase = 0; setCam(cam); updateTags(); toast(msg); }
function labelFor(slot, o) {
  const T = car?.meta.tuning || {};
  const L = { wheels: T.wheels, aero: T.aero, paint: T.paints, engine: ['Serie', 'Street: Turbo + Ansaugung', 'Race: großer Turbo / ITB'] }[slot];
  return (L && L[o]) || `Option ${o + 1}`;
}
$('#cmdBar').addEventListener('submit', (e) => { e.preventDefault(); command($('#cmd').value); $('#cmd').value = ''; $('#cmd').blur(); });
document.querySelectorAll('[data-cmd]').forEach(b => b.addEventListener('click', () => command(b.dataset.cmd)));
$('#helpClose').addEventListener('click', () => ($('#help').hidden = true));

function resetCar() { vehicle.reset(60, LOOP.hz, -Math.PI / 2); toast('Zurück zum Start'); }

// ------------------------------------------------------------------ Kameras
const CAMS = ['chase', 'cockpit', 'hood', 'wheel', 'orbit'];
function cycleCam() { setCam(CAMS[(CAMS.indexOf(camMode) + 1) % CAMS.length]); }
function setCam(m) {
  camMode = m; orbit.enabled = m === 'orbit';
  look.yaw = 0; look.pitch = 0;
  if (m === 'orbit' && car) {
    const t = xray ? engineCenter() : new THREE.Vector3(vehicle.pos.x, vehicle.Y + 0.6, vehicle.pos.z);
    orbit.target.copy(t);
    camera.position.copy(t).add(xray ? new THREE.Vector3(1.6, 1.1, 1.8) : new THREE.Vector3(4.5, 1.4, 5));
  }
  if (car?.driver) car.driver.visible = m !== 'cockpit';
  camera.fov = m === 'cockpit' ? 72 : m === 'hood' ? 68 : 55; camera.updateProjectionMatrix();
  updateTags();
}
// Mitte des eingebauten Motors — Ziel des Röntgenblicks
function engineCenter() {
  const e = car.tune.find(o => o.userData.tune_slot === 'engine' && o.visible);
  if (!e) return new THREE.Vector3(vehicle.pos.x, vehicle.Y + 0.6, vehicle.pos.z);
  return new THREE.Box3().setFromObject(e).getCenter(new THREE.Vector3());
}
function updateTags() {
  $('#camTag').textContent = CAM_LABEL[camMode];
  $('#modeTag').textContent = MODE_LABEL[AP.mode] || (AP.mode === 'stop' ? 'Anhalten' : 'Selbst fahren');
}
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const chasePos = new THREE.Vector3(60, 3, 60);
function updateCamera(dt) {
  const v = vehicle;
  const fwd = new THREE.Vector3(Math.sin(v.heading), 0, Math.cos(v.heading));
  const L = car.meta.L;
  if (camMode === 'chase') {
    const vel = new THREE.Vector3(v.vel.x, 0, v.vel.z);
    const dir = vel.lengthSq() > 4 ? vel.normalize().lerp(fwd, 0.5).normalize() : fwd;
    const want = new THREE.Vector3(v.pos.x, v.Y, v.pos.z).addScaledVector(dir, -(L * 0.95 + 2.0)).add(new THREE.Vector3(0, 1.3 + car.meta.H * 0.35, 0));
    chasePos.lerp(want, 1 - Math.exp(-dt * 5));
    camera.position.copy(chasePos);
    camera.lookAt(v.pos.x + fwd.x * 2, v.Y + 0.9, v.pos.z + fwd.z * 2);
  } else if (camMode === 'cockpit' || camMode === 'hood') {
    car.eye.getWorldPosition(tmpV);
    car.bodyRoot.getWorldQuaternion(tmpQ);
    if (camMode === 'hood') tmpV.add(new THREE.Vector3(0, 0.18, 0)).addScaledVector(fwd, 1.1 + L * 0.1);
    camera.position.copy(tmpV);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(look.pitch - 0.06, Math.PI + look.yaw, 0, 'YXZ'));
    camera.quaternion.copy(tmpQ).multiply(q);
  } else if (camMode === 'wheel') {
    const w = car.wheels.FL; w.getWorldPosition(tmpV);
    const left = new THREE.Vector3(Math.cos(v.heading), 0, -Math.sin(v.heading));
    const want = tmpV.clone().addScaledVector(left, 1.9).addScaledVector(fwd, 1.2).add(new THREE.Vector3(0, -0.05, 0));
    want.y = Math.max(want.y, ground(want.x, want.z) + 0.25);
    camera.position.copy(want);
    camera.lookAt(tmpV.clone().addScaledVector(fwd, -0.9).add(new THREE.Vector3(0, 0.15, 0)));
  } else if (camMode === 'orbit') {
    orbit.target.lerp(xray ? engineCenter() : new THREE.Vector3(v.pos.x, v.Y + 0.6, v.pos.z), 1 - Math.exp(-dt * 4));
    orbit.update();
  }
}

// ------------------------------------------------------------------ Rauch
const SMOKE_N = 400;
const smokeGeo = new THREE.BufferGeometry();
const sPos = new Float32Array(SMOKE_N * 3), sLife = new Float32Array(SMOKE_N), sVel = new Float32Array(SMOKE_N * 3);
smokeGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
smokeGeo.setAttribute('life', new THREE.BufferAttribute(sLife, 1));
const smokeMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { uScale: { value: 400 }, uNight: { value: 0 } },
  vertexShader: 'attribute float life; varying float vL; uniform float uScale; void main(){ vL = life; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = uScale*(0.6+2.6*(1.0-life))/-mv.z; gl_Position = projectionMatrix*mv; }',
  fragmentShader: 'varying float vL; uniform float uNight; void main(){ vec2 d = gl_PointCoord-0.5; float r = dot(d,d); if (r>0.25) discard; float a = (1.0-r*4.0)*vL*0.33; gl_FragColor = vec4(vec3(mix(0.85,0.25,uNight)), a); }',
});
const smoke = new THREE.Points(smokeGeo, smokeMat); smoke.frustumCulled = false; scene.add(smoke);
let sHead = 0;
function updateSmoke(dt) {
  if (vehicle && vehicle.skid > 0.25 && vehicle.speed > 2) {
    const n = Math.ceil(vehicle.skid * 6);
    for (const k of ['RL', 'RR']) {
      car.wheels[k].getWorldPosition(tmpV);
      for (let i = 0; i < n; i++) {
        const j = sHead = (sHead + 1) % SMOKE_N;
        sPos[j * 3] = tmpV.x + (Math.random() - 0.5) * 0.3; sPos[j * 3 + 1] = tmpV.y - car.meta.r * 0.7; sPos[j * 3 + 2] = tmpV.z + (Math.random() - 0.5) * 0.3;
        sVel[j * 3] = (Math.random() - 0.5) * 1.2 - vehicle.vel.x * 0.05; sVel[j * 3 + 1] = 0.6 + Math.random() * 0.6; sVel[j * 3 + 2] = (Math.random() - 0.5) * 1.2 - vehicle.vel.z * 0.05;
        sLife[j] = 1;
      }
    }
  }
  for (let j = 0; j < SMOKE_N; j++) {
    if (sLife[j] <= 0) continue;
    sLife[j] -= dt * 0.45;
    sPos[j * 3] += sVel[j * 3] * dt; sPos[j * 3 + 1] += sVel[j * 3 + 1] * dt; sPos[j * 3 + 2] += sVel[j * 3 + 2] * dt;
    sVel[j * 3 + 1] *= 1 - dt * 0.5;
  }
  smokeGeo.attributes.position.needsUpdate = true; smokeGeo.attributes.life.needsUpdate = true;
  smokeMat.uniforms.uNight.value = night ? 1 : 0;
}

// ------------------------------------------------------------------ Rig bewegen
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
let popupT = 0;
function syncRig(dt, inp) {
  const v = vehicle, t = tuneState[car.meta.id];
  car.root.position.set(v.pos.x, v.Y, v.pos.z);
  car.root.rotation.set(0, v.heading, 0);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(v.pitch, 0, v.roll, 'XYZ'));
  const piv = new THREE.Vector3(0, v.cg, 0);
  car.bodyRoot.quaternion.copy(q);
  car.bodyRoot.position.copy(piv).sub(piv.clone().applyQuaternion(q)).add(new THREE.Vector3(0, t.ride, 0));
  const cam = THREE.MathUtils.degToRad(t.camber);
  v.wheels.forEach((w) => {
    const node = car.wheels[w.key];
    const b = node.userData.base;
    const side = w.x > 0 ? 1 : -1;
    node.position.set(b.x + side * t.track, w.y - v.Y, b.z);
    const st = w.front ? v.steer : 0;
    node.rotation.set(0, st, -side * cam * (w.front ? 0.8 : 1), 'YXZ');
    car.spins[w.key].rotation.x = w.spin;
  });
  if (car.steering) {
    // Achse lokal +Y zeigt zum Fahrer: positiver Winkel = aus Fahrersicht gegen den Uhrzeigersinn = links
    tmpQ.setFromAxisAngle(Y, v.steer * Math.min(12, 9.4 / v.lock));
    car.steering.quaternion.copy(car.steering.userData.q0).multiply(tmpQ);
  }
  // Klappscheinwerfer
  const wantUp = (lightsOn || night) ? 1 : 0;
  popupT += (wantUp - popupT) * Math.min(1, dt * 5);
  for (const p of car.popups) { tmpQ.setFromAxisAngle(X, -1.05 * popupT); p.quaternion.copy(p.userData.q0).multiply(tmpQ); }
  // DRS: offen bei Vollgas geradeaus
  const drsOpen = inp.throttle > 0.9 && v.speed > 30 && Math.abs(v.steer) < 0.05 ? 1 : 0;
  car.drsT = (car.drsT || 0) + (drsOpen - (car.drsT || 0)) * Math.min(1, dt * 6);
  for (const d of car.drs) { tmpQ.setFromAxisAngle(X, 0.6 * car.drsT); d.quaternion.copy(d.userData.q0).multiply(tmpQ); }
  // Querlenker (Formel): Innenpunkt am Aufbau, Außenpunkt am Radträger
  if (car.arms.length) {
    car.bodyRoot.updateMatrix();
    for (const a of car.arms) {
      const ud = a.userData;
      if (!ud._in) { ud._in = new THREE.Vector3(...JSON.parse(ud.arm_in)); ud._out = new THREE.Vector3(...JSON.parse(ud.arm_out)); }
      const wn = car.wheels[ud.arm_wheel];
      const pin = ud._in.clone().applyMatrix4(car.bodyRoot.matrix);
      const pout = ud._out.clone().applyAxisAngle(Y, ud.arm_wheel[0] === 'F' ? v.steer : 0).add(wn.position);
      const d = pout.sub(pin); const len = d.length();
      a.position.copy(pin);
      a.quaternion.setFromUnitVectors(X, d.normalize());
      a.scale.set(len, 1, 0.55);
    }
  }
  // Bremslicht
  const braking = inp.brake > 0.1 || inp.handbrake;
  car.mats.tail.forEach(m => (m.emissiveIntensity = (braking ? 6 : (lightsOn || night ? 1.6 : 0.5)) * Math.max(1, m.userData.e0 * 0.8)));
  car.mats.rev.forEach(m => (m.emissiveIntensity = inp.reverse ? 4 : 0.15));
}

// ------------------------------------------------------------------ Oberfläche
function tab(name) {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.id === 'tab-' + name));
}
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => tab(b.dataset.tab)));

function renderList() {
  $('#carList').innerHTML = fleet.map(f => `
    <button class="card" data-id="${f.id}">
      <img src="renders/${f.id}_hero.png" onerror="this.src='renders/_chk_${f.id}_hero.png'" alt="" loading="lazy" />
      <div><div class="n">${f.name}</div><div class="k">${f.klass} · <b>${f.hp} PS</b> · ${f.drive}</div></div>
    </button>`).join('');
  document.querySelectorAll('.card').forEach(c => c.addEventListener('click', () => { sound.start(); selectCar(c.dataset.id); }));
}
function stats(m, t) {
  const pw = m.hp * STAGE_HP[t.engine] / m.kg * 1000;
  return [['Leistung', Math.min(1, pw / 900)], ['Grip', Math.min(1, (m.grip ?? 1) / 1.6)], ['Drift', m.drift ?? 0.5],
          ['Gelände', m.klass === 'Offroad' ? 0.95 : m.klass === 'Rally' ? 0.8 : m.klass === 'Utility' ? 0.6 : 0.25],
          ['Tempo', Math.min(1, (m.top_kmh ?? 200) / 345)]];
}
function renderInfo() {
  const m = car.meta, t = tuneState[m.id];
  $('#tab-info').innerHTML = `
    <div class="maker">${m.maker}</div>
    <div class="title">${m.name}</div>
    <span class="klass">${m.klass}</span>
    <div class="tag">${m.tagline}</div>
    <div class="specs">
      <div class="spec"><b>${Math.round(m.hp * STAGE_HP[t.engine])}</b><span>PS${t.engine ? ' (getunt)' : ''}</span></div>
      <div class="spec"><b>${m.kg}</b><span>kg</span></div>
      <div class="spec"><b>${m.drive}</b><span>Antrieb</span></div>
      <div class="spec"><b>${m.top_kmh}</b><span>km/h Spitze</span></div>
      <div class="spec"><b>${m.L.toFixed(2)} m</b><span>Länge</span></div>
      <div class="spec"><b>${m.lock}°</b><span>Lenkeinschlag</span></div>
    </div>
    <div class="bars">${stats(m, t).map(([n, v]) => `<div class="bar">${n}<i style="--v:${Math.round(v * 100)}%"></i>${Math.round(v * 100)}</div>`).join('')}</div>
    <div class="inspo">Inspiration: ${m.inspo}<br/>Animiert: Federung, Lenkung, Lenkrad, Bremslicht${m.popups ? ', Klappscheinwerfer' : ''}${m.drs ? ', DRS-Klappe, Querlenker' : ''}${m.underglow ? ', Unterbodenlicht' : ''}</div>`;
}
function renderTune() {
  const m = car.meta, t = tuneState[m.id], T = m.tuning || {};
  const slot = (key, title, labels, sw) => `
    <div class="slot"><h4>${title}</h4><div class="opts">
      ${[0, 1, 2].map(o => `<button class="opt ${t[key] === o ? 'on' : ''}" data-slot="${key}" data-o="${o}">
        <span class="num">${o + 1}</span>${sw ? `<span class="sw" style="background:${sw[o] || '#888'}"></span>` : ''}${labels?.[o] || labelFor(key, o)}</button>`).join('')}
    </div></div>`;
  $('#tab-tune').innerHTML =
    slot('wheels', 'Felgen & Reifen', T.wheels) +
    slot('aero', 'Aero', T.aero) +
    slot('engine', `Motor (${T.engine || '—'})`, ['Serie', 'Street: Turbo + Ansaugung', 'Race: großer Turbo / ITB / LLK']) +
    slot('paint', 'Lackierung', T.paints, T.paint_hex) +
    `<div class="slot"><h4>Fahrwerk</h4>
      <label class="slider">Höhe<input type="range" min="-6" max="6" step="1" value="${Math.round(t.ride * 100)}" data-k="ride" /><span>${Math.round(t.ride * 100)} cm</span></label>
      <label class="slider">Sturz<input type="range" min="-9" max="2" step="0.5" value="${t.camber}" data-k="camber" /><span>${t.camber}°</span></label>
      <label class="slider">Spur<input type="range" min="0" max="5" step="0.5" value="${t.track * 100}" data-k="track" /><span>+${(t.track * 100).toFixed(1)} cm</span></label>
    </div>
    <div class="slot"><h4>Ansicht</h4><div class="opts">
      <button class="opt" data-act="xray">${xray ? 'Röntgen aus' : 'Motor ansehen (Röntgen)'}</button>
      <button class="opt" data-act="wheelcam">Rad-Kamera</button></div></div>`;
  document.querySelectorAll('#tab-tune [data-slot]').forEach(b => b.addEventListener('click', () => {
    t[b.dataset.slot] = +b.dataset.o; applyTune(); renderTune(); renderInfo();
    if (b.dataset.slot === 'engine' && !xray) toast('Tipp: „motor“ für den Röntgenblick');
  }));
  document.querySelectorAll('#tab-tune input[type=range]').forEach(r => r.addEventListener('input', () => {
    const k = r.dataset.k; t[k] = k === 'camber' ? +r.value : +r.value / 100;
    r.nextElementSibling.textContent = k === 'camber' ? `${t[k]}°` : k === 'ride' ? `${Math.round(t[k] * 100)} cm` : `+${(t[k] * 100).toFixed(1)} cm`;
  }));
  document.querySelectorAll('#tab-tune [data-act]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.act === 'xray') { setXray(!xray); if (xray) setCam('orbit'); renderTune(); }
    else setCam('wheel');
  }));
}
function renderGallery() {
  const id = car.meta.id;
  const shots = ['hero', 'rear', 'side', 'cockpit'].map(s => `renders/${id}_${s}.png`);
  const extra = ['wheel0', 'wheel1', 'wheel2', 'engine0', 'engine1', 'engine2'].map(s => `renders/_t_${id}_${s}.png`);
  $('#tab-gallery').innerHTML = `<div class="gal">${[...shots, ...extra].map(p => `<img src="${p}" onerror="this.remove()" alt="" />`).join('')}</div>`;
  document.querySelectorAll('.gal img').forEach(i => i.addEventListener('click', () => { $('#lightbox img').src = i.src; $('#lightbox').hidden = false; }));
}
$('#lightbox').addEventListener('click', () => ($('#lightbox').hidden = true));

// ------------------------------------------------------------------ Schleife
let lowFps = 0;
function setQuality(q) {
  quality = q; const Q = QUALITY[q];
  try { localStorage.setItem("carlab.quality", q); } catch { /* privat */ }
  renderer.setPixelRatio(Q.pr());
  renderer.shadowMap.enabled = Q.shadows; sun.castShadow = Q.shadows;
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  sun.shadow.mapSize.set(Q.map, Q.map);
  // Schatten an/aus ändert die Shader — Materialien neu übersetzen lassen
  scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => (m.needsUpdate = true)); });
  resize();
}
function cycleQuality() { setQuality({ hoch: "mittel", mittel: "niedrig", niedrig: "hoch" }[quality]); toast(`Grafik: ${quality}`); }
function resize() {
  // Ein ausgeblendeter Vorschau-Tab meldet 0 × 0 (CLAUDE.md P19) — dann 720p annehmen
  const r = canvas.getBoundingClientRect();
  const w = r.width || 1280, h = r.height || 720;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  smokeMat.uniforms.uScale.value = h * 0.9;
}
addEventListener('resize', resize);
let last = performance.now(), fpsAcc = 0, fpsN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  advance(dt);
}
// Ein Schritt Simulation + Bild. Die eingebettete Vorschau liefert kein rAF —
// carlab.tick() treibt die Schleife dann von Hand (CLAUDE.md, „Der Messlauf“).
function advance(dt) {
  if (car && vehicle) {
    const inp = AP.mode ? autopilot(dt) : manualInput();
    vehicle.step(dt, inp);
    syncRig(dt, inp);
    updateCamera(dt);
    updateSmoke(dt);
    sun.position.set(vehicle.pos.x + 30, vehicle.Y + 50, vehicle.pos.z + 20);
    sun.target.position.set(vehicle.pos.x, vehicle.Y, vehicle.pos.z);
    sound.update(vehicle.rpm, inp.throttle || 0, vehicle.redline, muted || document.hidden);
    $('#kmh').textContent = Math.round(Math.abs(vehicle.forwardSpeed) * 3.6);
    $('#gear').textContent = vehicle.forwardSpeed < -0.5 ? 'R' : vehicle.gear;
    $('#rpmBar').style.width = `${Math.min(100, vehicle.rpm / vehicle.redline * 100)}%`;
  }
  renderer.render(scene, camera);
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) {
    const fps = fpsN / fpsAcc;
    $("#fps").textContent = `${Math.round(fps)} fps · ${quality}`;
    // Automatisch herunterschalten, wenn es zweimal hintereinander ruckelt
    lowFps = fps < 28 ? lowFps + 1 : 0;
    if (lowFps >= 2 && quality !== "niedrig") { setQuality(quality === "hoch" ? "mittel" : "niedrig"); toast(`Grafik automatisch auf „${quality}“ — Taste G zum Wechseln`); lowFps = 0; }
    fpsAcc = 0; fpsN = 0;
  }
}

async function boot() {
  setQuality(quality);
  applySky();
  fleet = await (await fetch('web/fleet.json')).json();
  renderList();
  await selectCar(new URLSearchParams(location.search).get('car') || 'kaze');
  setCam('orbit');
  requestAnimationFrame(frame);
  window.carlab = { command, selectCar, get vehicle() { return vehicle; }, get car() { return car; }, tuneState, setCam, AP,
    tick(n = 60, dt = 1 / 60) { for (let i = 0; i < n; i++) advance(dt); },
    shot(w = 1280, h = 720) {
      // Festes 16:9, unabhängig davon, wie schmal das Vorschaufenster gerade ist
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); smokeMat.uniforms.uScale.value = h * 0.9;
      advance(1 / 60);
      const url = canvas.toDataURL("image/jpeg", 0.88);
      resize();
      return url;
    } };
}
boot();
