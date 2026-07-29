#!/usr/bin/env node
/**
 * Straßennetz-Generator — PLAN.md P3 / 3.1.
 *
 *   node tools/gen-roads.mjs
 *
 * **Warum ein Generator und nicht nur der Editor aus 3.2?** Der Plan nennt den
 * Editor „nicht optional", und das stimmt — aber er löst ein anderes Problem.
 * Er ist das Werkzeug zum *Verfeinern*; er ist ein schlechtes Werkzeug für den
 * ersten Wurf, weil ein Bergpass mit neun Serpentinen, durchgehend unter 11 %
 * Steigung und über 15 m Radius, von Hand gesetzt eine Fleißarbeit mit
 * ungewissem Ausgang ist. Der Generator legt das Netz aus dem Gelände an und
 * **misst nach**, ob es die Kriterien aus PLAN.md P3 erfüllt. Danach ist der
 * Editor das, was er sein soll: Feinarbeit an etwas, das schon fährt.
 *
 * Die Ausgabe enthält beides — die Kontrollpunkte für den Editor und die fertig
 * abgetastete Mittellinie für Baker und Renderer. Warum die Redundanz, steht in
 * `src/config/roads.config.ts` bei `centerline`.
 *
 * Ausgabe → assets/generated/roads/roads.json
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  maxGradient,
  minCurveRadius,
  sampleSpline,
} from '../src/world/roads/splineSampler.mjs';
import {
  createRouteGrid,
  filletPath,
  removeSpurs,
  routePath,
  simplify,
  smoothPath,
  hairpinApexes,
  selfCollision,
  toControlPoints,
  widenHairpins,
} from './route-planner.mjs';
// Kein Spiegel, sondern dieselbe Datei, die auch der Renderer liest — der
// Distrikt muss auf den Zentimeter übereinstimmen, sonst steht die Stadtplatte
// neben der Straße, die sie tragen soll.
import { CITY_ROAD_LEVEL, districtBlend } from '../src/config/city.mjs';

// `fileURLToPath`, nicht `.pathname` — siehe tools/bake-terrain.mjs: unter
// Windows trägt `.pathname` einen führenden Schrägstrich vor dem Laufwerk, und
// `join` macht daraus `P:\P:\projects\…`.
const ROOT = fileURLToPath(new URL('..', import.meta.url));

// ── Straßentypen (Spiegel von src/config/roads.config.ts) ────────────────────
//
// Node liest kein TypeScript. Die Werte hier sind deshalb dupliziert — anders
// als bei der Kurvenmathematik ist das vertretbar: eine Abweichung fällt
// sofort auf, weil der Generator seine eigenen Grenzwerte prüft und meldet.
/**
 * `maxEarthwork` ist die mittlere Abweichung zwischen Fahrbahn und Gelände, ab
 * der die Trasse als misslungen gilt — gemessen auf der ganzen Mittellinie,
 * nicht an den Kontrollpunkten.
 *
 * Sie steht hier, weil Radius und Steigung allein eine Straße durchgehen
 * lassen, die beides hält und trotzdem falsch liegt: der Bergpass meldete
 * 22,5 m Radius ✓ und 10,7 % Steigung ✓ bei **49,2 m** mittlerem Abtrag — auf
 * 83 % seiner Länge ein Graben mit Gelände über der Fahrbahn zu beiden Seiten.
 * Beide Grenzwerte waren erfüllt, die Straße war es nicht.
 *
 * Die Zahlen sind an gebauten Strecken geeicht, nicht geraten: Ring 6,9 m,
 * Dorf 0,2 m, Bergpass 28,8 m. Der Pass bekommt 30 m, weil ein Serpentinenstapel
 * sich zwangsläufig in den Hang terrassiert — gemessen kostet jede zusätzliche
 * Kehre rund einen halben Meter mittleren Abtrag. Ein Bergpass bewegt nun einmal
 * mehr Erde als eine Ringstraße, aber keine fünfzig Meter: der Grenzwert trennt
 * die gebaute Strecke (28,8 m) sauber von der kaputten, die er finden soll
 * (49,2 m, siehe oben).
 */
const TYPES = {
  highway: { width: 9, maxGradient: 0.07, minRadius: 45, maxEarthwork: 12 },
  mountain: { width: 6.5, maxGradient: 0.11, minRadius: 15, maxEarthwork: 30 },
  village: { width: 5, maxGradient: 0.09, minRadius: 18, maxEarthwork: 8 },
  city: { width: 8, maxGradient: 0.06, minRadius: 25, maxEarthwork: 10 },
  dirt: { width: 4, maxGradient: 0.14, minRadius: 12, maxEarthwork: 20 },
};

const SAMPLE_SPACING = 2;

/**
 * Wie weit die Fahrbahn am Gipfelende unter dem Gelände liegen darf, in Metern.
 *
 * Darüber gilt das Ziel als nicht erreicht und wird abgesenkt — siehe die
 * Gipfelschleife im Hauptlauf.
 */
const SUMMIT_TOLERANCE = 15;

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

// ── Geländezugriff ──────────────────────────────────────────────────────────

function createTerrain(raw, res, size, minHeight, heightRange) {
  const height = new Float32Array(res * res);
  const scale = heightRange / 65535;
  for (let i = 0; i < raw.length; i++) height[i] = minHeight + raw[i] * scale;

  const half = size / 2;
  const spacing = size / (res - 1);
  const last = res - 1;

  return {
    /** Bilinear, identisch zu TerrainSampler.getHeightAt und terrainHeight(). */
    at(x, z) {
      const gx = clamp((x + half) / spacing, 0, last);
      const gz = clamp((z + half) / spacing, 0, last);
      const ix = gx | 0;
      const iz = gz | 0;
      const jx = ix < last ? ix + 1 : last;
      const jz = iz < last ? iz + 1 : last;
      const fx = gx - ix;
      const fz = gz - iz;
      const r0 = iz * res;
      const r1 = jz * res;
      const h00 = height[r0 + ix];
      const h10 = height[r0 + jx];
      const h01 = height[r1 + ix];
      const h11 = height[r1 + jx];
      return (h00 + (h10 - h00) * fx) * (1 - fz) + (h01 + (h11 - h01) * fx) * fz;
    },
  };
}

/**
 * Einen Wegpunkt landeinwärts schieben, bis er trocken liegt.
 *
 * Die Küstenlinie folgt aus Seed und Erosion und verschiebt sich bei jedem
 * neuen Bake. Wegpunkte, die von Hand auf die Küste gesetzt wurden, lägen dann
 * im Wasser — und eine Straße, die im Meer beginnt, ist kein Fehler, den man
 * bei einem Zahlenvergleich sieht. Deshalb wird die Bedingung geprüft statt
 * angenommen.
 */
function pushInland(terrain, x, z, minHeight, maxSteps = 60) {
  let cx = x;
  let cz = z;
  const toCenterX = -Math.sign(x || 1);
  const toCenterZ = -Math.sign(z || 1);

  for (let step = 0; step < maxSteps; step++) {
    if (terrain.at(cx, cz) >= minHeight) return [cx, cz];
    cx += toCenterX * 12;
    cz += toCenterZ * 12;
  }
  return [cx, cz];
}

/**
 * Höchsten Punkt in einem Umkreis suchen.
 *
 * Nicht ganz auf den Gipfel: die letzten Meter eines erodierten Grats sind ein
 * Felszacken, auf dem keine Straße endet. Gesucht wird der höchste Punkt, der
 * noch eine befahrbare Umgebung hat — bewertet über die mittlere Steigung im
 * Umkreis von 40 m.
 */
function findSummit(terrain, region, maxHeight = Infinity, step = 20) {
  let best = null;
  let bestHeight = -Infinity;

  // Schwelle statt Strafe. Der erste Entwurf zog die Rauheit mit einem Gewicht
  // von der Höhe ab — und weil ein Steilhang leicht 2,0 Rauheit erreicht, wog
  // die Strafe 120 Höhenmeter auf. Gefunden wurde daraufhin nicht der Gipfel,
  // sondern der flachste Fleck am Rand des Suchbereichs, 279 m vom Startpunkt
  // entfernt: ein „Bergpass" mit 78 Höhenmetern.
  const maxSlope = 0.45;

  for (let z = region.minZ; z <= region.maxZ; z += step) {
    for (let x = region.minX; x <= region.maxX; x += step) {
      const h = terrain.at(x, z);
      if (h <= bestHeight || h > maxHeight) continue;

      let slope = 0;
      for (const [ox, oz] of [[40, 0], [-40, 0], [0, 40], [0, -40]]) {
        slope += Math.abs(terrain.at(x + ox, z + oz) - h) / 40;
      }
      if (slope / 4 > maxSlope) continue; // Felszacken — dort endet keine Straße

      bestHeight = h;
      best = [x, z];
    }
  }

  return best;
}

// ── Höhenprofil ─────────────────────────────────────────────────────────────

