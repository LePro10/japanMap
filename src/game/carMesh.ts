import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Matrix4,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { TOUGE, type VehicleSpec } from '@/config/vehicles.config';

/**
 * Die Fahrzeuge als prozedurale Geometrie — PLAN.md P14, erweitert in P18.
 *
 * **Warum kein Modell.** Es gibt keines: `assets/source/models` enthält vier
 * Poly-Haven-Assets (zwei Felsen, ein Kliff, eine Mole), und der Startdownload
 * liegt mit 51,95 MB schon weit über den 15 MB aus SPEC §4. Dieselbe Rechnung wie
 * bei den Landmarks in P5.2, mit demselben Ergebnis: gerechnete Geometrie kostet
 * null Bytes, und die Formensprache dieses Projekts ist ohnehin flächig
 * (`flatShading`, Farbe aus Vertexattributen, Look aus dem Licht).
 *
 * Vier Fahrzeuge kosten damit **null zusätzliche Bytes** und nur so viel
 * Speicher wie das eine, das gerade gebaut ist: `DriveSystem` legt beim Wechsel
 * die alte Geometrie weg und rechnet die neue. Ein Auto sind rund 1000 Dreiecke;
 * die Rechnung dauert unter einer Millisekunde.
 *
 * Zwei Meshes und damit **zwei Draw-Calls**: Karosserie und ein `InstancedMesh`
 * mit vier Rädern. Die Räder müssen getrennt sein, weil sie lenken und sich
 * drehen; sie zusammenzuführen hieße, die Geometrie je Frame neu zu schreiben.
 *
 * ## Der Maßstab ist verbindlich
 *
 * SPEC-Abnahme: „Tür ≈ 2 m, Torii ≈ 5 m". Ein Auto ist das Maß, an dem man alles
 * andere nachprüft — es passt in die 6,5 m Fahrbahn des Bergpasses zweimal
 * nebeneinander, und die Leitplanke (Band 0,50…0,85 m) liegt auf Türhöhe. Alle
 * vier Bauformen nehmen ihre Maße deshalb aus `VehicleSpec` und nicht aus einer
 * Zahl in dieser Datei.
 *
 * ## Die eine Falle, die hier schon einmal zugeschlagen hat
 *
 * **Das Blech muss schmaler sein als die Radaußenkante.** Die erste Fassung nahm
 * `CHASSIS.bodyWidth` (die Kollisionsbreite) auch für den Unterbau; das Rad stand
 * 3,5 cm *innerhalb* der Blechkante, und von hinten war das Auto ein Kasten ohne
 * Räder. Gemeldet hat das keine Zahl — Draw-Calls, Instanzzahl und Position
 * waren alle richtig. Gesehen hat es das erste Bild.
 *
 * Seitdem gibt es `BodySpec.hullWidth` neben `ChassisSpec.bodyWidth`, und
 * `assertWheelsVisible` unten prüft die Beziehung beim Bauen — für alle vier
 * Fahrzeuge, nicht nur für das, das gerade im Bild ist.
 *
 * ## Was fehlt
 *
 * **Scheinwerfer leuchten nicht.** Sie sind hell lackierte Flächen, kein
 * Eigenlicht. Emissiv wären sie ein zweites Material und damit ein dritter
 * Draw-Call plus ein Eintrag in der Bloom-Kette — und bei der Beleuchtung dieser
 * Karte (blaue Stunde, 2,23° Sonnenstand) wäre ein Lichtkegel auf der Fahrbahn
 * eine eigene Aufgabe mit eigener Messung, nicht ein Nebenbei. Das ist eine
 * Lücke und keine Entscheidung gegen Licht.
 */

/**
 * Farben, die **allen** Fahrzeugen gemeinsam sind.
 *
 * Lack, Verglasung, Felge und Anbauteile stehen je Fahrzeug in `BodySpec` — sie
 * sind das, woran man einen Wagen auf 200 m erkennt. Reifenschwarz und
 * Leuchtenfarben stehen hier: ein Reifen ist ein Reifen.
 *
 * **Nicht in `palette.mjs`**, und das ist Absicht: die Palette ist die
 * Materialliste der *Karte* (Fels, Putz, Reet, Zinnober) und wird auch von den
 * Werkzeugen unter `tools/` gelesen. Autolack gehört nicht in dieselbe Liste,
 * nur weil beides Farben sind.
 *
 * Die Umrechnung nach linear ist Pflicht und nicht Kosmetik: `setHex(value)`
 * ohne Angabe des Quellraums behandelt den Wert als bereits linear, und das Auto
 * stünde sichtbar heller in der Landschaft als jedes Prop daneben. Dieselbe Falle
 * steht in `landmarkMeshes.paint()` und in `roads.config.ts` beim Kiesbelag.
 */
