import * as THREE from 'three';

// Eine Höhenfunktion für Bild UND Physik — zwei Quellen für dieselbe Fläche
// wären genau der Fehler aus CLAUDE.md P21 (Fahrbahn aus fremder Fläche).
export const LOOP = { hx: 95, hz: 55, r: 32 };        // Rundkurs: abgerundetes Rechteck
export const BUMPS = { x0: -40, x1: 10, z: LOOP.hz, halfW: 9 };
export const RAMP = { x0: 18, x1: 30, z: -LOOP.hz, halfW: 7, h: 0.95 };
export const DRIFT = { x: 0, z: 0, r: 16 };

export function ground(x, z) {
  let y = 0;
  // Bodenwellen auf der oberen Geraden: Welle 3,2 m, 7 cm — genug, damit man die Federn arbeiten sieht
  if (x > BUMPS.x0 && x < BUMPS.x1 && Math.abs(z - BUMPS.z) < BUMPS.halfW) {
    const edge = Math.min(1, (x - BUMPS.x0) / 3, (BUMPS.x1 - x) / 3);
    y += 0.07 * edge * (0.5 - 0.5 * Math.cos((x - BUMPS.x0) * 2 * Math.PI / 3.2));
  }
  // Schanze auf der unteren Geraden (Fahrtrichtung +X): Anlauf steigt, dann Kante
  if (x > RAMP.x0 && x < RAMP.x1 && Math.abs(z - RAMP.z) < RAMP.halfW) {
    const t = (x - RAMP.x0) / (RAMP.x1 - RAMP.x0);          // Fahrtrichtung +X: 0 am Anlauf, 1 an der Kante
    const side = Math.min(1, (RAMP.halfW - Math.abs(z - RAMP.z)) / 1.2);
    y += RAMP.h * Math.pow(t, 1.6) * side;
  }
  // sanfte Hügel außerhalb des Platzes
  const d = Math.max(Math.abs(x) - 150, Math.abs(z) - 110, 0);
  if (d > 0) y += Math.min(d * 0.18, 30) * (0.7 + 0.3 * Math.sin(x * 0.03) * Math.cos(z * 0.04));
  return y;
}

function loopPoint(t) {
  // Umlauf gegen den Uhrzeigersinn (von oben), t ∈ [0,1)
  const { hx, hz, r } = LOOP;
  const sx = hx - r, sz = hz - r;
  const segs = [2 * sx, Math.PI * r / 2, 2 * sz, Math.PI * r / 2, 2 * sx, Math.PI * r / 2, 2 * sz, Math.PI * r / 2];
  const total = segs.reduce((a, b) => a + b, 0);
  let d = ((t % 1) + 1) % 1 * total;
  const corners = [[sx, sz], [-sx, sz], [-sx, -sz], [sx, -sz]];
  // Start: untere Gerade bei (+sx, -hz) Richtung −X?  Wir laufen: oben nach −X, links nach −Z, unten nach +X, rechts nach +Z
  const path = [
    (u) => [sx - u, hz], (u) => arc(-sx, sz, u / r + Math.PI / 2),
    (u) => [-hx, sz - u], (u) => arc(-sx, -sz, u / r + Math.PI),
    (u) => [-sx + u, -hz], (u) => arc(sx, -sz, u / r + Math.PI * 1.5),
    (u) => [hx, -sz + u], (u) => arc(sx, sz, u / r),
  ];
  function arc(cx, cz, a) { return [cx + r * Math.cos(a), cz + r * Math.sin(a)]; }
  for (let i = 0; i < 8; i++) {
    if (d <= segs[i]) return path[i](d);
    d -= segs[i];
  }
  return path[0](0);
}
export function loopPath(n = 240) {
  const pts = [];
  for (let i = 0; i < n; i++) { const [x, z] = loopPoint(i / n); pts.push({ x, z }); }
  return pts;
}