/**
 * Höhen der Kontrollpunkte so anpassen, dass die Steigung eingehalten wird.
 *
 * Zwei weiche Kräfte, eine harte Nebenbedingung:
 *
 *  1. **Anziehung ans Gelände** — die Straße soll dem Boden folgen, nicht in
 *     der Luft stehen.
 *  2. **Glättung** — nimmt Sprünge aus dem Profil, die aus dem Rauschen der
 *     Heightmap stammen.
 *  3. **Steigungsbegrenzung** — als Projektion, nicht als Kraft.
 *
 * **Der Unterschied zwischen 3. als Kraft und als Projektion ist der ganze
 * Punkt.** Im ersten Entwurf war die Begrenzung nur ein weiterer Summand: sie
 * baute pro Durchlauf die Hälfte der Überschreitung ab, während die
 * Geländeanziehung sie unbeirrt wieder aufbaute. Das Gleichgewicht der beiden
 * lag *über* dem Grenzwert — am Bergpass bei 33 % statt 11 %, und da die
 * Heightmap dort steil ist, fiel es genau an der wichtigsten Stelle an.
 *
 * Jetzt läuft die Begrenzung nach jedem Durchlauf so lange nach, bis kein Rest
 * mehr übrig ist. Damit ist das Ergebnis am Ende **garantiert** zulässig, statt
 * nur in die richtige Richtung geschoben.
 */
function fitElevation(terrain, points, options) {
  const { maxGrade, closed, margin, pins = null, iterations = 400, level = null } = options;
  const n = points.length;

  /**
   * Bezugshöhe: das Gelände über den Fußabdruck der Straße gemittelt.
   *
   * Nicht der einzelne Texel. Eine Erosionsrinne von 40 cm quer zur Fahrbahn
   * verschwindet unter der Böschung, ohne einen Kubikmeter Erdbewegung zu
   * kosten — folgte das Profil ihr, entstünde eine Wellenlinie, die die
   * Steigungsbegrenzung dann mühsam wieder glätten muss. Dasselbe Mittel
   * benutzt die Trassierung für ihr Kostenfeld, damit beide dieselbe Fläche
   * meinen.
   */
  const ground = points.map(([x, z]) => {
    let sum = terrain.at(x, z) * 2;
    let weight = 2;
    for (const [dx, dz] of [[9, 0], [-9, 0], [0, 9], [0, -9], [6, 6], [-6, 6], [6, -6], [-6, -6]]) {
      sum += terrain.at(x + dx, z + dz);
      weight++;
    }
    return sum / weight;
  });

  /**
   * Stadtebene statt Gelände — PLAN.md P6 / 6.1.
   *
   * Eine Stadtstraße folgt keiner Erosionsrinne. Sie liegt in der Ebene, auf
   * der die Stadt gebaut ist, und genau das braucht P6 auch als *Zusage*: die
   * Bodenplatte des Distrikts ist exakt planar, weil die Reflexionsentscheidung
   * (6.5) davon lebt. Eine Straße, die sich um 80 cm durch diese Platte
   * wellt, macht aus einer planaren Spiegelung eine falsche.
   *
   * Der Eingriff sitzt bewusst **an der Bezugshöhe**, nicht am Ergebnis. Wer
   * die fertigen Höhen hinterher überschreibt, umgeht die Steigungsbegrenzung
   * und bekommt am Distrikträndern einen Knick; wer die Anziehung umlenkt,
   * lässt Glättung und Begrenzung ihre Arbeit tun und erhält eine Rampe, die
   * über `districtBlend` ausläuft.
   */
  if (level !== null) {
    for (let i = 0; i < n; i++) {
      const blend = districtBlend(points[i][0], points[i][1]);
      if (blend > 0) ground[i] = ground[i] + (level - ground[i]) * blend;
    }
  }

  const heights = ground.slice();

  // Festgehaltene Höhen aus Kreuzungen (3.5). Ein angehefteter Knoten bewegt
  // sich weder durch die Geländeanziehung noch durch die Projektion — die
  // Anpassung muss ihn umgehen, sonst driftet die Kreuzung wieder auseinander.
  const fixed = new Uint8Array(n);
  if (pins) {
    for (const [index, height] of pins) {
      if (index < 0 || index >= n) continue;
      fixed[index] = 1;
      heights[index] = height;
      ground[index] = height;
    }
  }

  const edge = (i) => (closed ? (i + 1) % n : i + 1);
  const edgeCount = closed ? n : n - 1;

  const spans = [];
  for (let i = 0; i < edgeCount; i++) {
    const j = edge(i);
    spans.push(Math.hypot(points[j][0] - points[i][0], points[j][1] - points[i][1]));
  }

  /**
   * Gauß-Seidel-Projektion auf die zulässige Menge.
   *
   * **Zwei Verfahren, je nach Randbedingung.** Die Überschreitung je zur Hälfte
   * auf beide Kantenenden zu verteilen ist symmetrisch und schonend — und
   * konvergiert quadratisch langsam, weil jede Korrektur die Nachbarkante
   * wieder anstößt. Solange kein Knoten festliegt, macht das nichts: das ganze
   * Profil verschiebt sich gemeinsam und die Sache ist nach wenigen Durchläufen
   * erledigt.
   *
   * Mit den Kreuzungen kam ein fester Punkt dazu, und damit muss das Profil um
   * diesen Punkt **kippen** statt sich zu verschieben. Dafür reicht die
   * Reichweite nicht: bei 706 Knoten waren auch 3000 Durchläufe zu wenig. Die
   * äußere Schleife senkte daraufhin ihre Zusage von 9,3 % auf 0,4 %, während
   * das Ergebnis von 16 % auf 22 % **stieg** — ein Regler, der die Lage
   * verschlimmert und dabei arbeitet.
   *
   * Deshalb vorweg ein Klemmlauf von den festen Enden aus. Er macht eine offene
   * Kette in einem Durchgang zulässig. Für die geschlossene Runde taugt er
   * nicht — dort hat die Kette keinen Anfang, der Lauf dreht sich im Kreis und
   * schleift das Profil mit; gemessen 197 % statt 6 %.
   */
  const pinnedStart = fixed[0] === 1;
  const pinnedEnd = fixed[n - 1] === 1;

  const enforce = (limitFactor) => {
    const limitOf = (i) => maxGrade * limitFactor * spans[i];

    // Schritt 1 — nur bei festgenagelten Enden: einmal von dort aus klemmen.
    //
    // Eine offene Kette mit festem Anfang wird durch **einen** Vorwärtslauf
    // vollständig zulässig: jeder Knoten kommt in das Fenster, das sein
    // Vorgänger zulässt, und der Vorgänger steht bereits fest. Für die
    // geschlossene Runde geht das nicht — dort hat die Kette keinen Anfang, der
    // Lauf dreht sich im Kreis und schleift das Profil mit. Ausprobiert und
    // gemessen: 197 % statt 6 %.
    if (!closed && pinnedStart) {
      for (let i = 0; i < edgeCount; i++) {
        const j = edge(i);
        if (fixed[j]) continue;
        const delta = heights[j] - heights[i];
        const limit = limitOf(i);
        if (Math.abs(delta) > limit) heights[j] = heights[i] + Math.sign(delta) * limit;
      }
    }
    if (!closed && pinnedEnd) {
      for (let i = edgeCount - 1; i >= 0; i--) {
        const j = edge(i);
        if (fixed[i]) continue;
        const delta = heights[i] - heights[j];
        const limit = limitOf(i);
        if (Math.abs(delta) > limit) heights[i] = heights[j] + Math.sign(delta) * limit;
      }
    }

    // Schritt 2 — symmetrisch ausgleichen. Ohne feste Knoten darf sich das
    // ganze Profil gemeinsam verschieben, und dann ist das Aufteilen der
    // Überschreitung auf beide Kantenenden das schonendere Verfahren: es zieht
    // die Straße nicht einseitig hinter einem Ende her.
    for (let pass = 0; pass < 3000; pass++) {
      let worst = 0;
      const backwards = (pass & 1) === 1;
      for (let step = 0; step < edgeCount; step++) {
        const i = backwards ? edgeCount - 1 - step : step;
        const j = edge(i);
        const delta = heights[j] - heights[i];
        const excess = Math.abs(delta) - limitOf(i);
        if (excess <= 0) continue;
        worst = Math.max(worst, excess);
        const share = fixed[i] && fixed[j] ? 0 : fixed[i] || fixed[j] ? 1 : 0.5;
        const shift = Math.sign(delta) * excess * share;
        if (!fixed[i]) heights[i] += shift;
        if (!fixed[j]) heights[j] -= shift;
      }
      if (worst < 1e-4) return;
    }
  };



  // Die Gewichte sind gemessen, nicht gewählt.
  //
  // Ursprünglich stand hier Anziehung 0,08 gegen Glättung 0,3, und das über 400
  // Durchläufe. Eine Laplace-Glättung mit Gewicht 0,3, vierhundertmal
  // angewendet, ist keine Glättung mehr — das ist Diffusion, die jedes Profil
  // in eine Gerade überführt. Sichtbar wurde es am Ring: seine Wegpunkte liegen
  // zwischen 33 m und 95 m, das Gelände ist dort sanft, und trotzdem lag die
  // Straße im Mittel 9,4 m neben dem Boden. Nicht die Trassierung war schuld,
  // sondern das Höhenprofil, das sich flachgerechnet hatte.
  //
  // Umgekehrt gewichtet folgt das Profil dem Boden, und geglättet wird nur noch
  // so viel, dass die Projektion nicht zwischen zwei Zuständen pendelt. Die
  // eigentliche Glättung leistet ohnehin die Steigungsbegrenzung.
  const attraction = 0.5;
  const smoothing = 0.03;

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < n; i++) {
      if (!fixed[i]) heights[i] += (ground[i] - heights[i]) * attraction;
    }

    const smoothed = heights.slice();
    for (let i = 0; i < n; i++) {
      if (fixed[i]) continue;
      if (!closed && (i === 0 || i === n - 1)) continue;
      const a = heights[(i - 1 + n) % n];
      const b = heights[(i + 1) % n];
      smoothed[i] = heights[i] + smoothing * ((a + b) / 2 - heights[i]);
    }
    for (let i = 0; i < n; i++) heights[i] = smoothed[i];

    enforce(margin);
  }

  enforce(margin);

  // Selbstprüfung: die Projektion sagt eine Eigenschaft zu, also wird sie
  // nachgesehen. Eine Zusage, die niemand prüft, ist genau die Sorte Fehler,
  // die dieses Modul schon zweimal produziert hat — einmal, weil die
  // Begrenzung eine Kraft statt einer Projektion war, einmal, weil sie bei 546
  // Knoten nicht auskonvergierte.
  let worstEdge = 0;
  for (let i = 0; i < edgeCount; i++) {
    const grade = Math.abs(heights[edge(i)] - heights[i]) / Math.max(spans[i], 1e-6);
    if (grade > worstEdge) worstEdge = grade;
  }
  if (worstEdge > maxGrade * margin * 1.05) {
    console.warn(
      c.yellow(
        `  ⚠ Höhenanpassung nicht konvergiert: ${(worstEdge * 100).toFixed(1)} % ` +
          `gegen zugesagte ${(maxGrade * margin * 100).toFixed(1)} % ` +
          `(${n} Knoten, ${pins ? pins.size : 0} festgenagelt)`,
      ),
    );
  }

  return heights;
}

