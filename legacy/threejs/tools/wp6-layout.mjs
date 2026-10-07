// WP6: benannte Trassen. Das alte Stadtplateau bleibt ein eigener Kern.
export const ORCHARD_BYPASS = [
  [272, 856], [40, 650], [-120, 500], [-550, 530], [-820, 540], [-1010, 510], [-986, 458],
];

// Eine echte Tangente über 900 m; Kurven werden nicht von der Geraden abgezogen.
export function needlePoints() {
  const p = [];
  for (let x = -1060; x < -160; x += 15) p.push([x, 855]);
  for (let i = 0; i < 24; i++) {
    const a = Math.PI / 2 - i * Math.PI / 24;
    p.push([-160 + 55 * Math.cos(a), 800 + 55 * Math.sin(a)]);
  }
  for (let i = 0; i < 60; i++) {
    const t = i / 60;
    p.push([-160 - 900 * t, 745 - 75 * Math.sin(Math.PI * t) ** 2 + 18 * Math.sin(4 * Math.PI * t) * Math.sin(Math.PI * t) ** 2]);
  }
  for (let i = 0; i < 24; i++) {
    const a = -Math.PI / 2 - i * Math.PI / 24;
    p.push([-1060 + 55 * Math.cos(a), 800 + 55 * Math.sin(a)]);
  }
  return p;
}

// Neo-Tokio (docs/TOKYO.md): nur noch das **Außennetz**. Routen, die durch den
// neuen 1-km-Kern liefen (crosslight-avenue, lantern-avenue, cinema-lane,
// hotel-walk, old-neon-*, east-lantern-02…09, …), sind entfernt oder enden als
// `EDGE_ROUTES` (src/config/tokyoLayout.mjs) am Kernrand. Im Kern gilt das
// Raster `GRID_STREETS`.
export const URBAN_ROUTES = [
  ['east-lantern-road', 11, [[1410,240],[1420,-160],[1290,-360],[1100,-420]]],
  ['beacon-road', 9, [[1100,-420],[1400,-430],[1450,-540],[1120,-580],[1100,-700],[1420,-700],[1450,-810],[1180,-870]]],
  ['bellwood-edge', 9, [[620,-380],[480,-450],[220,-450],[160,-540],[420,-580],[530,-680],[300,-740],[180,-880],[490,-900]]],
  ['west-works-road', 11, [[80,160],[20,-60],[40,-300],[160,-540]]],
  ['hill-steps-west', 9, [[40,-300],[260,-330],[480,-450]]],
  ['east-lantern-05', 9, [[1160,620],[1230,790],[1420,820],[1450,620],[1340,460]]],
  ['south-market-02', 9, [[290,480],[100,580],[100,800],[280,850],[440,850]]],
  ['south-market-03', 9, [[100,580],[180,280]]],
  ['west-works-04', 9, [[40,-300],[180,-160],[170,-20],[180,280]]],
  ['east-lantern-10', 9, [[1160,620],[1370,630],[1450,620]]],
  ['south-market-04', 9, [[100,580],[310,650]]],
  ['south-market-05', 9, [[100,800],[310,650],[470,740]]],
  ['needle-approach', 11, [[180,280],[100,420],[-50,520],[-250,560],[-350,585],[-550,530]]],
];

export function inUrbanEnvelope(x, z) {
  return x >= -80 && x <= 1490 && z >= -1000 && z <= 960 &&
    !(x >= 620 && x <= 1040 && z <= -520) &&
    !(x >= 560 && x <= 1040 && z >= 780) &&
    Math.hypot(x - 550, z - 510) >= 180;
}