const SHARED_COLORS = {
  tire: 0x191b1e,
  lamp: 0xe8e2cf,
  lampRear: 0x7a2320,
} as const;

const matrix = new Matrix4();
const color = new Color();

function paint(geometry: BufferGeometry, hex: number): BufferGeometry {
  color.setHex(hex, 'srgb');
  const count = geometry.getAttribute('position').count;
  const rgb = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    rgb[i * 3] = color.r;
    rgb[i * 3 + 1] = color.g;
    rgb[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(rgb, 3));
  return geometry;
}

/** Kasten in Lackfarbe, Mittelpunkt bei (x, y, z). y wird **vom Boden** gemessen. */
function part(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  hex: number,
): BufferGeometry {
  const geometry = paint(new BoxGeometry(w, h, d), hex);
  return geometry.applyMatrix4(matrix.makeTranslation(x, y, z));
}

/**
 * Ein Paar links und rechts — spart in jeder Bauform vier Zeilen und, wichtiger,
 * eine ganze Fehlerklasse: ein von Hand geschriebenes Paar mit verschiedenen
 * Maßen ist ein Auto, das im Bild schief steht und dessen Zahlen alle stimmen.
 */
function pair(
  out: BufferGeometry[],
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  hex: number,
): void {
  out.push(part(w, h, d, -x, y, z, hex), part(w, h, d, x, y, z, hex));
}

/**
 * Die Karosserie.
 *
 * Der Ursprung der zurückgegebenen Geometrie liegt im **Schwerpunkt** — also auf
 * `chassis.cgHeight` über der Radaufstandsfläche, nicht am Boden. Das Mesh kann
 * damit direkt `Vehicle.position` und `Vehicle.quaternion` übernehmen, ohne
 * Zwischenknoten und ohne dass jemand den Versatz an zwei Stellen führen muss.
 *
 * `+Z` ist vorn, `+X` rechts — dieselbe Konvention wie im Fahrmodell
 * (`forward = (sin yaw, 0, cos yaw)`), damit ein Vorzeichenfehler nicht erst als
 * rückwärts fahrendes Auto auffällt.
 */
export function createCarBody(spec: VehicleSpec = TOUGE): BufferGeometry {
  assertWheelsVisible(spec);
  const parts =
    spec.body.shape === 'supercar'
      ? supercarParts(spec)
      : spec.body.shape === 'suv'
        ? suvParts(spec)
        : spec.body.shape === 'truck'
          ? truckParts(spec)
          : coupeParts(spec);

  const merged = mergeGeometries(parts, false);
  for (const geometry of parts) geometry.dispose();
  if (!merged) {
    // `mergeGeometries` gibt bei nicht zusammenpassenden Attributen `null`
    // zurück. Das ist hier unmöglich (alle Teile sind gleich aufgebaute
    // BoxGeometry), aber ein stiller `null`-Durchlauf wäre ein unsichtbares Auto
    // — und dieses Projekt hat vier davon in P6 gesucht.
    throw new Error(`Fahrzeug-Karosserie (${spec.id}): mergeGeometries hat null geliefert.`);
  }
  merged.applyMatrix4(matrix.makeTranslation(0, -spec.chassis.cgHeight, 0));
  merged.computeBoundingSphere();
  merged.name = `Fahrzeug:${spec.id}`;
  return merged;
}

/**
 * **Das Coupé** — unverändert die Form aus P14.
 *
 * 4,20 m lang, 1,74 m über die Kotflügel, 1,48 m hoch über einem Radstand von
 * 2,40 m: die Maße eines japanischen Kompakt-Coupés der späten Achtziger
 * (Toyota AE86: 4,20 × 1,63 × 1,34).
 */
