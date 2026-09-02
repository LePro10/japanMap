import { Vector3 } from 'three';

import { VEHICLES } from '@/config/vehicles.config';
import { Vehicle } from '@/game/Vehicle';

/**
 * Warum bricht der Offroader auf rauem Hang ein? — P26
 *
 * ## Der Befund, der diese Datei ausgelöst hat
 *
 * `tools/bench/hill.mts` fährt jedes Fahrzeug einen Hang hinauf, einmal glatt
 * und einmal mit ±6 cm Rauheit (die Größenordnung, die auf dieser Karte
 * zwischen zwei Höhenfeld-Texeln liegt). Ergebnis:
 *
 * ```
 *   Touge-Coupé   20°  glatt 77,9   rau 78,0 km/h
 *   GT            20°  glatt 65,0   rau 65,3
 *   Lastwagen     20°  glatt 34,6   rau 34,7
 *   Offroad 4×4   20°  glatt 64,5   rau  4,8      ← bricht ein
 * ```
 *
 * Drei Fahrzeuge merken die Rauheit nicht, das vierte bleibt praktisch stehen —
 * und es ist ausgerechnet das, dessen ganze Auslegung Gelände heißt (42 cm
 * Federweg, Allrad, Stollenreifen).
 *
 * ## Was `hill.mts` nicht beantwortet
 *
 * Es meldet die **Wirkung** (Tempo) und zwei Randgrößen (Luftanteil, tiefstes
 * Blech), aber nicht den Verlauf. Genau dieselbe Lücke wie in P21, wo aus „der
 * Hang ist nicht befahrbar" erst dann etwas Entscheidbares wurde, als der
 * Prüfstand **welche der vier Ursachen** danebenschrieb.
 *
 * Diese Datei schreibt den Verlauf mit: Tempo, Einfederung, Luft, Blech,
 * Durchdrehen — je Sekunde, glatt gegen rau, nebeneinander. Sie beantwortet
 * eine einzige Frage und darf verschwinden, wenn sie beantwortet ist.
 *
 * ```
 *   node --experimental-strip-types --import ./tools/bench/register.mjs tools/bench/offroad.mts
 * ```
 */

const DEG = Math.PI / 180;

/**
 * Der Hang aus `hill.mts` — aber mit **Wellenlänge und Epsilon als Parameter**.
 *
 * ## Warum die beiden getrennt gehören
 *
 * `hill.mts` würfelt seine Rauheit mit `sin(x·8.3)`, also **0,76 m**
 * Wellenlänge, und rechnet die Normale über eine zentrale Differenz mit
 * ε = 0,5 m. Beides zusammen ist eine Falle: eine Differenz über 1,0 m auf
 * einer 0,76-m-Welle liest die Steigung an der falschen Stelle ab — das ist
 * Aliasing, und die Normale zeigt dann irgendwohin.
 *
 * Auf der **echten Karte** gibt es diese Welle gar nicht. Das Höhenfeld ist
 * bilinear über ein 1,5-m-Raster; kürzer als 3 m kann darin nichts sein
 * (Nyquist), und `TerrainSampler.getNormalAt` rechnet folgerichtig mit
 * ε = Texelabstand.
 *
 * Ob der Einbruch also dem Fahrzeug gehört oder dem Prüfstand, entscheidet sich
 * an genau diesen zwei Zahlen — deshalb sind sie hier Parameter und keine
 * Konstanten.
 */
function hang(grad: number, rau: number, wellenlaenge = 0.76, epsilon = 0.5) {
  const s = Math.tan(grad * DEG);
  const q = Math.hypot(s, 1);
  // `hill.mts` benutzt k = 3,7 und 8,3. Umgerechnet auf die gewünschte
  // Wellenlänge bleibt das Verhältnis der beiden Lagen erhalten.
  const k2 = (2 * Math.PI) / wellenlaenge;
  const k1 = k2 * (3.7 / 8.3);
  const rauheit = (x: number, z: number): number =>
    rau === 0
      ? 0
      : rau *
        (Math.sin(x * k1 + z * k1 * 0.51) * 0.6 + Math.sin(x * k2 - z * k2 * 0.73) * 0.4);
  const height = (x: number, z: number): number => z * s + rauheit(x, z);
  return {
    height,
    normal: (x: number, z: number, t: Vector3): Vector3 => {
      if (rau === 0) return t.set(0, 1 / q, -s / q);
      const e = epsilon;
      const dx = (height(x + e, z) - height(x - e, z)) / (2 * e);
      const dz = (height(x, z + e) - height(x, z - e)) / (2 * e);
      return t.set(-dx, 1, -dz).normalize();
    },
    surface: () => 'gelaende' as const,
    waterDepth: () => 0,
  };
}