// ── Streckenführung ─────────────────────────────────────────────────────────

/**
 * Trasse durch eine Folge von Wegpunkten legen.
 *
 * Die Wegpunkte sagen, **wohin** die Straße soll; die Suche in
 * `route-planner.mjs` sagt, **wie** sie dorthin kommt. Das ist der Unterschied
 * zum vorherigen Verfahren, das die Serpentinen als reine Geometrie in den Hang
 * legte und dabei zwangsläufig gegen Grate und Rinnen lief.
 *
 * Danach drei Schritte, deren Reihenfolge nicht beliebig ist:
 *
 *  1. **Vereinfachen** — die Suche liefert eine Treppe aus Gitterschritten. Ohne
 *     Douglas-Peucker stünde an jeder Stufe eine Ecke, und die Verrundung
 *     bekäme dutzende Mini-Ablenkungen statt weniger echter Kurven.
 *  2. **Verrunden** — Gerade–Kreisbogen–Gerade. Erst hier entsteht ein
 *     *garantierter* Mindestradius.
 *  3. **Kontrollpunkte setzen** — dicht in den Bögen, weit auf den Geraden,
 *     Verhältnis gedeckelt.
 */
function traceRoute(
  grid,
  waypoints,
  { settings, closed, radiusFactor = 1.6, corridor, headroom = 1, hairpins = false, skipApexes = new Set(), downhillBias = 0 },
) {
  const legs = waypoints.length - (closed ? 0 : 1);
  const raw = [];
  let expanded = 0;

  for (let i = 0; i < legs; i++) {
    const from = waypoints[i];
    const to = waypoints[(i + 1) % waypoints.length];
    const leg = routePath(grid, from, to, {
      // Die Suche plant mit einer **strengeren** Steigung als der Grenzwert.
      //
      // Der Grund ist geometrisch und nicht vermeidbar: das Verrunden ersetzt
      // jede Ecke durch einen Bogen, der die Spitze abschneidet, und bei einer
      // Kehre zwischen zwei fast parallelen Schenkeln sind das dreistellige
      // Meter. Die Trasse wird dadurch kürzer, der Höhengewinn bleibt — die
      // Steigung steigt also *nach* der Suche noch an. Ein Weg, der mit exakt
      // 11 % geplant wurde, misst hinterher 24 %.
      //
      // Wie viel Vorrat nötig ist, hängt davon ab, wie viele Kehren die Trasse
      // hat; das weiß man vorher nicht. Deshalb setzt der Hauptlauf `headroom`
      // herab, bis die **fertige** Strecke misst, was sie soll.
      maxGradient: settings.maxGradient * headroom,
      ...(corridor ? { corridorWidth: corridor } : {}),
    });
    expanded += leg.expanded;
    // Der Startpunkt jedes Beins ist der Endpunkt des vorherigen.
    raw.push(...(i === 0 ? leg.path : leg.path.slice(1)));
  }
  // Bei einer Runde schließt das letzte Bein auf den Anfang — der Punkt gehört
  // nur einmal in die Liste, sonst steht dort ein Knoten mit Abstand null.
  if (closed) raw.pop();

  // Erst Stichwege, dann glätten. Andersherum verwischt der Mittelwertfilter
  // die exakte Punktdopplung, an der ein Stichweg zu erkennen ist.
  // Ein Viertel der Höchstneigung als Schwelle: eine Serpentine am Grenzwert
  // gewinnt das Vierfache davon, ein Stichweg gewinnt nichts. Dazwischen liegt
  // reichlich Luft, und die Schwelle skaliert mit dem Straßentyp statt fest zu
  // stehen — der Ring darf bei 7 % nicht dieselbe Latte bekommen wie der Pass.
  const simple = removeSpurs(raw, 24, closed, {
    heightAt: (x, z) => {
      const [ix, iz] = grid.toCell(x, z);
      return grid.height[grid.index(ix, iz)];
    },
    minClimbRate: settings.maxGradient * 0.25,
  });
  // **70°, nicht 100°.** Eine Kehre im Suchgitter ist kein 170°-Scheitel,
  // sondern ein Z aus zwei rund 90°-Ecken mit einem Verbindungsstück dazwischen.
  // Wer erst ab 100° schützt, schützt genau die verschmolzene Form, die nicht
  // mehr baubar ist, und lässt die beiden Ecken verschmelzen, die es wären.
  // Der Sägezahn der Gitterrichtungen liegt bei 18,4°, eine normale Kurve
  // wechselt in 45°-Schritten — 70° trennt beides von der Umkehr.
  const soft = smoothPath(simple, 3, closed, { preserveAngle: 70 });
  const lean = simplify(soft, 12, 70);
  // **Kehren bauen, verrunden, messen — und den Verursacher zurücknehmen.**
  //
  // Nur wo Kehren erwünscht sind: eine Ringstraße mit Haarnadeln ist kein
  // Merkmal, sondern ein Fehler. Dort sind die scharfen Ecken Reste der
  // Gittersuche, und sie aufzuweiten schöbe die Trasse grundlos zur Seite
  // (gemessen: 33 Scheitel, Querstück 158 m, Mindestradius von 57,3 auf 51,0 m).
  // Serpentinen fordert SPEC §2.1 für den Bergpass, sonst für keine Strecke.
  //
  // Die Schleife ist nötig, weil zwei benachbarte Kehren erst **nach** dem
  // Verrunden ineinanderlaufen: vor den Bögen hielten die Punkte 53 m Abstand,
  // danach kreuzte der Pass sich mit 0,9 m. Geprüft wird deshalb die fertige
  // Linie, und bei einem Treffer fällt die nächstgelegene Aufweitung weg.
  const apexes = hairpins
    ? hairpinApexes(lean, 120, (x, z) => {
        const [ix, iz] = grid.toCell(x, z);
        return grid.height[grid.index(ix, iz)];
      })
    : [];
  // Querstück gut doppelt so lang wie der Sollradius: zwei Bögen à
  // `R·tan(42,5°)` ≈ 0,92 R brauchen zusammen 1,84 R, und die Stauchung
  // benachbarter Bögen rechnet mit 97 % der Sehne. Gemessen über 2,0 / 2,2 /
  // 2,5: bei 2,0 verrundet die Kehre zu früh weg, bei 2,5 stoßen zu viele
  // aneinander.
  const riser = settings.minRadius * radiusFactor * 2.2;
  const opened =
    apexes.length > 0 ? widenHairpins(lean, { apexes, riser, skip: skipApexes, downhillBias }) : lean;

  const rounded = filletPath(opened, {
    radius: settings.minRadius * radiusFactor,
    // Ecken, die den Grenzwert nicht halten können, fallen weg statt
    // durchzurutschen. Ohne diese Untergrenze staucht die gegenseitige
    // Verkleinerung benachbarter Bögen den Ring auf 34,5 m bei 45 m Soll.
    floor: settings.minRadius * 1.3,
    closed,
  });

  // Knotenabstand in den Bögen: die Sehne bei 7,5° ist 0,131·R. Auf den Geraden
  // das Doppelte — mehr nicht, sonst schwingt die Höhe zwischen ungleich
  // verteilten Knoten über. Der **Sollradius** geht ein, nicht der erreichte:
  // andersherum machte ein eingebrochener Bogen die Knoten enger, enge Knoten
  // ließen die Spline-Kurve fast umkehren, und zwischen zwei Abtastpunkten mit
  // 1 cm Horizontalabstand meldete die Steigungsmessung 9,7 %.
  const fine = Math.max(4, settings.minRadius * radiusFactor * 0.131);
  const points = toControlPoints(rounded.path, { fine, coarse: fine * 2, closed });

  return {
    points,
    apexes,
    expanded,
    filletRadius: rounded.minRadius,
    corners: rounded.corners,
    vertices: opened.length,
    // Radius nach der Ausdünnung, vor der Spline-Auswertung. Die drei Zahlen
    // (Sollradius, Bogenradius, Knotenradius) sagen zusammen, welche Stufe ihn
    // verliert — ohne sie wäre nur bekannt, dass er weg ist.
    nodeRadius: polylineRadius(points, closed),
    rawLength: polylineLength(raw, closed),
    directLength: polylineLength(waypoints, closed),
  };
}

