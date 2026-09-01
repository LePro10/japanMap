import { readFileSync } from 'node:fs';

/**
 * Standorte für Sprungschanzen suchen — P24.
 *
 * ## Warum es dieses Werkzeug gibt
 *
 * Die erste Fassung von `RAMPS` in `stunt.config.ts` hatte fünf von Hand
 * gegriffene Koordinaten. Gemessen mit `tools/smoke.mjs` waren vier davon
 * unbrauchbar, und zwar auf eine Art, die man beim Hinschreiben nicht sieht:
 *
 * ```
 *   temple-hop    7,22 s in der Luft   ← die Anfahrt endet an einer Klippe
 *   pass-crest    4,93 s in der Luft   ← dieselbe Ursache
 *   coast-kicker  0,02 s, +21 m Höhe   ← die Anfahrt geht einen Berg hinauf
 * ```
 *
 * Eine Koordinate auf einer 9,4 km² großen, erodierten Karte ist eine
 * Behauptung. Dieses Werkzeug macht eine Messung daraus: es liest dieselben
 * Dateien, die das Spiel lädt (`height.r16`, `roads.json`), und sucht Stellen,
 * die drei Bedingungen zugleich erfüllen.
 *
 * ## Die drei Bedingungen
 *
 * 1. **Anlauf.** 130 m vor der Schanze verläuft die Straße nahezu gerade
 *    (Sehne/Bogen ≥ 0,97) und steigt kaum (< 7 %). Ohne Anlauf gibt es kein
 *    Tempo, und ohne Tempo keinen Sprung.
 * 2. **Aufbau.** Der Boden unter der Auffahrt steigt nicht über die halbe
 *    Schanzenhöhe. Die Schanze *steht* auf der Höhe an ihrem Fuß (so rechnet
 *    `RampField.prepare`), also darf er wellig sein — er darf nur nicht durch
 *    sie hindurchragen.
 * 3. **Landung.** Die 80 m hinter der Kante steigen höchstens 1,6 m über die
 *    Kantenhöhe und fallen nicht mehr als 12 m ab. Das Erste wäre eine Wand, das
 *    Zweite ein Abgrund — beides ist kein Sprung, sondern ein Unfall.
 *
 * > **Die Grenzwerte sind zweimal gelockert worden, und beide Male mit einer
 * > Zahl daneben.** Mit den ersten (0,985 / 4 % / 1,2 m / 0,6 m) fand das
 * > Werkzeug auf 11 km Straße **einen** Platz. Das ist keine strenge Auswahl,
 * > sondern eine leere: die Karte ist erodiert, und ein 24 m langes Stück
 * > Böschung mit weniger als 1,2 m Höhenband gibt es fast nirgends. Mit den
 * > jetzigen sind es fünfzehn — genug, um die besten fünf zu nehmen.
 *
 * ## Warum die Schanzen **neben** der Straße stehen
 *
 * Eine Schanze auf der Fahrbahn wäre am einfachsten zu treffen und würde die
 * Rennen kaputtmachen: die Ideallinie der KI (`RaceLine`) kennt nur die
 * Krümmung der Straße und die Kuppen des Geländes — von einer Auflage, die
 * `RoadGround` addiert, weiß sie nichts. Drei Gegner, die in jeder Runde an
 * derselben Stelle abheben, wären ein Fehler, den niemand als Feature liest.
 *
 * Sie stehen deshalb `SIDE_OFFSET` neben der Mittellinie, in Fahrtrichtung.
 * Wer sie nehmen will, lenkt ein Stück heraus; wer nicht, fährt vorbei.
 *
 * > **`SIDE_OFFSET` stand bis P26 auf 11 m, und die Zahl war als Abstand eines
 * > *Punktes* hergeleitet — die Breite der Schanze kam in der Rechnung nicht
 * > vor.** Eine Schanze ist aber 11 bis 15 m breit. Gemessen lag die
 * > Innenkante damit bei 11 − 7,5 − 0,6 = **2,9 m** von der Mittellinie, und
 * > die Ringstraße ist 9 m breit mit 1,6 m Bankett, reicht also bis **6,1 m**.
 * > Fünf der sechs Schanzen ragten in die Fahrbahn; im Bild sieht das aus wie
 * > eine Rampe mitten auf der Straße, und der Auftraggeber hat genau das
 * > gemeldet.
 * >
 * > Dieselbe Fehlerklasse wie `maxDriveForce` (P17/P18) und die
 * > Schanzenneigung weiter oben in P26: **ein Kommentar, der rechnet, ist eine
 * > Abhängigkeit wie ein Import** — und diese Rechnung ließ einen Summanden
 * > weg.
 *
 * Der Versatz wird jetzt **hergeleitet** statt gesetzt:
 *
 * ```
 *   SIDE_OFFSET = Fahrbahnhälfte + Bankett + Sicherheit + Schanzenhälfte + Saum
 *               = 4,5 + 1,6 + 1,5 + 7,5 + 0,6 = 15,7  ->  16 m
 * ```
 *
 * Gerechnet für den **breitesten** Fall (15 m, `south-crest`) auf der
 * **breitesten** Straße (Ring). Schmalere Schanzen stehen damit weiter weg als
 * nötig, und das ist die richtige Richtung für den Fehler: eine Schanze, die
 * man knapp verfehlt, ist ärgerlich; eine, die auf der Fahrbahn steht, ist ein
 * Fehler.
 *
 * ```
 *   node tools/find-ramps.mjs
 * ```
 */