const EINGABE = { throttle: 1, brake: 0, steer: 0, handbrake: false, boost: false };

interface Zeile {
  readonly s: number;
  readonly kmh: number;
  readonly einfed: number;
  readonly luft: boolean;
  readonly blech: number;
  readonly spin: number;
  readonly z: number;
}

function fahre(
  id: keyof typeof VEHICLES,
  grad: number,
  rau: number,
  wellenlaenge = 0.76,
  epsilon = 0.5,
): Zeile[] {
  const g = hang(grad, rau, wellenlaenge, epsilon);
  const v = new Vehicle(VEHICLES[id]);
  v.respawn(0, 0, 0, g);
  const zeilen: Zeile[] = [];
  const schritte = 20 * 60;
  for (let i = 0; i < schritte; i++) {
    v.step(1 / 60, EINGABE, g, null);
    if (i % 120 === 0 || i === schritte - 1) {
      const t = v.telemetry;
      zeilen.push({
        s: i / 60,
        kmh: t.speed * 3.6,
        einfed: t.compression,
        luft: t.airborne,
        blech: t.hullDepth,
        spin: t.wheelspin,
        z: v.position.z,
      });
    }
  }
  return zeilen;
}

const nf = (v: number, k = 1): string => v.toFixed(k);

console.log('\n╔══ Offroader am rauen Hang — Prüfstand P26 ═════════════════════════════\n');

for (const id of ['offroad', 'touge'] as const) {
  console.log(`── ${VEHICLES[id].name}, 20° Gelände`);
  console.log('     s │ glatt km/h  Einfed  Luft  Blech  Spin │ rau km/h  Einfed  Luft  Blech  Spin');
  const glatt = fahre(id, 20, 0);
  const rau = fahre(id, 20, 0.06);
  for (let i = 0; i < glatt.length; i++) {
    const a = glatt[i]!;
    const b = rau[i]!;
    console.log(
      `  ${nf(a.s).padStart(4)} │ ${nf(a.kmh).padStart(9)} ${nf(a.einfed, 3).padStart(7)}` +
        ` ${String(a.luft).padStart(5)} ${nf(a.blech, 3).padStart(6)} ${nf(a.spin, 2).padStart(5)}` +
        ` │ ${nf(b.kmh).padStart(8)} ${nf(b.einfed, 3).padStart(7)}` +
        ` ${String(b.luft).padStart(5)} ${nf(b.blech, 3).padStart(6)} ${nf(b.spin, 2).padStart(5)}`,
    );
  }
  console.log('');
}

// ── Die Trennung: gehört der Einbruch dem Fahrzeug oder dem Prüfstand? ──────
//
// Vier Kombinationen aus Wellenlänge und Epsilon. Die erste ist `hill.mts`,
// die letzte ist die **Karte** (Höhenfeld bilinear über 1,5 m, Normale mit dem
// Texelabstand gerechnet). Bleibt der Einbruch bis unten stehen, gehört er dem
// Fahrzeug; verschwindet er, gehört er der Messung.
console.log('── Wellenlänge × Epsilon — Endtempo nach 20 s am 20°-Hang (km/h)\n');
console.log('   Welle   ε     Coupé    Offroad   Bemerkung');
const faelle: [number, number, string][] = [
  [0.76, 0.5, 'hill.mts, wie es misst'],
  [0.76, 0.05, 'dieselbe Welle, Normale fein abgetastet'],
  [3.0, 0.5, 'kürzeste Welle, die das Höhenfeld tragen kann'],
  [3.0, 1.5, 'wie die Karte: 1,5-m-Raster, ε = Texelabstand'],
];
for (const [welle, eps, text] of faelle) {
  const c = fahre('touge', 20, 0.06, welle, eps).at(-1)!.kmh;
  const o = fahre('offroad', 20, 0.06, welle, eps).at(-1)!.kmh;
  console.log(
    `  ${nf(welle, 2).padStart(5)} m ${nf(eps, 2).padStart(5)} ${nf(c).padStart(8)}` +
      ` ${nf(o).padStart(10)}   ${text}`,
  );
}
console.log('');