/** Kleinster Umkreisradius dreier aufeinanderfolgender Punkte, in XZ. */
function polylineRadius(points, closed) {
  let smallest = Infinity;
  const n = points.length;
  const limit = closed ? n : n - 2;
  for (let i = 0; i < limit; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const cc = points[(i + 2) % n];
    const la = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const lb = Math.hypot(cc[0] - b[0], cc[1] - b[1]);
    const lc = Math.hypot(cc[0] - a[0], cc[1] - a[1]);
    const area2 = Math.abs((b[0] - a[0]) * (cc[1] - a[1]) - (b[1] - a[1]) * (cc[0] - a[0]));
    if (area2 < 1e-9) continue;
    const radius = (la * lb * lc) / (2 * area2);
    if (radius < smallest) smallest = radius;
  }
  return smallest;
}

function polylineLength(points, closed) {
  let total = 0;
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
}

/** Spitzkehren zählen: Läufe gleichsinniger Krümmung mit über 150° Gesamtdrehung. */

/**
 * Die fertige Mittellinie am oberen Ende kürzen, solange sie unter Grund liegt.
 *
 * Greift **nach** dem Bau in die Ergebnisdaten, nicht vorher in die Trasse:
 * genau dadurch bleiben Verlauf, Höhenprofil und Kehren des restlichen Passes
 * unverändert. Gekürzt werden alle Felder, die je Abtastpunkt geführt werden,
 * dazu Länge und Leitplanken.
 */
function trimSummitTail(terrain, data) {
  const line = data.centerline;
  const count = line.length / 3;
  let keep = count - 1;
  while (
    keep > 1 &&
    terrain.at(line[keep * 3], line[keep * 3 + 2]) - line[keep * 3 + 1] > SUMMIT_TOLERANCE
  ) {
    keep--;
  }

  const tail = (count - 1 - keep) * SAMPLE_SPACING;
  if (tail < 40 || keep < count * 0.5) return 0;

  data.centerline = line.slice(0, (keep + 1) * 3);
  data.widths = data.widths.slice(0, keep + 1);
  data.banking = data.banking.slice(0, keep + 1);
  data.length = Number((keep * SAMPLE_SPACING).toFixed(2));
  data.rails = data.rails
    .filter((rail) => rail.from < data.length)
    .map((rail) => (rail.to > data.length ? { ...rail, to: data.length } : rail));
  data.measured.railLength = Number(
    data.rails.reduce((sum, rail) => sum + (rail.to - rail.from), 0).toFixed(0),
  );

  // **Nach dem Kürzen neu messen.** Sonst meldet die Strecke die Kennwerte der
  // Trasse, die sie vor dem Schnitt war — genau die Sorte Zusage-statt-Ergebnis,
  // an der die Verrundung schon einmal 56,3 m meldete, wo 1,4 m standen.
  const trimmed = {
    positions: data.centerline,
    count: keep + 1,
    closed: false,
  };
  let deepestCut = 0;
  let highestFill = 0;
  let sumAbsolute = 0;
  let worstAt = 0;
  const magnitudes = new Float64Array(keep + 1);
  for (let i = 0; i <= keep; i++) {
    const delta =
      data.centerline[i * 3 + 1] - terrain.at(data.centerline[i * 3], data.centerline[i * 3 + 2]);
    if (delta < deepestCut) {
      deepestCut = delta;
      worstAt = i * SAMPLE_SPACING;
    }
    if (delta > highestFill) highestFill = delta;
    sumAbsolute += Math.abs(delta);
    magnitudes[i] = Math.abs(delta);
  }
  magnitudes.sort();

  data.measured.minRadius = Number(minCurveRadius(trimmed).toFixed(2));
  data.measured.maxGradient = Number(maxGradient(trimmed).toFixed(4));
  data.measured.hairpins = countHairpins(trimmed);
  data.measured.deepestCut = Number(deepestCut.toFixed(1));
  data.measured.highestFill = Number(highestFill.toFixed(1));
  data.measured.meanEarthwork = Number((sumAbsolute / (keep + 1)).toFixed(2));
  data.measured.earthwork95 = Number(
    magnitudes[Math.min(keep, Math.floor((keep + 1) * 0.95))].toFixed(2),
  );
  data.measured.worstAt = Number(worstAt.toFixed(0));
  if (process.env.STAGES) {
    console.log(c.dim(`      [gipfel] ${tail.toFixed(0)} m Schwanz unter Grund gekappt`));
  }
  return tail;
}

function countHairpins(sampled) {
  const { positions, count } = sampled;
  let hairpins = 0;
  let run = 0;
  let sign = 0;

  for (let i = 1; i < count - 1; i++) {
    const ax = positions[i * 3] - positions[(i - 1) * 3];
    const az = positions[i * 3 + 2] - positions[(i - 1) * 3 + 2];
    const bx = positions[(i + 1) * 3] - positions[i * 3];
    const bz = positions[(i + 1) * 3 + 2] - positions[i * 3 + 2];

    const cross = ax * bz - az * bx;
    const dot = ax * bx + az * bz;
    const turn = Math.atan2(cross, dot);
    const s = Math.sign(turn);

    if (s !== sign && Math.abs(turn) > 1e-6) {
      if (run > (150 * Math.PI) / 180) hairpins++;
      run = 0;
      sign = s;
    }
    run += Math.abs(turn);
  }
  if (run > (150 * Math.PI) / 180) hairpins++;

  return hairpins;
}

// ── Leitplanken ─────────────────────────────────────────────────────────────

/**
 * Abschnitte bestimmen, an denen eine Leitplanke steht — PLAN.md P3 / 3.4.
 *
 * Die Bedingung ist nicht „schöne Stelle", sondern „hier geht es hinunter":
 * gemessen wird der Höhenunterschied zwischen der Fahrbahn und dem Gelände am
 * **Fuß der Böschung**, also einen Böschungsbreite seitlich versetzt. Fällt es
 * dort um mehr als `drop` ab, gehört an diese Seite eine Planke.
 *
 * Das Gelände wird dabei so gelesen, wie es **vor** dem Einschneiden aussieht.
 * Das ist kein Kompromiss, sondern richtig: die Böschung selbst schafft ja erst
 * die Fläche, auf der die Straße liegt, und ein Abfall dahinter bleibt ein
 * Abfall. Nur deshalb kann die Planung überhaupt hier stattfinden statt im
 * Renderer, der die fertige Karte hat, aber keinen Zugriff auf die Zeit davor.
 *
 * Kurze Unterbrechungen werden geschlossen und kurze Läufe verworfen — eine
 * Leitplanke von vier Metern Länge ist ein Fremdkörper, kein Bauteil.
 */
function planGuardrails(terrain, sampled, halfWidth, options = {}) {
  const reach = options.reach ?? 16;
  const drop = options.drop ?? 7;
  const minRun = options.minRun ?? 24;
  const maxGap = options.maxGap ?? 16;

  const { positions, distances, count } = sampled;
  const rails = [];

  for (const side of [-1, 1]) {
    let runStart = -1;
    let gapSince = -1;

    for (let i = 0; i < count; i++) {
      const px = positions[i * 3];
      const py = positions[i * 3 + 1];
      const pz = positions[i * 3 + 2];

      // Fahrtrichtung aus den Nachbarn; quer dazu liegt die Kante.
      const a = Math.max(i - 1, 0);
      const b = Math.min(i + 1, count - 1);
      const tx = positions[b * 3] - positions[a * 3];
      const tz = positions[b * 3 + 2] - positions[a * 3 + 2];
      const length = Math.hypot(tx, tz) || 1;
      const nx = (-tz / length) * side;
      const nz = (tx / length) * side;

      const distance = halfWidth + reach;
      const fall = py - terrain.at(px + nx * distance, pz + nz * distance);
      const exposed = fall > drop;

      if (exposed) {
        if (runStart < 0) runStart = distances[i];
        gapSince = -1;
      } else if (runStart >= 0) {
        if (gapSince < 0) gapSince = distances[i];
        else if (distances[i] - gapSince > maxGap) {
          if (gapSince - runStart >= minRun) rails.push({ side, from: runStart, to: gapSince });
          runStart = -1;
          gapSince = -1;
        }
      }
    }

    if (runStart >= 0) {
      const end = gapSince >= 0 ? gapSince : distances[count - 1];
      if (end - runStart >= minRun) rails.push({ side, from: runStart, to: end });
    }
  }

  return rails.map((r) => ({
    side: r.side,
    from: Number(r.from.toFixed(1)),
    to: Number(r.to.toFixed(1)),
  }));
}

// ── Kreuzungen ──────────────────────────────────────────────────────────────