function coupeParts(spec: VehicleSpec): BufferGeometry[] {
  const { body, chassis } = spec;
  const c = body;
  const front = chassis.wheelbase * (1 - chassis.frontWeight);
  const rear = chassis.wheelbase * chassis.frontWeight;
  const out: BufferGeometry[] = [
    // Unterbau: von 0,34 bis 0,90 über Grund.
    part(c.hullWidth, 0.56, c.hullLength, 0, 0.62, 0, c.paint),
    // Kotflügel über den Rädern. Sie schließen die Lücke zwischen dem schmalen
    // Unterbau und der Radaußenkante — ohne sie steht das Rad an einer scharfen
    // Blechkante und sieht angeklebt aus.
    part(c.hullWidth + 0.3, 0.26, 1.05, 0, 0.77, front, c.paint),
    part(c.hullWidth + 0.3, 0.26, 1.05, 0, 0.77, -rear, c.paint),
    // Motorhaube, flach und dunkel — die zweite Lackfläche.
    part(1.58, 0.1, 1.5, 0, 0.91, 1.15, c.paintDark),
    // Kofferraumdeckel.
    part(1.58, 0.1, 0.95, 0, 0.91, -1.6, c.paint),
    // Fahrgastzelle, unterer Teil (Türbrüstung).
    part(1.52, 0.16, 2.0, 0, 0.98, -0.25, c.paint),
    // Verglasung als eigener Ring: schmaler als die Brüstung, damit eine Kante
    // stehen bleibt. Flach schattiert wird daraus eine Fensterlinie.
    part(1.44, 0.34, 1.94, 0, 1.23, -0.25, c.glass),
    // Dach.
    part(1.46, 0.08, 1.7, 0, c.roofHeight - 0.04, -0.35, c.paintDark),
    // Stoßfänger vorn und hinten, in Anbauteil-Grau.
    part(1.5, 0.24, 0.22, 0, 0.46, 2.06, c.trim),
    part(1.5, 0.24, 0.22, 0, 0.46, -2.06, c.trim),
  ];
  // Scheinwerfer und Rückleuchten. Sie leuchten nicht — siehe Kopf.
  pair(out, 0.36, 0.16, 0.08, 0.55, 0.82, 2.11, SHARED_COLORS.lamp);
  pair(out, 0.42, 0.14, 0.08, 0.5, 0.82, -2.11, SHARED_COLORS.lampRear);
  // Seitenspiegel — zwei Klötzchen, aber sie geben der Silhouette die Breite,
  // an der man das Auto in der Verfolgerkamera als Auto erkennt.
  pair(out, 0.16, 0.08, 0.1, 0.78, 1.06, 0.75, c.paintDark);
  return out;
}

/**
 * **Der Supersportler** — flach, breit, Keil, Heckflügel.
 *
 * Die Silhouette muss aus der Verfolgerkamera in einem Blick vom Coupé zu
 * unterscheiden sein, und zwar an drei Merkmalen: sie ist **flacher** (Dach bei
 * 1,17 m gegen 1,48 m), sie hat einen **Keil** statt einer waagerechten
 * Motorhaube, und sie trägt einen **Heckflügel**. Der Flügel ist zugleich das
 * einzige Bauteil dieser Datei, das eine Zahl aus der Physik bebildert:
 * `drivetrain.downforce` ist bei diesem Fahrzeug als einzigem von null
 * verschieden.
 */