const HEIGHT = 'assets/generated/terrain/height.r16';
const META = 'assets/generated/terrain/meta.json';
const ROADS = 'assets/generated/roads/roads.json';

/**
 * Wie weit neben der Mittellinie, in Metern — **hergeleitet, nicht gesetzt.**
 * Herleitung und die Messung, die sie ausgelöst hat, im Dateikopf.
 */
const ROAD_HALF = 4.5; // Ringstraße, `ROAD_TYPES.highway.width / 2`
const ROAD_SHOULDER = 1.6; // `ROAD_TYPES.highway.shoulder`
const CLEARANCE = 1.5; // Sicherheitsabstand Bankettkante ↔ Schanzensaum
const RAMP_HALF_MAX = 7.5; // breiteste Schanze (`south-crest`, 15 m)
const RAMP_SKIRT = 0.6; // `RAMP_SKIRT` in StuntSystem
const SIDE_OFFSET = Math.ceil(ROAD_HALF + ROAD_SHOULDER + CLEARANCE + RAMP_HALF_MAX + RAMP_SKIRT);
/** Länge des geforderten Anlaufs, m. */
const RUN_UP = 130;
/** Länge der Auffahrt, m. */
const RAMP_LENGTH = 24;
/** Länge der geprüften Landefläche, m. */
const LANDING = 80;
/** Mindestabstand zweier Schanzen, m. */
const SPACING = 260;

const meta = JSON.parse(readFileSync(META, 'utf8'));
const raw = readFileSync(HEIGHT);
// **Aus `meta.json` gelesen und nicht angenommen.** Der erste Entwurf griff auf
// `meta.resolution` und `meta.minHeight` zu — beides gibt es nicht, beides fiel
// auf einen Vorgabewert zurück, und heraus kamen Kantenhöhen von 0,1 m auf einer
// Karte mit 450 m Höhenunterschied. Ein Vorgabewert hinter `??` ist eine
// stillschweigende Annahme, und die hat hier eine ganze Messreihe verdorben.
const res = meta.heightmap.res;
const size = meta.world.size;
const minY = meta.world.minHeight;
const maxY = meta.world.maxHeight;
const data = new Uint16Array(raw.buffer, raw.byteOffset, raw.length / 2);

/** Bilinear, wie `TerrainSampler` — geklemmt auf der **Gitterkoordinate**. */
function heightAt(x, z) {
  const u = ((x + size / 2) / size) * (res - 1);
  const v = ((z + size / 2) / size) * (res - 1);
  const cu = Math.min(res - 1, Math.max(0, u));
  const cv = Math.min(res - 1, Math.max(0, v));
  const x0 = Math.floor(cu);
  const z0 = Math.floor(cv);
  const x1 = Math.min(res - 1, x0 + 1);
  const z1 = Math.min(res - 1, z0 + 1);
  const fx = cu - x0;
  const fz = cv - z0;
  const g = (ix, iz) => (data[iz * res + ix] / 65535) * (maxY - minY) + minY;
  const a = g(x0, z0) * (1 - fx) + g(x1, z0) * fx;
  const b = g(x0, z1) * (1 - fx) + g(x1, z1) * fx;
  return a * (1 - fz) + b * fz;
}