/** Nächster Punkt auf der Mittellinie einer bereits gebauten Strecke, in XZ. */
function nearestOnRoad(built, roadId, near) {
  const road = built.find((r) => r.id === roadId);
  if (!road) return null;

  const line = road.centerline;
  const count = line.length / 3;
  let best = null;
  let bestDistance = Infinity;

  for (let i = 0; i < count; i++) {
    const distance = Math.hypot(line[i * 3] - near[0], line[i * 3 + 2] - near[1]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = [line[i * 3], line[i * 3 + 2]];
    }
  }

  return best;
}

/**
 * Anschluss einer Strecke an das bereits gebaute Netz — PLAN.md P3 / 3.5.
 *
 * Zwei Straßen, die sich treffen, müssen an der Stelle **dieselbe Höhe** haben.
 * Das klingt selbstverständlich und war es nicht: bis hierher bekam jede
 * Strecke ihr Höhenprofil für sich, und am Übergang zwischen Pass und Ring
 * stand ein sichtbarer Versatz — zwei Fahrbahnen, die sich kreuzen, ohne sich
 * zu berühren.
 *
 * Der Anschluss läuft in zwei Schritten, und die Reihenfolge ist zwingend:
 *
 *  1. **In XZ einrasten.** Der Endknoten wird auf den nächsten Punkt der
 *     fremden Mittellinie geschoben. Ohne das stimmt die Höhe an einem Punkt,
 *     der ein paar Meter neben der Kreuzung liegt.
 *  2. **Höhe festnageln.** Der eingerastete Knoten bekommt die Höhe der
 *     Hauptstrecke und wird in `fitElevation` festgehalten. Die
 *     Steigungsbegrenzung muss ihn dann umgehen — deshalb kennt sie `pins`.
 *
 * Was hier **nicht** passiert: die Fahrbahnflächen verschneiden. Beide liegen
 * nach dem Anschluss auf derselben Höhe und würden im Tiefenpuffer um jedes
 * Pixel streiten. Dagegen bekommt die anschließende Strecke einen Rücksprung
 * (`trimStart` / `trimEnd`) mitgegeben; das Mesh beginnt erst am Fahrbahnrand
 * der Hauptstrecke.
 */
function connectToNetwork(points, built, closed, radius = 150) {
  if (closed || built.length === 0) return { pins: null, junctions: [] };

  const junctions = [];

  for (const which of ['start', 'end']) {
    const index = which === 'start' ? 0 : points.length - 1;
    const [x, z] = points[index];

    let best = null;
    for (const road of built) {
      const line = road.centerline;
      const count = line.length / 3;
      for (let i = 0; i < count; i++) {
        const dx = line[i * 3] - x;
        const dz = line[i * 3 + 2] - z;
        const distance = Math.hypot(dx, dz);
        if (best === null || distance < best.distance) {
          best = {
            distance,
            roadId: road.id,
            x: line[i * 3],
            y: line[i * 3 + 1],
            z: line[i * 3 + 2],
            width: road.widths[i] ?? 6,
          };
        }
      }
    }

    if (best === null || best.distance > radius) continue;

    // Die Verschiebung **auslaufen lassen**, nicht nur den Endknoten setzen.
    //
    // Der erste Entwurf schob allein den Endpunkt auf die Kreuzung. Bei 3,55 m
    // Versatz und 4 m Knotenabstand ist das ein 42°-Knick — der Anschluss hat
    // genau das zerstört, was er verbinden sollte: der Mindestradius der
    // Dorfstraße fiel von 28,8 m auf 12,0 m. Ein zweiter Versuch entfernte die
    // überholten Knoten; das half nur, solange der Versatz größer war als der
    // Knotenabstand.
    //
    // Verteilt über ein Dutzend Knoten bleibt die Krümmung dagegen im Rahmen:
    // 3,55 m auf 48 m Auslauf sind eine Ablenkung von wenigen Grad.
    const taper = 12;
    const shiftX = best.x - points[index][0];
    const shiftZ = best.z - points[index][1];

    for (let k = 0; k < taper; k++) {
      const at = which === 'start' ? k : points.length - 1 - k;
      if (at < 0 || at >= points.length) break;
      // Kosinus statt Gerade: eine lineare Rampe hinterlässt am Auslaufende
      // einen Knick in der Krümmung.
      const weight = 0.5 * (1 + Math.cos((Math.PI * k) / taper));
      points[at] = [points[at][0] + shiftX * weight, points[at][1] + shiftZ * weight];
    }
    points[index] = [best.x, best.z];

    junctions.push({
      at: which,
      with: best.roadId,
      moved: Number(best.distance.toFixed(2)),
      height: Number(best.y.toFixed(2)),
      // Rücksprung: halbe Fahrbahn der Hauptstrecke plus ein Meter Fuge.
      trim: Number((best.width / 2 + 1).toFixed(2)),
      pinHeight: best.y,
    });
  }

  const pins = new Map();
  for (const junction of junctions) {
    pins.set(junction.at === 'start' ? 0 : points.length - 1, junction.pinHeight);
    delete junction.pinHeight;
  }

  return { pins: pins.size > 0 ? pins : null, junctions };
}

// ── Netzdefinition ──────────────────────────────────────────────────────────

/**
 * Die Wegpunkte des Netzes in XZ — **Zielvorgaben, keine Trasse**.
 *
 * Die Lage folgt dem Zonenplan aus SPEC §2.1: Berg im Nordwesten, Wald im
 * Nordosten, Reisfelder im Westen, Stadt im Osten, Küste im Süden. Norden
 * ist −Z. Zwischen zwei Wegpunkten sucht sich die Straße ihren Weg selbst;
 * wie viele Kehren dabei entstehen, entscheidet das Gelände.
 */
function layout(terrain) {
  const ring = [
    [-780, 120],
    [-560, -380],
    [-180, -720],
    [380, -860],
    [880, -620],
    [980, -120],
    [860, 300],
    [560, 720],
    [80, 940],
    [-420, 950],
    [-880, 720],
    [-1020, 340],
  ].map(([x, z]) => pushInland(terrain, x, z, 3));

  // Der Pass zweigt am zweiten Ring-Wegpunkt ab und steigt ins Massiv. Der
  // Startpunkt ist **exakt** ein Ring-Wegpunkt, damit die Kreuzungserkennung in
  // 3.5 ihn findet und beide Strecken dort dieselbe Höhe bekommen.
  // Das Passende liegt am Gipfel, und wo der ist, sagt das Höhenfeld, nicht
  // eine Zahl im Quelltext: die Erosion verschiebt ihn bei jedem neuen Seed.
  // Der alte, fest eingetragene Endpunkt (−880, −880) lag auf 161 m, während
  // der Gipfel 450 m hoch bei (−888, −1368) steht. Der „Bergpass" stieg damit
  // 78 Meter — kein Wunder, dass ohne die künstlich eingebauten Halbkreise
  // keine einzige Kehre nötig war.
  return {
    ring,
    passStart: ring[1],
    passRegion: { minX: -1400, maxX: -200, minZ: -1450, maxZ: -500 },
    village: [
      [-760, 60],
      [-640, -60],
      [-470, -110],
      [-300, -60],
      [-190, 90],
    ].map(([x, z]) => pushInland(terrain, x, z, 3)),

    /**
     * Stadt im Osten — PLAN.md P6 / 6.1.
     *
     * **Eine geschlossene Schleife, keine gekreuzten Achsen.** Ein
     * Straßenraster wäre das Naheliegende und scheitert an einer Eigenschaft
     * dieses Generators, die aus gutem Grund so ist: zwei Strecken, die sich
     * treffen, bekommen an der Kreuzung dieselbe Höhe und die einmündende einen
     * **Rücksprung**, damit nicht zwei koplanare Fahrbahnen um jedes Pixel
     * streiten (P3 / 3.5). Der Rücksprung greift an einem Streckenende. Eine
     * Kreuzung *mitten* in beiden Strecken — also jeder Knoten eines Rasters —
     * hat kein Ende, an dem er zurückspringen könnte.
     *
     * Deshalb liefert die Schleife die befahrbare Stadtstraße, und die
     * Nebenstraßen zwischen den Blöcken entstehen im `CityGenerator` als Teil
     * der Bodenplatte. Sie sind Fläche, keine Splines — was sie auch sein
     * sollten: sie werden nicht befahren, nicht ins Gelände geschnitten und
     * brauchen weder Leitplanke noch Querneigung.
     *
     * Die Wegpunkte umschließen den Distrikt mit rund 40 m Abstand zum Rand,
     * damit an beiden Seiten der Fahrbahn noch Bauland liegt.
     */
    cityLoop: [
      [500, -10],
      [740, -10],
      [745, 130],
      [730, 250],
      [560, 255],
      [485, 150],
    ],
    /**
     * Zufahrt: vom Ring nach Westen an die Schleife.
     *
     * Der Anschlusspunkt am Ring ist **nicht frei wählbar**. Der Ring fällt von
     * 61 m an der Nordkante des Plateaus auf 29 m bei z ≈ 204 und läuft erst ab
     * dort auf Stadthöhe. Ein Anschluss weiter nördlich (etwa bei z = −50, wo
     * der Ring auf 45 m steht) müsste 15 Höhenmeter auf 150 m Strecke abbauen —
     * 10 % bei 6 % erlaubter Neigung. Der Anschluss liegt deshalb südöstlich,
     * wo Ring und Stadtebene sich ohnehin auf einen Meter nahekommen.
     */
    cityLink: [
      [880, 215],
      [800, 205],
      [742, 200],
    ],
  };
}