function asphaltTexture() {
  const S = 2048, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#3a3c3f'; g.fillRect(0, 0, S, S);
  const img = g.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const W = 400, px = S / W;
  const P = (x, z) => [(x + W / 2) * px, (W / 2 - z) * px];
  // Rundkurs: dunkleres Band + Randlinien
  const pts = loopPath(400);
  const stroke = (w, col, dash) => {
    g.beginPath(); pts.forEach((p, i) => { const [a, b] = P(p.x, p.z); i ? g.lineTo(a, b) : g.moveTo(a, b); });
    g.closePath(); g.lineWidth = w * px; g.strokeStyle = col; g.setLineDash(dash || []); g.stroke();
  };
  stroke(15, '#2b2d30'); stroke(14.4, '#303235');
  stroke(0.25, '#e8e8e8', [3 * px, 3 * px]);
  const off = (o, col) => {
    g.beginPath(); pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length]; const dx = q.x - p.x, dz = q.z - p.z; const L = Math.hypot(dx, dz) || 1;
      const [a, b] = P(p.x - dz / L * o, p.z + dx / L * o); i ? g.lineTo(a, b) : g.moveTo(a, b);
    }); g.closePath(); g.lineWidth = 0.3 * px; g.strokeStyle = col; g.setLineDash([]); g.stroke();
  };
  off(7, '#f2f2f2'); off(-7, '#f2f2f2');
  // Driftkreis
  const [cx, cz] = P(DRIFT.x, DRIFT.z);
  g.setLineDash([]); g.lineWidth = 0.35 * px; g.strokeStyle = '#ff5fa8';
  g.beginPath(); g.arc(cx, cz, DRIFT.r * px, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#ffffff'; g.beginPath(); g.arc(cx, cz, (DRIFT.r - 5) * px, 0, Math.PI * 2); g.stroke();
  // Reifenspuren im Kreis
  g.globalAlpha = 0.12; g.strokeStyle = '#111';
  for (let i = 0; i < 40; i++) {
    g.lineWidth = (0.2 + Math.random() * 0.2) * px;
    g.beginPath(); g.arc(cx + (Math.random() - 0.5) * 20, cz + (Math.random() - 0.5) * 20, (8 + Math.random() * 8) * px, Math.random() * 6, Math.random() * 6 + 3); g.stroke();
  }
  g.globalAlpha = 1;
  // Start/Ziel-Schachbrett
  const [sx0, sz0] = P(60, LOOP.hz - 7);
  for (let i = 0; i < 14; i++) for (let j = 0; j < 2; j++) {
    g.fillStyle = (i + j) % 2 ? '#111' : '#eee';
    g.fillRect(sx0 + j * px, sz0 + i * px, px, px);
  }
  // Schanze und Wellen markieren
  g.fillStyle = 'rgba(255,200,40,0.9)';
  const [rx, rz] = P(RAMP.x1, RAMP.z + RAMP.halfW);
  g.fillRect(rx - 0.4 * px, rz, 0.8 * px, RAMP.halfW * 2 * px);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function detailTexture() {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'); const img = g.createImageData(S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 70;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(160, 160);
  return t;
}

export function buildWorld(scene) {
  const W = 400, N = 400;
  const geo = new THREE.PlaneGeometry(W, W, N, N);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, ground(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.92, roughnessMap: detailTexture(), metalness: 0 });
  const floor = new THREE.Mesh(geo, mat);
  floor.receiveShadow = true;
  scene.add(floor);
  // Gras jenseits des Platzes
  const grassGeo = new THREE.RingGeometry(200, 900, 64, 1); grassGeo.rotateX(-Math.PI / 2);
  const grass = new THREE.Mesh(grassGeo, new THREE.MeshStandardMaterial({ color: 0x4d6b3a, roughness: 1 }));
  grass.position.y = -0.05; scene.add(grass);

  // Pylonen am Kurs + Schanzenflanken
  const cone = new THREE.ConeGeometry(0.22, 0.7, 12); cone.translate(0, 0.35, 0);
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xff5a1a, roughness: 0.6 });
  const pts = loopPath(80);
  const cones = new THREE.InstancedMesh(cone, coneMat, pts.length * 2);
  const m = new THREE.Matrix4(); let k = 0;
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length]; const dx = q.x - p.x, dz = q.z - p.z; const L = Math.hypot(dx, dz) || 1;
    for (const o of [9, -9]) { const x = p.x - dz / L * o, z = p.z + dx / L * o; m.makeTranslation(x, ground(x, z), z); cones.setMatrixAt(k++, m); }
  });
  cones.castShadow = true; scene.add(cones);

  // Schanze sichtbar machen: gelb-schwarze Kante
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.3, RAMP.h, RAMP.halfW * 2),
    new THREE.MeshStandardMaterial({ color: 0x222222 }));
  edge.position.set(RAMP.x1 + 0.15, RAMP.h / 2, RAMP.z); scene.add(edge);

  // Reifenstapel an den Ecken
  const tire = new THREE.TorusGeometry(0.33, 0.13, 8, 16); tire.rotateX(Math.PI / 2);
  const tires = new THREE.InstancedMesh(tire, new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }), 120);
  k = 0;
  for (const [cx, cz] of [[LOOP.hx + 12, LOOP.hz + 12], [-LOOP.hx - 12, LOOP.hz + 12], [-LOOP.hx - 12, -LOOP.hz - 12], [LOOP.hx + 12, -LOOP.hz - 12]]) {
    for (let i = 0; i < 10; i++) for (let j = 0; j < 3; j++) {
      m.makeTranslation(cx + (i - 5) * 0.8 * Math.sign(cz), 0.13 + j * 0.26, cz + (i - 5) * 0.8 * Math.sign(cx) * 0.3);
      tires.setMatrixAt(k++, m);
    }
  }
  tires.count = k; tires.castShadow = true; scene.add(tires);

  // Kirschbäume + Nadelbäume rundherum
  const trunkG = new THREE.CylinderGeometry(0.2, 0.3, 3, 6); trunkG.translate(0, 1.5, 0);
  const blossomG = new THREE.IcosahedronGeometry(2.4, 1); blossomG.translate(0, 4, 0);
  const pineG = new THREE.ConeGeometry(2.2, 7, 7); pineG.translate(0, 5, 0);
  const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: 0x4a3326 }), 260);
  const blossoms = new THREE.InstancedMesh(blossomG, new THREE.MeshStandardMaterial({ color: 0xf6b3cf, roughness: 0.9, flatShading: true }), 130);
  const pines = new THREE.InstancedMesh(pineG, new THREE.MeshStandardMaterial({ color: 0x2f4a2c, roughness: 1, flatShading: true }), 130);
  let bi = 0, pi = 0, ti = 0;
  const rng = mulberry(7);
  for (let i = 0; i < 260; i++) {
    const a = rng() * Math.PI * 2, rr = 175 + rng() * 120;
    const x = Math.cos(a) * rr * 1.1, z = Math.sin(a) * rr * 0.8;
    const y = ground(x, z);
    const s = 0.8 + rng() * 0.7;
    m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
    trunks.setMatrixAt(ti++, m);
    if (i % 2 === 0 && bi < 130) blossoms.setMatrixAt(bi++, m); else if (pi < 130) pines.setMatrixAt(pi++, m);
  }
  blossoms.count = bi; pines.count = pi;
  for (const o of [trunks, blossoms, pines]) { o.castShadow = true; scene.add(o); }

  // Torii am Start
  const red = new THREE.MeshStandardMaterial({ color: 0xc8261e, roughness: 0.5 });
  const torii = new THREE.Group();
  for (const x of [-9, 9]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 7.5, 12), red); p.position.set(x, 3.75, 0); torii.add(p); }
  const top = new THREE.Mesh(new THREE.BoxGeometry(22, 0.7, 0.9), new THREE.MeshStandardMaterial({ color: 0x1a1a1a })); top.position.y = 7.8; torii.add(top);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(20, 0.5, 0.6), red); beam.position.y = 6.4; torii.add(beam);
  torii.position.set(55, 0, LOOP.hz); torii.rotation.y = Math.PI / 2;
  torii.traverse(o => { if (o.isMesh) o.castShadow = true; });
  scene.add(torii);

  // Laternenmasten (leuchten nachts)
  const lamps = [];
  const poleG = new THREE.CylinderGeometry(0.12, 0.15, 8, 8); poleG.translate(0, 4, 0);
  const headM = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd9a0, emissiveIntensity: 0 });
  for (let i = 0; i < 12; i++) {
    const p = pts[Math.floor(i * pts.length / 12)];
    const q = pts[(Math.floor(i * pts.length / 12) + 1) % pts.length];
    const dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz) || 1;
    const x = p.x - dz / L * 12, z = p.z + dx / L * 12;
    const pole = new THREE.Mesh(poleG, new THREE.MeshStandardMaterial({ color: 0x333333 }));
    pole.position.set(x, ground(x, z), z); scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 0.4), headM); head.position.set(x, 8, z); scene.add(head);
    const L2 = new THREE.PointLight(0xffd9a0, 0, 40, 1.6); L2.position.set(x, 7.6, z); scene.add(L2);
    lamps.push(L2);
  }
  return { floor, lamps, lampMat: headM };
}

export function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