function supercarParts(spec: VehicleSpec): BufferGeometry[] {
  const { body: c, chassis } = spec;
  const front = chassis.wheelbase * (1 - chassis.frontWeight);
  const rear = chassis.wheelbase * chassis.frontWeight;
  const half = c.hullLength / 2;
  const out: BufferGeometry[] = [
    // Flacher, breiter Unterbau. Er beginnt tief (Oberkante 0,62 m) — das ist
    // die halbe Silhouette.
    part(c.hullWidth, 0.42, c.hullLength, 0, 0.41, 0, c.paint),
    // Radhäuser.
    part(c.hullWidth + 0.16, 0.3, 1.15, 0, 0.62, front, c.paint),
    part(c.hullWidth + 0.2, 0.3, 1.25, 0, 0.62, -rear, c.paint),
    // Der Keil: drei flache Platten mit steigender Oberkante statt einer
    // waagerechten Haube. Flach schattiert liest sich das als Schräge.
    part(1.52, 0.09, 1.0, 0, 0.66, half - 0.55, c.paint),
    part(1.56, 0.09, 0.7, 0, 0.74, half - 1.3, c.paint),
    part(1.56, 0.09, 0.6, 0, 0.82, half - 1.85, c.paintDark),
    // Kabine: kurz und weit hinten — Mittelmotor.
    part(1.5, 0.2, 1.5, 0, 0.86, -0.15, c.paint),
    part(1.4, 0.28, 1.42, 0, 1.06, -0.1, c.glass),
    part(1.36, 0.06, 1.1, 0, c.roofHeight - 0.03, -0.25, c.paintDark),
    // Motorabdeckung hinter der Kabine, abfallend.
    part(1.56, 0.1, 1.0, 0, 0.9, -1.35, c.paintDark),
    // Schweller — sie ziehen die Silhouette in die Länge und nach unten.
    part(c.hullWidth + 0.14, 0.14, 2.2, 0, 0.24, -0.1, c.trim),
    // Frontsplitter und Diffusor.
    part(1.8, 0.07, 0.36, 0, 0.16, half - 0.02, c.trim),
    part(1.74, 0.16, 0.4, 0, 0.24, -half + 0.06, c.trim),
  ];
  // Heckflügel: zwei Stützen und ein Blatt.
  pair(out, 0.07, 0.3, 0.14, 0.62, 1.03, -half + 0.35, c.trim);
  out.push(part(1.66, 0.06, 0.36, 0, 1.2, -half + 0.35, c.paintDark));
  // Schmale, liegende Leuchten — bei einem Keil ist das die richtige Form.
  pair(out, 0.44, 0.09, 0.07, 0.52, 0.74, half - 0.05, SHARED_COLORS.lamp);
  pair(out, 0.5, 0.1, 0.07, 0.5, 0.82, -half + 0.02, SHARED_COLORS.lampRear);
  pair(out, 0.14, 0.07, 0.09, 0.9, 0.88, 0.55, c.paintDark);
  return out;
}

/**
 * **Der Geländewagen** — hoch, kantig, Leiterrahmen, Dachträger.
 *
 * Die Bodenfreiheit muss man **sehen**: der Unterbau beginnt erst bei 0,52 m
 * über Grund, und darunter steht nichts als Rad. Das ist die Zahl, die das
 * Fahrzeug erklärt (0,42 m Federweg, 0,78 m Schwerpunkt) — ein Geländewagen, der
 * so tief liegt wie das Coupé, ist eine Behauptung.
 */
function suvParts(spec: VehicleSpec): BufferGeometry[] {
  const { body: c, chassis } = spec;
  const front = chassis.wheelbase * (1 - chassis.frontWeight);
  const rear = chassis.wheelbase * chassis.frontWeight;
  const half = c.hullLength / 2;
  const roof = c.roofHeight;
  const out: BufferGeometry[] = [
    // Leiterrahmen — sichtbar zwischen Rad und Aufbau. Zwei Längsträger.
    pairInline(0.16, 0.14, c.hullLength - 0.5, 0.5, 0.46, 0, c.trim),
    // Aufbau, Unterkante 0,52 m.
    part(c.hullWidth, 0.62, c.hullLength - 0.35, 0, 0.83, -0.05, c.paint),
    // Radkästen, kantig und ausgestellt.
    part(c.hullWidth + 0.24, 0.34, 1.2, 0, 0.72, front, c.paintDark),
    part(c.hullWidth + 0.24, 0.34, 1.2, 0, 0.72, -rear, c.paintDark),
    // Motorhaube: waagerecht und hoch — das ist die Front eines Geländewagens.
    part(c.hullWidth - 0.06, 0.16, 1.4, 0, 1.22, half - 0.8, c.paint),
    // Kabine über die volle Höhe, senkrechte Scheiben.
    part(c.hullWidth - 0.08, 0.62, 2.5, 0, 1.5, -0.5, c.glass),
    part(c.hullWidth - 0.04, 0.1, 2.6, 0, roof - 0.05, -0.5, c.paint),
    // Dachträger — zwei Querstreben. Er kostet 24 Dreiecke und macht die
    // Silhouette auf 200 m eindeutig.
    part(c.hullWidth - 0.1, 0.07, 0.1, 0, roof + 0.06, 0.5, c.trim),
    part(c.hullWidth - 0.1, 0.07, 0.1, 0, roof + 0.06, -1.3, c.trim),
    // Rammschutz vorn und hinten, tief angesetzt.
    part(c.hullWidth + 0.16, 0.26, 0.24, 0, 0.62, half - 0.06, c.trim),
    part(c.hullWidth + 0.1, 0.24, 0.22, 0, 0.66, -half + 0.06, c.trim),
    // Reserverad am Heck — ein Zylinder wäre ein eigenes Bauteil; als flacher
    // Kasten in Reifenschwarz liest es sich in dieser Formensprache genauso.
    part(0.72, 0.72, 0.22, 0, 1.15, -half - 0.02, SHARED_COLORS.tire),
  ];
  // Kastenförmige Scheinwerfer, hoch angesetzt.
  pair(out, 0.3, 0.22, 0.08, 0.62, 1.16, half - 0.08, SHARED_COLORS.lamp);
  pair(out, 0.24, 0.34, 0.08, 0.72, 1.05, -half + 0.02, SHARED_COLORS.lampRear);
  pair(out, 0.18, 0.1, 0.12, 1.0, 1.42, 0.9, c.paintDark);
  return out;
}