function buildRoad(
  terrain,
  { id, type, closed, tags, points, banking = 0, pins, junctions = [], level = null },
) {
  const settings = TYPES[type];

  const toNodes = (heights) =>
    points.map((p, i) => ({
      pos: [Number(p[0].toFixed(3)), Number(heights[i].toFixed(3)), Number(p[1].toFixed(3))],
      width: settings.width,
      banking,
    }));

  /**
   * Sicherheitsabstand zwischen Kontrollpunkt-Neigung und Grenzwert.
   *
   * Er ist nötig, weil die Spline-Kurve zwischen den Kontrollpunkten in der
   * Höhe überschwingt, und er lässt sich **nicht ausrechnen**: wie stark sie
   * überschwingt, hängt am Verhältnis benachbarter Knotenabstände, und das
   * variiert über die Strecke. Ein fester Wert war deshalb entweder zu knapp
   * (gemessene 9,4 % bei 7 % Soll) oder unnötig streng.
   *
   * Also gemessen statt geraten: anpassen, neu abtasten, die **fertige**
   * Mittellinie messen, wiederholen. Das ist dieselbe Umstellung wie bei der
   * Steigungsbegrenzung selbst — von „in die richtige Richtung schieben" zu
   * „nachprüfen, ob es stimmt".
   */
  let margin = 0.85;
  let heights = null;
  let sampled = null;
  let attempts = 0;

  for (attempts = 1; attempts <= 16; attempts++) {
    heights = fitElevation(terrain, points, {
      maxGrade: settings.maxGradient,
      closed,
      margin,
      pins,
      level,
    });
    sampled = sampleSpline(toNodes(heights), { closed, spacing: SAMPLE_SPACING });
    const reached = maxGradient(sampled);
    if (reached <= settings.maxGradient) break;
    margin *= Math.max(0.7, (settings.maxGradient / reached) * 0.97);
  }

  const nodes = toNodes(heights);

  // Erdbewegung entlang der **ganzen** Strecke, nicht nur an den
  // Kontrollpunkten. Das ist der Unterschied zwischen „die Höhe passt an den
  // zwölf Stützstellen" und „die Straße liegt im Gelände": zwischen zwei
  // Kontrollpunkten kann ein Grat stehen, den die Anpassung nie zu sehen
  // bekommt. Beim ersten Lauf schnitt der Bergpass dadurch 291 m tief ein —
  // eine Schlucht, gemessen erst vom Baker, der sie ausgehoben hat.
  //
  // Berichtet wird nicht nur der Extremwert. Ein einzelner Ausreißer über einer
  // Schlucht sagt etwas ganz anderes als eine Trasse, die auf ganzer Länge im
  // Hang klebt — und nur der Mittelwert unterscheidet die beiden Fälle.
  let deepestCut = 0;
  let highestFill = 0;
  let sumAbsolute = 0;
  let worstAt = 0;
  const magnitudes = new Float64Array(sampled.count);
  for (let i = 0; i < sampled.count; i++) {
    const delta =
      sampled.positions[i * 3 + 1] -
      terrain.at(sampled.positions[i * 3], sampled.positions[i * 3 + 2]);
    if (delta < deepestCut) {
      deepestCut = delta;
      worstAt = sampled.distances[i];
    }
    if (delta > highestFill) highestFill = delta;
    sumAbsolute += Math.abs(delta);
    magnitudes[i] = Math.abs(delta);
  }
  magnitudes.sort();
  const percentile95 = magnitudes[Math.min(magnitudes.length - 1, Math.floor(magnitudes.length * 0.95))];

  // Machbarkeit: reicht die Länge überhaupt für den Höhenunterschied?
  //
  // Diese Zahl trennt zwei Fälle, die im Erdbau gleich aussehen. Liegt die
  // Straße neben dem Gelände, weil die Trasse schlecht ist, hilft eine andere
  // Trasse. Liegt sie daneben, weil 357 Höhenmeter bei 11 % nun einmal 3245 m
  // Strecke brauchen und nur 2610 m da sind, hilft keine Trassierung der Welt —
  // dann ist das Ziel falsch gewählt.
  const climb = Math.abs(
    terrain.at(points[points.length - 1][0], points[points.length - 1][1]) -
      terrain.at(points[0][0], points[0][1]),
  );
  const neededLength = climb / settings.maxGradient;

  const rails = planGuardrails(terrain, sampled, settings.width / 2);
  const railLength = rails.reduce((sum, r) => sum + (r.to - r.from), 0);

  const measured = {
    minRadius: Number(minCurveRadius(sampled).toFixed(2)),
    maxGradient: Number(maxGradient(sampled).toFixed(4)),
    hairpins: countHairpins(sampled),
    /** Negativ = die Straße liegt unter dem Gelände, es muss abgetragen werden. */
    deepestCut: Number(deepestCut.toFixed(1)),
    highestFill: Number(highestFill.toFixed(1)),
    meanEarthwork: Number((sumAbsolute / sampled.count).toFixed(2)),
    earthwork95: Number(percentile95.toFixed(2)),
    worstAt: Number(worstAt.toFixed(0)),
    gradientMargin: Number(margin.toFixed(3)),
    gradientAttempts: attempts,
    climb: Number(climb.toFixed(1)),
    neededLength: Number(neededLength.toFixed(0)),
    railLength: Number(railLength.toFixed(0)),
  };

  return {
    data: {
      id,
      type,
      closed,
      tags,
      nodes,
      centerline: Array.from(sampled.positions, (v) => Number(v.toFixed(3))),
      widths: Array.from(sampled.widths, (v) => Number(v.toFixed(3))),
      banking: Array.from(sampled.banking, (v) => Number(v.toFixed(3))),
      length: Number(sampled.length.toFixed(2)),
      junctions,
      rails,
      // Wie viel Mittellinie am Anfang bzw. Ende **nicht** vermascht wird, in
      // Metern. Siehe `connectToNetwork`.
      trimStart: junctions.find((j) => j.at === 'start')?.trim ?? 0,
      trimEnd: junctions.find((j) => j.at === 'end')?.trim ?? 0,
      measured,
    },
    settings,
  };
}

// ── Hauptlauf ───────────────────────────────────────────────────────────────

