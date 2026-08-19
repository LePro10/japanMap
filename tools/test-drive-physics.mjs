/**
 * Reproduzierbare Prüfung der gelieferten Physikfunktionen — nicht einer Kopie.
 *
 * Läuft gegen `src/game/supportPlane.ts` und `src/game/breakables.ts`.
 *   node --experimental-strip-types tools/test-drive-physics.mjs
 */

import {
  RAIL_BREAK_ENERGY,
  RAIL_BREAK_SPEED,
  TREE_BREAK_ENERGY,
  TREE_BREAK_SPEED,
  shouldBreak,
  treeKey,
} from '../src/game/breakables.ts';
import {
  DEEP_PENETRATION,
  STEEP_NY,
  UNSUPPORTED_DROP,
  isSteep,
  reachableSupport,
  reachableWheel,
  resolveTerrainFollow,
  supportHeight,
} from '../src/game/supportPlane.ts';

const MASS = 1150;
let failed = 0;

function check(name, ok, detail = '') {
  if (ok) {
    console.log(`  ✓  ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failed++;
    console.log(`  ✗  ${name}${detail ? `  — ${detail}` : ''}`);
  }
}

function near(a, b, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

console.log('Stützebene');
check('eben', near(supportHeight(0, 0, 0, 0), 0));
check('eine Spitze hebt nicht', near(supportHeight(0, 0, 0, 10), 0), supportHeight(0, 0, 0, 10).toFixed(4));
check('ein Loch senkt nicht', near(supportHeight(0, 0, 0, -10), 0));
check('zwei mittlere von 1,2,3,4', near(supportHeight(1, 2, 3, 4), 2.5));
check('Reihenfolge egal', near(supportHeight(4, 1, 3, 2), 2.5));
check(
  'Mittel von vier wäre 2,5 — eine Spitze auf 10 wäre 3,25',
  near(supportHeight(0, 0, 0, 10), 0) && !near((0 + 0 + 0 + 10) / 4, 0),
);

console.log('Erreichbare Stütze');
const reach = 0.54;
check('eben, alle in Reichweite', near(reachableSupport(0, 0, 0, 0, 0, reach), 0));
check('eine Spitze trägt nicht', near(reachableSupport(0, 0, 0, 1.2, 0, reach), 0));
check('ein Loch trägt nicht', near(reachableSupport(0, 0, 0, -1.2, 0, reach), 0));
check('Absatz 40 m, Auto unten', near(reachableSupport(0, 0, 40, 40, 0, reach), 0));
check('Absatz 40 m, Auto oben', near(reachableSupport(0, 0, 40, 40, 40, reach), 40));
check(
  'kein Rad erreichbar → fallen, nicht schweben',
  near(reachableSupport(40, 40, 40, 40, 0, reach), -UNSUPPORTED_DROP),
);
check('unerreichbares Rad zählt flach', near(reachableWheel(40, 0, reach), 0));
check('erreichbares Rad bleibt', near(reachableWheel(0.1, 0, reach), 0.1));

console.log('Steilhang');
check(`STEEP_NY = ${STEEP_NY} (38,7°)`, STEEP_NY === 0.78);
check('Straße 23° ist kein Steilhang', !isSteep(Math.cos((23.3 * Math.PI) / 180)));
check('40° ist eine Wand', isSteep(Math.cos((40 * Math.PI) / 180)));

const gentle = { x: 0, y: -0.4, z: 0, vx: 8, vy: -2, vz: 0 };
const g = resolveTerrainFollow(gentle, 0, 0, 1, 0, 0.155, 0.25);
check('flach: Y auf Boden', near(gentle.y, 0.155), `y=${gentle.y.toFixed(3)}`);
check('flach: kein Wandmodus', g.wall === false && g.snapped === true);
check('flach: Sinken weg', near(gentle.vy, 0));

const cliff = { x: 0, y: 49.8, z: 0, vx: -20, vy: 0, vz: 0 };
const c = resolveTerrainFollow(cliff, 50, 0.954, 0.3, 0, 0.155, 0.25);
check('steil: kein Y-Teleport auf den Grat', cliff.y < 50.2, `y=${cliff.y.toFixed(3)}`);
check('steil: Wandmodus', c.wall === true);
check('steil: XZ-Schub gegen die Wand', cliff.x > 0, `x=${cliff.x.toFixed(3)}`);
check('steil: Tempo in die Wand weg', cliff.vx >= -1e-6, `vx=${cliff.vx.toFixed(3)}`);

const ski = { x: 0, y: 0, z: 0, vx: 15, vy: -1, vz: 0 };
const slopeNy = Math.cos((30 * Math.PI) / 180);
const slopeNx = Math.sin((30 * Math.PI) / 180);
resolveTerrainFollow(ski, 0.2, slopeNx, slopeNy, 0, 0.155, 0.25);
const into = ski.vx * slopeNx + ski.vy * slopeNy;
check('30°-Hang: Geschwindigkeit in die Fläche nicht mehr negativ', into >= -1e-6, `vn=${into.toFixed(4)}`);

const dive = { x: 0, y: 0, z: 0, vx: -8, vy: -4, vz: 0 };
resolveTerrainFollow(dive, 0.2, slopeNx, slopeNy, 0, 0.155, 0.25);
const vnDive = dive.vx * slopeNx + dive.vy * slopeNy;
check(
  '30°-Hang: Anfahrt in die Fläche wird gestrichen (kein Skilift)',
  vnDive >= -1e-6,
  `vn=${vnDive.toFixed(4)}`,
);

const mesa = { x: 5, y: 0.5, z: 0, vx: 20, vy: 0, vz: 0 };
const deep = resolveTerrainFollow(mesa, 40, 0, 1, 0, 0.155, 0.25);
check('Hochebene, 40 m drin: kein Y-Teleport', mesa.y < 2, `y=${mesa.y.toFixed(3)}`);
check('Hochebene, 40 m drin: Wandmodus', deep.wall === true);
check('Hochebene, 40 m drin: zurück', mesa.x < 5, `x=${mesa.x.toFixed(3)}`);
check(`DEEP_PENETRATION = ${DEEP_PENETRATION}`, DEEP_PENETRATION === 1.5);

console.log('Zerbrechen');
check('Schritt, frontal, Planke hält', !shouldBreak(MASS, -1.39, RAIL_BREAK_SPEED, RAIL_BREAK_ENERGY));
check('25 km/h, Planke bricht', shouldBreak(MASS, -6.94, RAIL_BREAK_SPEED, RAIL_BREAK_ENERGY));
check('25 km/h, Baum hält', !shouldBreak(MASS, -6.94, TREE_BREAK_SPEED, TREE_BREAK_ENERGY));
check('40 km/h, Baum bricht', shouldBreak(MASS, -11.1, TREE_BREAK_SPEED, TREE_BREAK_ENERGY));
check(
  '120 km/h, 1 m/s in die Normale, Planke hält',
  !shouldBreak(MASS, -1.0, RAIL_BREAK_SPEED, RAIL_BREAK_ENERGY),
);
check('Wegfahren bricht nichts', !shouldBreak(MASS, 20, RAIL_BREAK_SPEED, RAIL_BREAK_ENERGY));
check('treeKey ist ortsfest', treeKey(12.34, -56.78) === treeKey(12.34, -56.78));
check('treeKey unterscheidet Orte', treeKey(0, 0) !== treeKey(1, 0));

if (failed > 0) {
  console.log(`\n${failed} Prüfung(en) fehlgeschlagen.`);
  process.exit(1);
}
console.log('\nAlle Prüfungen der gelieferten Funktionen grün.');