const roads = JSON.parse(readFileSync(ROADS, 'utf8')).roads;
const found = [];

for (const road of roads) {
  if (road.length < 400) continue;
  const line = road.centerline;
  const n = line.length / 3;
  // Der Abtastabstand ist `sampleSpacing` = 2 m; RUN_UP in Punkten:
  const runUp = Math.round(RUN_UP / 2);
  for (let i = runUp; i + runUp < n; i += 8) {
    const x = line[i * 3];
    const z = line[i * 3 + 2];
    const fx = line[(i + 1) * 3] - x;
    const fz = line[(i + 1) * 3 + 2] - z;
    const flen = Math.hypot(fx, fz) || 1;
    const dirX = fx / flen;
    const dirZ = fz / flen;

    // 1. Anlauf gerade und flach?
    const bx = line[(i - runUp) * 3];
    const bz = line[(i - runUp) * 3 + 2];
    const bearing = Math.hypot(x - bx, z - bz);
    const straight = bearing / (runUp * 2);
    if (straight < 0.97) continue;
    const runSlope = Math.abs(heightAt(x, z) - heightAt(bx, bz)) / RUN_UP;
    if (runSlope > 0.07) continue;

    // Die Schanze steht seitlich, in Fahrtrichtung. Rechts der Fahrtrichtung
    // ist `(−dz, dx)` — die Konvention des Projekts.
    const sx = x - dirZ * SIDE_OFFSET;
    const sz = z + dirX * SIDE_OFFSET;

    // 2. Aufbau: die Schanze **steht** auf der Höhe an ihrem Fuß (so rechnet
    //    `RampField.prepare`), also zählt nicht die Welligkeit darunter,
    //    sondern ob der Boden davor nicht plötzlich höher wird als die Kante.
    const footX = sx - dirX * RAMP_LENGTH;
    const footZ = sz - dirZ * RAMP_LENGTH;
    const baseY = heightAt(footX, footZ);
    let overRamp = -Infinity;
    for (let s = -RAMP_LENGTH; s <= 0; s += 3) {
      for (const t of [-6, 0, 6]) {
        const px = sx + dirX * s - dirZ * t;
        const pz = sz + dirZ * s + dirX * t;
        const h = heightAt(px, pz);
        if (h > overRamp) overRamp = h;
      }
    }
    // Der Boden unter der Auffahrt darf höchstens bis zur halben Schanzenhöhe
    // steigen — sonst ragt er durch sie hindurch.
    if (overRamp > baseY + 2.0) continue;
    const lip = baseY + 4.0;

    // 3. Landung frei?
    let worstUp = -Infinity;
    let worstDown = Infinity;
    for (let s = 6; s <= LANDING; s += 4) {
      const px = sx + dirX * s;
      const pz = sz + dirZ * s;
      const h = heightAt(px, pz);
      if (h > worstUp) worstUp = h;
      if (h < worstDown) worstDown = h;
    }
    if (worstUp > lip - 1.5) continue;
    if (worstDown < lip - 16) continue;

    const gap = found.every(
      (f) => Math.hypot(f.x - sx, f.z - sz) > SPACING,
    );
    if (!gap) continue;

    found.push({
      road: road.id,
      x: +sx.toFixed(1),
      z: +sz.toFixed(1),
      heading: +Math.atan2(dirX, dirZ).toFixed(3),
      lip: +lip.toFixed(1),
      drop: +(lip - worstDown).toFixed(1),
      arc: i * 2,
    });
  }
}

console.log(`\n╔══ Schanzenplätze — ${found.length} gefunden\n`);
for (const f of found) {
  console.log(
    `   ${f.road.padEnd(12)} x ${String(f.x).padStart(8)}  z ${String(f.z).padStart(8)}  ` +
      `heading ${String(f.heading).padStart(7)}  Kante ${String(f.lip).padStart(6)} m  ` +
      `Gefälle dahinter ${String(f.drop).padStart(5)} m`,
  );
}
console.log('');