async function main() {
  const terrainDir = join(ROOT, 'assets/generated/terrain');
  const meta = JSON.parse(await readFile(join(terrainDir, 'meta.json'), 'utf8'));

  // **Gegen die zirkuläre Kette.** Der Generator braucht ein Höhenfeld, der
  // Baker braucht die Straßen; aufgelöst wird das durch zweimaliges Backen, und
  // der erste Durchgang muss `--no-roads` sein. Läuft der Generator stattdessen
  // gegen ein bereits eingeschnittenes Feld, trassiert er durch seine eigenen
  // Einschnitte: gemessen wurde derselbe Bergpass einmal mit 3966 m, 8 Kehren
  // und 28,8 m Erdbau und einmal mit 3410 m, 5 Kehren und 11,2 m — dieselbe
  // Quelldatei, dieselben Parameter. Das ist keine Feinheit, das ist der
  // Unterschied zwischen einer Messung und einer Zahl.
  if (meta.carved && !process.argv.includes('--allow-carved')) {
    console.error(
      c.red('\n  Das geladene Höhenfeld enthält bereits eingeschnittene Straßen.\n') +
        '  Der Generator würde durch seine eigenen Einschnitte trassieren und Zahlen\n' +
        '  liefern, die niemand reproduzieren kann.\n\n' +
        c.bold('    npm run bake:clean') +
        '   ← erst das, dann noch einmal hierher\n' +
        c.bold('    npm run world') +
        '        ← oder gleich die ganze Kette\n\n' +
        c.dim('  (--allow-carved hebt die Sperre auf, wenn du weißt, warum.)\n'),
    );
    process.exitCode = 1;
    return;
  }
  const buffer = await readFile(join(terrainDir, meta.heightmap.file));
  const raw = new Uint16Array(buffer.buffer.slice(0));

  const terrain = createTerrain(
    raw,
    meta.heightmap.res,
    meta.world.size,
    meta.world.minHeight,
    meta.heightmap.heightRange,
  );

  console.log(c.bold('\nStraßennetz-Generator'));

  /**
   * Suchgitter je Zellgröße, auf Abruf gebaut.
   *
   * Nicht alle Strecken wollen dasselbe Gitter. Für eine Kehre muss das
   * Verbindungsstück des Z die beiden Bogentangenten tragen: bei
   * `floor = minRadius · 1,3` = 19,5 m sind das zweimal 19,5 m, also knapp 40 m.
   * Genau so lang ist bei 40 m Zellgröße ein Querschritt. Bei 20 m sind es 20 m,
   * die Bögen werden auf 9,7 m gestaucht, fallen unter die Untergrenze und die
   * Ecke wird entfernt — die Kehre stirbt an der Auflösung der Suche, nicht am
   * Gelände.
   *
   * Der Ring bekommt die 40 m **nicht**: dort kostet die gröbere Suche Erdbau
   * (gemessen 13,0 m gegen einen Grenzwert von 12 m), und Kehren braucht er
   * keine. 40 m sind für den Pass ohnehin die ehrlichere Zahl — 6,5 m Fahrbahn
   * plus zweimal 15 m Böschung sind 36,5 m Fußabdruck.
   */
  const grids = new Map();
  const gridFor = (cellSize) => {
    const key = cellSize ?? 0;
    if (!grids.has(key)) {
      grids.set(
        key,
        createRouteGrid(terrain, meta.world.size, cellSize ? { cellSize } : {}),
      );
    }
    return grids.get(key);
  };
  const grid = gridFor(null);
  console.log(
    c.dim(
      `  Suchgitter ${grid.res}×${grid.res} Zellen à ${grid.cellSize} m ` +
        '(geglättet über die Böschungsbreite)',
    ),
  );

  const plan = layout(terrain);
  const definitions = [
    {
      id: 'ring',
      type: 'highway',
      closed: true,
      tags: ['ringstrecke', 'startlinie'],
      waypoints: plan.ring,
      banking: 2,
      // Die Wegpunkte sind der Entwurf, nicht nur ein Vorschlag: ohne Korridor
      // nahm der Ring das Gelände so ernst, dass er auf 13 km Umweg mit
      // Serpentinen anwuchs. Das ist die richtige Antwort auf „billigster Weg"
      // und die falsche auf „Ringstraße".
      corridor: 260,
    },
    {
      id: 'toge',
      type: 'mountain',
      closed: false,
      tags: ['drift-strecke', 'bergpass'],
      // Der Endpunkt steht nicht fest: er wird auf die Höhe begrenzt, die die
      // Strecke bei 11 % überhaupt erreichen kann. Siehe Hauptlauf.
      // Der Anfang liegt auf der **fertigen** Ringstraße, nicht auf ihrem
      // Entwurfswegpunkt. Zwischen beiden liegen 96 m: die Verrundung schneidet
      // an einem Wegpunkt, der zugleich eine Kurve ist, genau dort die Ecke ab.
      // Am Entwurfspunkt zu starten und hinterher einzurasten hieß, die ersten
      // 96 m Straße zu verschieben, nachdem ihr Höhenprofil feststand — die
      // gemessene Steigung sprang auf 32,3 %.
      startsOn: { road: 'ring', near: plan.passStart },
      summit: { region: plan.passRegion },
      // Gröberes Suchgitter als der Rest des Netzes — siehe `gridFor`.
      cellSize: 40,
      // Die einzige Strecke, die Kehren bekommt. SPEC §2.1 fordert sie für den
      // Bergpass; überall sonst wäre eine Haarnadel ein Fehler.
      hairpins: true,
      /**
       * **Der Regler zwischen Serpentinen und Erdbau. Bewusst auf 0.**
       *
       * Eine Kehre wird symmetrisch um den Scheitel aufgeweitet und schiebt
       * damit ihre halbe Schleife in den Hang: gemessen ⌀ 49 m Einschnitt an den
       * Kehren gegen 20 m auf der übrigen Strecke. `downhillBias` versetzt die
       * Schleife hangabwärts, in Vielfachen des Querstücks.
       *
       * Es hilft — und kostet genau das, wofür es da ist:
       *
       * | Versatz | Kehren | Erdbau ⌀ | Strecke über 50 m Einschnitt |
       * |---|---|---|---|
       * | 0     | 5     | 30,2 m | 740 m (20,2 %) |
       * | **0,3** | **2** | **19,5 m** | **320 m (10,7 %)** |
       * | 0,75  | 1     | 24,1 m | 508 m (17,8 %) |
       *
       * Auf einem 45-%-Hang liegen zwei Serpentinenschenkel zwangsläufig 50 bis
       * 100 m auseinander im Gelände, aber nur 30 bis 60 m in der Fahrbahnhöhe —
       * die Differenz *ist* der Einschnitt. Die Kehren sind der Erdbau, nicht
       * ein Nebeneffekt davon.
       *
       * **0,3 steht hier, nicht 0.** Mit 0 legt der Pass rund 300 × 250 m Massiv
       * um 50 bis 150 m tiefer — im Erdbau-Bild eine zusammenhängende Fläche,
       * kein Hanganschnitt. Das ist in einem Spiel, das jemand ansieht, der
       * größere Fehler als ein paar Kehren zu wenig.
       *
       * Vier Hebel wurden gegen diesen Zielkonflikt gemessen und alle vier
       * verworfen, weil sie den Erdbau nur über den Verlust von Kehren senken:
       * Gegensteigung als Kostenterm (12 → 0 Kehren), Korridorbreite,
       * Mindestabstand zwischen Kehren, und dieser Versatz selbst. Der Grund ist
       * Geometrie, kein Parameter — siehe PLAN.md, „Wie der Bergpass zu seinen
       * Kehren kam".
       */
      downhillBias: 0.3,
      waypoints: [plan.passStart, plan.passStart],
      banking: 3,
      // **900 m, nicht 260.** Der enge Korridor stammt aus der Zeit, als es
      // keine baubaren Kehren gab: ohne Korridor lief der Pass als Spirale um
      // den Berg, und die Antwort darauf war, ihn ins Tal zu zwingen. Mit
      // `widenHairpins` gewinnt er die Höhe stattdessen in Serpentinen, und
      // dafür braucht er Platz. Gemessen über 260 / 400 / 600 / 900 / 1200 /
      // 1600 m: die Kehren steigen von 9 auf 17 und der Erdbau fällt von
      // 33,1 auf 24,2 m; darüber wird beides wieder schlechter.
      corridor: 700,
    },
    {
      id: 'dorf',
      type: 'village',
      closed: false,
      tags: ['dorf'],
      waypoints: plan.village,
      banking: 0,
    },
    {
      id: 'stadt',
      type: 'city',
      closed: true,
      tags: ['stadt', 'nachtstrecke'],
      waypoints: plan.cityLoop,
      // Keine Querneigung. Eine Stadtstraße ist eine Ebene mit Bordstein, kein
      // Kurvenprofil — und die Bodenplatte des Distrikts, an die sie anschließt,
      // ist per Konstruktion waagerecht.
      banking: 0,
      // Der Punkt der ganzen Übung: das Profil liegt auf der Stadtebene statt
      // auf dem Gelände. Siehe `fitElevation`, Abschnitt „Stadtebene".
      level: CITY_ROAD_LEVEL,
      // Enger Korridor. Auf einer Fläche mit 0,81 m Höhenunterschied ist jede
      // Trasse gleich billig, und ohne Zwang wandert die Suche dorthin, wo das
      // Rauschen zufällig ein paar Zentimeter spart. Der Entwurf ist hier die
      // Vorgabe, nicht ein Vorschlag ans Gelände.
      corridor: 70,
    },
    {
      id: 'zufahrt',
      type: 'city',
      closed: false,
      tags: ['stadt', 'anschluss'],
      waypoints: plan.cityLink,
      banking: 0,
      level: CITY_ROAD_LEVEL,
      corridor: 70,
    },
  ];

  // Trassieren **und** bauen in einer Schleife je Strecke.
  //
  // Getrennt ginge es nicht: ob eine Trasse taugt, zeigt sich erst an der
  // fertigen Mittellinie, und die entsteht erst nach Verrundung, Ausdünnung,
  // Höhenanpassung und Spline-Auswertung. Jede dieser Stufen verändert genau
  // die Größen, um die es geht. Die Schleife misst deshalb das Endergebnis und
  // stellt danach die Trassierung neu ein — nicht umgekehrt.
  const roads = [];
  let violations = 0;
  let overburden = 0;
  let totalLength = 0;

  for (const definition of definitions) {
    const settings = TYPES[definition.type];
    // Ein Bergpass endet dort, wo er hinkommt.
    //
    // Der Gipfel im Nordwesten steht 450 m hoch, der Anschluss an den Ring auf
    // 83 m. Bei 11 % Höchstneigung braucht dieser Höhenunterschied über drei
    // Kilometer Strecke, und so viel gibt der Hang zwischen beiden nicht her.
    // Ohne diese Schleife lief das nicht als Fehler auf, sondern als Erdbau:
    // die Höhenanpassung legte das Profil so flach sie durfte, das Ende blieb
    // 147 m unter dem Gelände, und im Bild stand ein Graben.
    //
    // Also wird das Ziel abgesenkt, bis es passt — gemessen an der Strecke, die
    // tatsächlich herauskommt, nicht an einer Schätzung.
    let summitCap = Infinity;

    // Steigungsvorrat für die Suche: das Verrunden kürzt die Trasse, der
    // Höhengewinn bleibt. 0,8 deckt das ab. Eine Regelschleife stand hier
    // schon — sie lief davon: flacher planen ergab eine längere Trasse, längere
    // Trasse mehr Kehren, mehr Kehren mehr Verlust beim Verrunden. Nach sieben
    // Anläufen standen 30 km Trasse. Die Steigung sichert ohnehin die
    // Höhenanpassung zu; hier genügt ein fester, begründeter Wert.
    let route = null;
    let built = null;
    let tries = 0;

    for (tries = 1; tries <= 5; tries++) {
      const start = definition.startsOn
        ? nearestOnRoad(roads, definition.startsOn.road, definition.startsOn.near)
        : null;
      const waypoints = definition.summit
        ? [start ?? definition.waypoints[0], findSummit(terrain, definition.summit.region, summitCap)]
        : definition.waypoints;

      // **Eigenkollision an der fertigen Mittellinie prüfen, nicht früher.**
      //
      // Zwei benachbarte Kehren laufen erst ineinander, nachdem Bögen,
      // Kontrollpunkte und Spline-Abtastung durch sind — gemessen kreuzte der
      // Pass sich bei km 3,00 und km 3,22 mit 1,1 m Achsabstand, während der
      // Polygonzug davor noch 53 m Abstand hielt. Geprüft wird deshalb genau
      // die Linie, die der Baker einschneidet und der Renderer vermascht.
      // Trifft es zu, fällt die Aufweitung der Kehre **zwischen** beiden
      // Fundstellen weg — nicht die dem Kreuz nächstgelegene: das Kreuz liegt
      // an den Schenkeln, der Scheitel weit davon am Ende der Schleife.
      const skipApexes = new Set();
      const clearance = settings.width + 2;
      for (let attempt = 0; ; attempt++) {
        route = traceRoute(gridFor(definition.cellSize ?? null), waypoints, {
          settings,
          closed: definition.closed,
          headroom: definition.headroom ?? 0.8,
          hairpins: definition.hairpins === true,
          downhillBias: definition.downhillBias ?? 0,
          skipApexes,
          ...(definition.corridor ? { corridor: definition.corridor } : {}),
        });
        const connection = connectToNetwork(route.points, roads, definition.closed);
        built = buildRoad(terrain, {
          ...definition,
          points: route.points,
          pins: connection.pins,
          junctions: connection.junctions,
        });

        const line = built.data.centerline;
        const path = [];
        for (let i = 0; i < line.length; i += 3) path.push([line[i], line[i + 2]]);
        const hit = route.apexes.length > 0 ? selfCollision(path, clearance) : null;
        if (!hit || attempt >= route.apexes.length) break;

        let culprit = -1;
        let best = Infinity;
        for (const apex of route.apexes) {
          if (skipApexes.has(apex.index)) continue;
          let closest = Infinity;
          for (let k = hit.from; k <= hit.to; k++) {
            const d = Math.hypot(apex.x - path[k][0], apex.z - path[k][1]);
            if (d < closest) closest = d;
          }
          if (closest < best) {
            best = closest;
            culprit = apex.index;
          }
        }
        if (culprit < 0) break;
        skipApexes.add(culprit);
      }
      // **Den Schwanz abschneiden, der unter Grund läuft.**
      //
      // Auf den letzten Metern steigt das Massiv mit 17 %, die Fahrbahn darf
      // 11 % — sie fällt zurück und wühlt sich als Einschnitt zu einem Ziel,
      // das sie nicht erreichen kann. Gemessen endete der Pass 59 m unter
      // Grund; dieser Schwanz allein trug den mittleren Erdbau von 24 auf 31 m.
      //
      // Zwei Antworten wurden gemessen und beide verworfen: das **Ziel
      // abzusenken** nimmt der Trasse die Länge und damit die Kehren (9 → 1),
      // und die **Kontrollpunkte zu kürzen und neu zu bauen** legt das
      // Höhenprofil neu aus, wodurch auch weiter unten Kehren verschwinden
      // (9 → 7). Richtig ist, Trasse und Profil unangetastet zu lassen und nur
      // die fertige Linie hinten zu kappen — ein Bergpass hört an einem
      // Aussichtspunkt auf, nicht in einem Loch.
      if (definition.summit) trimSummitTail(terrain, built.data);

      if (process.env.STAGES && route.apexes.length > 0) {
        console.log(
          c.dim(
            `      [kehren] ${route.apexes.length - skipApexes.size} von ` +
              `${route.apexes.length} Scheiteln aufgeweitet` +
              (skipApexes.size > 0
                ? `, ${skipApexes.size} wegen Eigenkollision zurückgenommen`
                : ''),
          ),
        );
      }

      const m = built.data.measured;
      if (!definition.summit || m.neededLength <= built.data.length) break;
      // Erreichbare Höhe aus der **gemessenen** Streckenlänge, mit 10 % Reserve
      // für das, was die Höhenanpassung noch glätten muss.
      summitCap =
        terrain.at(waypoints[0][0], waypoints[0][1]) +
        built.data.length * settings.maxGradient * 0.9;
    }

    const data = built.data;
    roads.push(data);
    totalLength += data.length;

    const radiusOk = data.measured.minRadius >= settings.minRadius;
    // Die äußere Schleife in buildRoad misst die fertige Mittellinie, also gilt
    // hier der Grenzwert ohne Zuschlag.
    const gradeOk = data.measured.maxGradient <= settings.maxGradient * 1.001;
    if (!radiusOk || !gradeOk) violations++;

    // Erdbau wird getrennt geführt und **nicht** in den Fehlercode gezogen.
    // Radius und Steigung entscheiden, ob die Straße befahrbar ist; wer sie
    // reißt, hat kein Ergebnis. Der Erdbau entscheidet, ob sie ins Gelände
    // gehört — das ist eine Aussage über die Qualität der Trasse, und sie darf
    // die Bake-Kette nicht anhalten, während genau daran gearbeitet wird.
    // Laut ist sie trotzdem: die Zeile steht in Rot und wird unten gezählt.
    const earthworkOk = data.measured.meanEarthwork <= settings.maxEarthwork;
    if (!earthworkOk) overburden++;

    const mark = radiusOk && gradeOk ? c.green('✓') : c.red('✗');
    console.log(
      `  ${mark} ${data.id.padEnd(6)} ${String(Math.round(data.length)).padStart(5)} m  ` +
        `· R min ${String(data.measured.minRadius).padStart(6)} m (Soll ≥ ${settings.minRadius})  ` +
        `· Steigung ${(data.measured.maxGradient * 100).toFixed(1).padStart(5)} % ` +
        `(Soll ≤ ${(settings.maxGradient * 100).toFixed(0)} %)  ` +
        `· Kehren ${String(data.measured.hairpins).padStart(2)}`,
    );
    console.log(
      c.dim(
        `      Luftlinie ${Math.round(route.directLength)} m → Trasse ` +
          `${Math.round(route.rawLength)} m → Straße ${Math.round(data.length)} m · ` +
          `${route.vertices} Ecken → ${route.corners} Bögen, kleinster ` +
          `${route.filletRadius.toFixed(1)} m · ` +
          `${data.nodes.length} Knoten · ${tries} Anlauf(en) · ` +
          `${data.rails.length} Leitplanken über ${data.measured.railLength} m ` +
          `(${((data.measured.railLength / data.length) * 100).toFixed(0)} % der Strecke)`,
      ),
    );
    if (data.junctions.length > 0) {
      console.log(
        c.dim(
          `      Kreuzungen: ` +
            data.junctions
              .map(
                (j) =>
                  `${j.at === 'start' ? 'Anfang' : 'Ende'} an ${j.with} ` +
                  `(${j.moved} m eingerastet, Höhe ${j.height} m, ${j.trim} m Rücksprung)`,
              )
              .join(' · '),
        ),
      );
    }
    const earthworkLine =
      `      Erdbau ⌀ ${data.measured.meanEarthwork.toFixed(1)} m ` +
      `(Soll ≤ ${settings.maxEarthwork} m) · ` +
      `95 % unter ${data.measured.earthwork95.toFixed(1)} m · ` +
      `tiefster Einschnitt ${data.measured.deepestCut} m bei km ` +
      `${(data.measured.worstAt / 1000).toFixed(2)} · ` +
      `Auftrag bis +${data.measured.highestFill} m`;
    console.log(
      (earthworkOk ? c.dim : c.red)(
        earthworkLine +
          (data.measured.neededLength > data.length
            ? c.yellow(
                `  ⚠ ${data.measured.climb} Höhenmeter brauchen bei ` +
                  `${(settings.maxGradient * 100).toFixed(0)} % mindestens ` +
                  `${data.measured.neededLength} m Strecke, vorhanden sind ` +
                  `${Math.round(data.length)} m`,
              )
            : ''),
      ),
    );
  }

  const file = {
    seed: meta.seed,
    sampleSpacing: SAMPLE_SPACING,
    roads,
    measured: {
      totalLength: Number(totalLength.toFixed(2)),
      count: roads.length,
    },
  };

  const outDir = join(ROOT, 'assets/generated/roads');
  await mkdir(outDir, { recursive: true });
  const text = `${JSON.stringify(file, null, 1)}\n`;
  await writeFile(join(outDir, 'roads.json'), text, 'utf8');

  console.log(
    c.dim(
      `\n  ${roads.length} Strecken · ${(totalLength / 1000).toFixed(2)} km gesamt · ` +
        `${(text.length / 1024).toFixed(0)} KB · sha256 ${sha256(text).slice(0, 12)}\n`,
    ),
  );

  if (overburden > 0) {
    console.warn(
      c.red(
        `  ${overburden} Strecke(n) liegen im Mittel weiter neben dem Gelände, ` +
          'als ihr Typ erlaubt.\n' +
          '  Radius und Steigung sagen darüber nichts: eine Trasse kann beide ' +
          'halten und trotzdem\n  als Graben durch den Hang laufen. Die Ursache ' +
          'liegt in der Trassierung, nicht\n  im Höhenprofil — siehe PLAN.md, ' +
          '„Warum der Bergpass keine Kehren hat".\n',
      ),
    );
  }

  if (violations > 0) {
    console.warn(
      c.yellow(
        `  ${violations} Strecke(n) verletzen ihre Grenzwerte. ` +
          'Wegpunkte oder Serpentinen-Parameter in tools/gen-roads.mjs anpassen.\n',
      ),
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