/** Zwei Längsträger als **ein** Bauteil — spart einen Eintrag im Feld oben. */
function pairInline(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  hex: number,
): BufferGeometry {
  const left = part(w, h, d, -x, y, z, hex);
  const right = part(w, h, d, x, y, z, hex);
  const merged = mergeGeometries([left, right], false);
  left.dispose();
  right.dispose();
  if (!merged) throw new Error('Fahrzeug: Rahmenträger konnten nicht vereinigt werden.');
  return merged;
}

/**
 * **Der Lastwagen** — Fahrerhaus vorn, Pritsche hinten, 7,60 m lang.
 *
 * Die Zweiteilung ist das Merkmal: ein Fahrerhaus, das über der Vorderachse
 * sitzt, und eine flache Ladefläche mit Bordwänden dahinter. Zusammen mit
 * 3,10 m Höhe ist er auf jede Entfernung eindeutig — und er ist das Fahrzeug,
 * an dem man auf dieser Karte den Maßstab am besten abliest: er ist so hoch wie
 * ein Torii mittlerer Größe und passt gerade auf die 6,5 m Fahrbahn des
 * Bergpasses.
 */
function truckParts(spec: VehicleSpec): BufferGeometry[] {
  const { body: c, chassis } = spec;
  const front = chassis.wheelbase * (1 - chassis.frontWeight);
  const rear = chassis.wheelbase * chassis.frontWeight;
  const half = c.hullLength / 2;
  const frameY = 0.86;
  const cabZ = half - 1.15;
  const out: BufferGeometry[] = [
    // Rahmen über die ganze Länge — bei einem Lastwagen ist er sichtbar.
    pairInline(0.18, 0.24, c.hullLength - 0.4, 0.62, frameY, 0, c.trim),
    // Fahrerhaus: Unterbau, Verglasung, Dach.
    part(c.hullWidth, 0.72, 2.1, 0, frameY + 0.5, cabZ, c.paint),
    part(c.hullWidth - 0.06, 0.86, 1.95, 0, frameY + 1.31, cabZ, c.glass),
    part(c.hullWidth, 0.12, 2.15, 0, c.roofHeight - 0.06, cabZ, c.paint),
    // Sonnenblende über der Frontscheibe — das Kennzeichen eines Lastwagens.
    part(c.hullWidth, 0.1, 0.34, 0, c.roofHeight + 0.02, cabZ + 0.95, c.paintDark),
    // Ladefläche: Boden und drei Bordwände. Die vierte fehlt (Heckklappe offen),
    // sonst ist die Pritsche von hinten eine geschlossene Kiste.
    part(c.hullWidth + 0.1, 0.14, 4.3, 0, frameY + 0.21, -half + 2.25, c.paintDark),
    part(c.hullWidth + 0.1, 0.62, 0.12, 0, frameY + 0.59, cabZ - 1.12, c.paint),
    // Radkästen der Zwillingsbereifung — sie sind breiter als vorn.
    part(c.hullWidth + 0.2, 0.3, 1.3, 0, frameY + 0.06, -rear, c.paintDark),
    part(c.hullWidth - 0.1, 0.28, 1.2, 0, frameY + 0.04, front, c.paintDark),
    // Stoßfänger und Unterfahrschutz.
    part(c.hullWidth + 0.06, 0.3, 0.24, 0, 0.62, half - 0.08, c.trim),
    part(c.hullWidth, 0.22, 0.18, 0, 0.7, -half + 0.06, c.trim),
    // Tank seitlich unter der Pritsche.
    part(0.3, 0.42, 1.1, -c.hullWidth / 2 - 0.06, frameY - 0.08, -0.4, c.rim),
  ];
  // Bordwände links und rechts.
  pair(out, 0.1, 0.62, 4.3, c.hullWidth / 2 + 0.05, frameY + 0.59, -half + 2.25, c.paint);
  pair(out, 0.34, 0.26, 0.1, 0.72, frameY + 0.4, half - 0.12, SHARED_COLORS.lamp);
  pair(out, 0.22, 0.44, 0.1, 0.86, frameY + 0.35, -half + 0.02, SHARED_COLORS.lampRear);
  // Große Spiegel an Auslegern — bei einem Lastwagen stehen sie weit ab.
  pair(out, 0.12, 0.5, 0.14, c.hullWidth / 2 + 0.24, frameY + 1.5, cabZ + 0.8, c.paintDark);
  return out;
}

/**
 * Ein Rad. Achse längs **X**, Mittelpunkt im Ursprung.
 *
 * `CylinderGeometry` steht auf Y; die Drehung um Z legt sie auf die Achse, auf der
 * das Rad sich später um seine eigene Achse dreht. Wer das vergisst, bekommt ein
 * Rad, das wie ein Kreisel auf dem Asphalt steht — und das ist der einzige Fehler
 * hier, der im Bild sofort auffällt.
 *
 * Die Segmentzahl hängt am Halbmesser: das Rad des Lastwagens ist mit 0,52 m
 * zwei Drittel größer als das des Coupés und braucht deshalb mehr Kanten, damit
 * es aus der Verfolgerkamera nicht als Vieleck steht. 14 Segmente bei 0,31 m
 * sind 45 Segmente je Meter Halbmesser; die Formel hält das Verhältnis und
 * deckelt bei 20, weil vier Räder sonst mehr Dreiecke kosten als die ganze
 * Karosserie.
 */
export function createCarWheel(spec: VehicleSpec = TOUGE): BufferGeometry {
  const { wheelRadius, wheelWidth } = spec.chassis;
  const segments = Math.min(20, Math.max(12, Math.round(wheelRadius * 45)));
  const tire = paint(
    new CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, segments, 1),
    SHARED_COLORS.tire,
  );
  // Felge: etwas breiter als der Reifen, damit sie an beiden Seiten sichtbar
  // bleibt, und deutlich kleiner im Radius. Sie ist der Teil, an dem man die
  // Raddrehung überhaupt sieht — ein einfarbiger Zylinder dreht sich unsichtbar.
  const rim = paint(
    new CylinderGeometry(wheelRadius * 0.58, wheelRadius * 0.58, wheelWidth + 0.02, 6, 1),
    spec.body.rim,
  );

  const merged = mergeGeometries([tire, rim], false);
  tire.dispose();
  rim.dispose();
  if (!merged) throw new Error('Fahrzeug-Rad: mergeGeometries hat null geliefert.');
  merged.applyMatrix4(matrix.makeRotationZ(Math.PI / 2));
  merged.computeBoundingSphere();
  merged.name = 'Fahrzeugrad';
  return merged;
}

/**
 * Die Prüfung, die es P14 nicht gab — und die ein Auto ohne Räder gekostet hat.
 *
 * Sie läuft beim Bauen und wirft. Das ist Absicht: ein Fahrzeug mit versteckten
 * Rädern hat **richtige** Draw-Calls, eine richtige Instanzzahl und richtige
 * Matrizen. Es meldet sich nirgends, außer im Bild — und Bilder sieht sich
 * niemand für alle vier Fahrzeuge an, jedes Mal.
 *
 * 5 cm Mindestüberstand: weniger verschwindet hinter der Rundung des Kotflügels.
 */
function assertWheelsVisible(spec: VehicleSpec): void {
  const wheelOuter = (spec.chassis.track + spec.chassis.wheelWidth) / 2;
  const hullEdge = spec.body.hullWidth / 2;
  const stick = wheelOuter - hullEdge;
  if (stick < 0.05) {
    throw new Error(
      `Fahrzeug ${spec.id}: die Räder stehen nur ${(stick * 100).toFixed(1)} cm über die ` +
        `Blechkante hinaus (hullWidth ${spec.body.hullWidth} m, Spur ${spec.chassis.track} m, ` +
        `Radbreite ${spec.chassis.wheelWidth} m). Unter 5 cm ist das Auto von hinten ein ` +
        `Kasten ohne Räder — genau der Fehler aus P14.`,
    );
  }
}
