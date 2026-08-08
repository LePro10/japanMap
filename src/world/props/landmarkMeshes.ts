import {
  BufferGeometry,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Matrix4,
  SphereGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { paletteEntry } from '@/config/palette.mjs';

/**
 * Prozedurale Landmarks — PLAN.md P5 / 5.2.
 *
 * > **Warum prozedural und nicht aus der Pipeline aus 5.1.** Nicht aus
 * > Bequemlichkeit, sondern weil es die Modelle nicht gibt. Der Katalog von
 * > Poly Haven wurde vollständig durchsucht (400 Assets): **null Treffer** für
 * > Torii, Schrein, Tempel oder Steinlaterne. Die vier Laternen dort sind eine
 * > Sturmlaterne, eine Deckslaterne, ein Kronleuchter und eine indische Diya.
 * > Genau die fehlenden Stücke sind aber die, an denen die Abnahmezeile hängt:
 * > „Jede Zone ist im Vorbeifliegen ohne Karte identifizierbar."
 * >
 * > Die Pipeline aus 5.1 ist deshalb **nicht** überflüssig — sie verarbeitet
 * > die Felsen und den Steg, wo echte Geometrie tatsächlich besser ist als
 * > gerechnete. Ein Findling aus Boxen wäre kein Findling.
 *
 * **Ein Material für alle**: die Palettenfarbe steckt in den Vertexfarben, nicht
 * in getrennten Materialien. Ein Torii aus drei Materialien wären drei
 * `InstancedMesh` und damit drei Draw-Calls je Landmark-Art; über zehn Arten
 * summiert sich das auf mehr, als das Stadtbudget aus P6 später übrig lässt.
 * Der Preis ist, dass Rauheit und Metallizität für alle Props gleich sind —
 * siehe `PropMaterial`.
 *
 * Maßstab ist verbindlich (SPEC/PLAN-Abnahme: „Tür ≈ 2 m, Torii ≈ 5 m"). Die
 * Zahlen unten sind deshalb keine Geschmacksfrage; wo eine ungewöhnlich wirkt,
 * steht der Grund daneben.
 */

export type LandmarkId =
  | 'torii'
  | 'stoneLantern'
  | 'hokora'
  | 'templeHall'
  | 'templeStairs'
  | 'farmhouse'
  | 'shed'
  | 'powerPole'
  | 'tetrapod'
  | 'lighthouse'
  | 'boat'
  | 'delineator'
  // ── P8.9 ──────────────────────────────────────────────────────────────────
  | 'chozuya'
  | 'bellTower'
  | 'fishHut'
  | 'netRack'
  | 'boatRamp'
  | 'crateStack'
  | 'jetty'
  | 'concreteWall'
  | 'greenhouse'
  | 'warehouse';

const matrix = new Matrix4();
const color = new Color();
const axis = new Vector3();

/** Verschieben. Verändert die Geometrie, statt eine Kopie anzulegen. */
function at(geometry: BufferGeometry, x: number, y: number, z: number): BufferGeometry {
  return geometry.applyMatrix4(matrix.makeTranslation(x, y, z));
}

function rotY(geometry: BufferGeometry, radians: number): BufferGeometry {
  return geometry.applyMatrix4(matrix.makeRotationY(radians));
}

function rotZ(geometry: BufferGeometry, radians: number): BufferGeometry {
  return geometry.applyMatrix4(matrix.makeRotationZ(radians));
}

function rotX(geometry: BufferGeometry, radians: number): BufferGeometry {
  return geometry.applyMatrix4(matrix.makeRotationX(radians));
}

/**
 * Palettenfarbe als Vertexfarbe eintragen.
 *
 * `setHex(value, 'srgb')` und nicht `setHex(value)`: die Palette nennt Farben
 * so, wie man sie im Farbwähler wählt. three rechnet intern linear, und ohne
 * die Angabe des Quellraums läge jedes Prop sichtbar heller als die
 * Fremdmodelle, deren `baseColorFactor` die Pipeline korrekt umrechnet.
 */
function paint(geometry: BufferGeometry, name: string): BufferGeometry {
  color.setHex(paletteEntry(name).color, 'srgb');
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

/** Kasten in Palettenfarbe, mit Mittelpunkt im Ursprung. */
function box(w: number, h: number, d: number, material: string): BufferGeometry {
  return paint(new BoxGeometry(w, h, d), material);
}

/**
 * Sockel unter einem Gebäude — ein Kasten von `−depth` bis `0`.
 *
 * ## Wogegen
 *
 * **Gebäude schwebten am Hang.** Ein Prop bekommt genau *eine* Höhe aus dem
 * `TerrainSampler`, und die wird an seinem **Mittelpunkt** abgetastet. Steht es
 * auf einer Neigung, liegt die Talseite tiefer als dieser eine Wert, und dort
 * klafft die Differenz als Lücke unter der Wand. Im Bild der Tempelhalle
 * (2026-08-08) war sie unter der linken Vorderkante deutlich zu sehen, die
 * Steintreppe davor hing frei in der Luft.
 *
 * Gemessen über alle Platzierungen, jeweils der größte Fall je Bauart —
 * Mittelpunkthöhe minus niedrigster Geländehöhe unter der Grundfläche:
 *
 * | Bauart | Stück | größte Lücke |
 * |---|---|---|
 * | `farmhouse` | 7 | **2,57 m** |
 * | `templeHall` | 1 | 1,34 m |
 * | `templeStairs` | 1 | 1,31 m |
 * | `bellTower` | 1 | 0,73 m |
 * | `warehouse` | 11 | 0,68 m |
 * | `chozuya` | 1 | 0,48 m |
 * | `shed` | 41 | 0,40 m |
 *
 * ## Warum ein Sockel und nicht die anderen zwei Wege
 *
 * - **Auf das Minimum der Grundfläche setzen** hätte nirgends eine Lücke, aber
 *   das Bauernhaus gräbt sich dann bergseitig bis zu 3,64 m ein. Das ist kein
 *   Tausch, sondern ein anderer Fehler.
 * - **Im Baker einebnen**, wie es für Reisfelder (5c) und Distrikt (5d) längst
 *   geschieht, wäre der sauberste Weg — er greift aber in die Bake-Kette, und
 *   die koppelt über die Erosion auf die **ganze Karte** (P8.5: ein Eingriff
 *   allein in der Stadtzone verändert danach 66,82 % der Texel). Das kann die
 *   Kehrenzahl am Bergpass mitnehmen und ist keine Nebenbei-Änderung.
 *
 * Der Sockel dagegen steckt in der Modellgeometrie, kostet **12 Dreiecke** je
 * Bauart statt je Instanz, braucht keinen neuen Bake und ist obendrein
 * architektonisch richtig: ein Bau am Hang steht auf einem Fundament.
 *
 * Auf ebenem Grund ist er vollständig vergraben und damit unsichtbar — er
 * zeigt sich genau dort, wo sonst die Lücke wäre.
 */
function plinth(w: number, d: number, depth: number, material: string): BufferGeometry {
  return at(box(w, depth, d, material), 0, -depth / 2, 0);
}

/** Zylinder, Fuß auf y = 0. */
function pillar(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments: number,
  material: string,
): BufferGeometry {
  const geometry = new CylinderGeometry(radiusTop, radiusBottom, height, segments);
  return at(paint(geometry, material), 0, height / 2, 0);
}

/** Kegel, Fuß auf y = 0. */
function cone(
  radius: number,
  height: number,
  segments: number,
  material: string,
): BufferGeometry {
  const geometry = new ConeGeometry(radius, height, segments);
  return at(paint(geometry, material), 0, height / 2, 0);
}

/**
 * Teile zusammenführen — dieselbe Falle wie bei der Vegetation.
 *
 * `mergeGeometries` verlangt, dass entweder alle Teile einen Index haben oder
 * keines, und three ist darin nicht einheitlich. Beim Fehlschlag liefert die
 * Funktion `null` statt zu werfen: die Anwendung bliebe wortlos in der
 * Initialisierung stehen. Deshalb erst alles auf „nicht indiziert", dann
 * zusammenführen, dann laut werden.
 */
function finish(parts: BufferGeometry[], name: string): BufferGeometry {
  const flat = parts.map((part) => {
    const converted = part.index ? part.toNonIndexed() : part;
    if (converted !== part) part.dispose();
    return converted;
  });
  const merged = mergeGeometries(flat, false);
  if (!merged) throw new Error(`Landmark „${name}" ließ sich nicht zusammenführen.`);
  for (const part of flat) part.dispose();
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  merged.name = name;
  return merged;
}

// ── Wald / Tempel ────────────────────────────────────────────────────────────

/**
 * Torii im Myōjin-Stil — das eine Bauteil, an dem die Zone erkennbar ist.
 *
 * Die Merkmale, ohne die es kein Torii ist und mit denen es aus 200 m eines
 * ist: zwei **nach innen geneigte** Säulen, ein zweiter Riegel (`nuki`), der
 * seitlich übersteht, und ein oberer Balken (`kasagi`), dessen Enden nach oben
 * auslaufen. Die Neigung beträgt echte 1,5° — sichtbar ist davon fast nichts,
 * aber ein exakt senkrechtes Torii sieht aus wie ein Türrahmen.
 *
 * Gemessen 6,92 × 5,19 × 0,88 m — die Abnahme nennt „Torii ≈ 5 m".
 */
function torii(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const halfSpan = 2.05;
  const height = 4.6;
  const lean = (1.5 * Math.PI) / 180;

  for (const side of [-1, 1]) {
    parts.push(at(pillar(0.24, 0.29, height, 8, 'vermilion'), side * halfSpan, 0, 0));
    // Fundamentstein. Ohne ihn steht die Säule auf dem Boden auf, und jede
    // Unebenheit des Geländes schneidet sie an.
    parts.push(at(pillar(0.4, 0.44, 0.28, 8, 'stone'), side * halfSpan, 0, 0));
    // Neigung wird nachträglich aufgeprägt: die beiden Säulen kippen zueinander.
    const last = parts[parts.length - 2]!;
    at(rotZ(at(last, -side * halfSpan, 0, 0), side * lean), side * halfSpan, 0, 0);
  }

  // Nuki — der untere Riegel, steht beidseitig über.
  parts.push(at(box(halfSpan * 2 + 0.9, 0.3, 0.34, 'vermilion'), 0, height - 0.85, 0));
  // Gakuzuka — der kurze Pfosten zwischen den Riegeln, in der Mitte.
  parts.push(at(box(0.26, 0.72, 0.24, 'vermilion'), 0, height - 0.34, 0));

  // Kasagi und Shimaki: der Deckbalken aus drei Stücken, die äußeren leicht
  // angehoben. Eine echte Kurve wäre eine Extrusion entlang eines Splines und
  // damit ein Vielfaches der Dreiecke für eine Silhouette, die man ab 30 m
  // ohnehin gerade sieht.
  const capY = height + 0.24;
  parts.push(at(box(halfSpan * 2 + 0.6, 0.26, 0.46, 'vermilion'), 0, capY, 0));
  parts.push(at(box(halfSpan * 2 + 0.2, 0.2, 0.4, 'vermilion'), 0, capY + 0.24, 0));
  for (const side of [-1, 1]) {
    const wing = box(1.1, 0.24, 0.44, 'vermilion');
    parts.push(at(rotZ(wing, side * 0.16), side * (halfSpan + 0.85), capY + 0.12, 0));
  }
  return finish(parts, 'torii');
}

/**
 * Steinlaterne im Kasuga-Stil, gemessen 2,24 m.
 *
 * Sechseckig, weil sie es ist — und weil ein Sechseck bei diesem Durchmesser
 * aus jeder Entfernung, aus der man sie sieht, von einem Kreis nicht zu
 * unterscheiden ist und ein Drittel der Dreiecke eines Achtecks kostet.
 */
function stoneLantern(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  let y = 0;
  const stack = (geometry: BufferGeometry, height: number): void => {
    parts.push(at(geometry, 0, y, 0));
    y += height;
  };
  stack(pillar(0.3, 0.38, 0.22, 6, 'stone'), 0.22); // Kiso — Sockel
  stack(pillar(0.11, 0.13, 0.92, 6, 'stone'), 0.92); // Sao — Schaft
  stack(pillar(0.3, 0.2, 0.16, 6, 'stone'), 0.16); // Chudai — Mittelplatte
  stack(pillar(0.28, 0.3, 0.42, 6, 'stone'), 0.42); // Hibukuro — Feuerkorb
  stack(pillar(0.5, 0.34, 0.1, 6, 'stone'), 0.1); // Kasa — Dachansatz
  stack(cone(0.52, 0.28, 6, 'stone'), 0.28); // Dach
  stack(pillar(0.05, 0.09, 0.14, 6, 'stone'), 0.14); // Hoju — Knauf
  return finish(parts, 'stoneLantern');
}

/**
 * Hokora — der kleine Bergschrein am Pass, gemessen 1,4 m hoch.
 *
 * Der billigste Landmark im Satz und einer der wirksamsten: ein Stück
 * bearbeiteter Stein an einer Stelle, an der sonst nur Fels ist, sagt sofort,
 * dass hier jemand vorbeikommt.
 */
function hokora(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  parts.push(at(box(1.1, 0.26, 0.9, 'stone'), 0, 0.13, 0));
  parts.push(at(box(0.86, 0.2, 0.7, 'stone'), 0, 0.36, 0));
  parts.push(at(box(0.62, 0.62, 0.5, 'stone'), 0, 0.77, 0));
  // Türnische, ein paar Zentimeter tief in die Vorderseite gesetzt.
  parts.push(at(box(0.3, 0.4, 0.06, 'vermilion'), 0, 0.74, 0.24));
  // Giebeldach aus zwei geneigten Platten.
  for (const side of [-1, 1]) {
    const slab = box(0.78, 0.1, 0.62, 'roofTile');
    parts.push(at(rotX(slab, side * 0.55), 0, 1.22, side * 0.16));
  }
  parts.push(at(box(0.8, 0.09, 0.12, 'roofTile'), 0, 1.32, 0));
  return finish(parts, 'hokora');
}

/**
 * Tempelhalle, gemessen 14,0 × 7,7 × 11,0 m.
 *
 * Was eine japanische Halle ausmacht und hier drinsteckt: ein **Steinpodest**,
 * eine Reihe freistehender Säulen davor und ein Dach mit **weitem Überstand**
 * — der Dachrand steht 1,4 m über die Säulen hinaus. Genau dieser Überstand
 * erzeugt den tiefen Schattenstreifen, an dem der Bau auch aus der Ferne als
 * Tempel und nicht als Scheune gelesen wird.
 */
function templeHall(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  // Sockel gegen die Hanglücke — Messung und Begründung bei `plinth()`.
  parts.push(plinth(13.2, 10.6, 2.0, 'stone'));
  const platformY = 0.9;
  parts.push(at(box(13.2, platformY, 10.6, 'stone'), 0, platformY / 2, 0));
  parts.push(at(box(10.4, 3.4, 7.6, 'plaster'), 0, platformY + 1.7, 0));

  // Freistehende Säulen entlang der Vorderseite und der Flanken.
  for (const x of [-5.2, -2.6, 0, 2.6, 5.2]) {
    parts.push(at(pillar(0.24, 0.28, 3.4, 8, 'vermilion'), x, platformY, 4.4));
    parts.push(at(pillar(0.24, 0.28, 3.4, 8, 'vermilion'), x, platformY, -4.4));
  }
  for (const z of [-2.2, 2.2]) {
    parts.push(at(pillar(0.24, 0.28, 3.4, 8, 'vermilion'), -5.8, platformY, z));
    parts.push(at(pillar(0.24, 0.28, 3.4, 8, 'vermilion'), 5.8, platformY, z));
  }

  // Traufbalken, auf dem das Dach sitzt.
  const eaveY = platformY + 3.4;
  parts.push(at(box(13.6, 0.34, 11.0, 'wood'), 0, eaveY + 0.17, 0));

  // Walmdach als vierseitiger Kegel — 4 Segmente, um 45° gedreht, damit die
  // Grate über die Ecken laufen. Der Kegel ist rund, das Dach soll es nicht
  // sein; die Skalierung in Z macht daraus die rechteckige Grundfläche.
  // **Erst drehen, dann stauchen.** Umgekehrt dreht sich die Stauchung mit und
  // das Dach bleibt quadratisch — gemessen 14,00 × 14,00 m über einem Bau von
  // 13,2 × 10,6 m. Ein japanisches Walmdach ist rechteckig; der First braucht
  // eine Richtung.
  const roof = rotY(cone(9.9, 3.1, 4, 'roofTile'), Math.PI / 4);
  roof.applyMatrix4(matrix.makeScale(1, 1, 0.78));
  parts.push(at(roof, 0, eaveY + 0.34, 0));
  // Firstbalken. Ohne ihn läuft das Dach in einer Spitze zusammen, und das tut
  // ein japanisches Walmdach nie.
  parts.push(at(box(4.4, 0.5, 0.7, 'roofTile'), 0, eaveY + 3.1, 0));
  return finish(parts, 'templeHall');
}

/**
 * Treppenaufgang, 12 Stufen, gemessen 4,3 × 2,5 × 3,8 m.
 *
 * Steigung 18 cm, Auftritt 30 cm — steiler als eine europäische Treppe und
 * damit ein eigenes Erkennungsmerkmal. Die Stufen sind volle Quader bis zum
 * Boden, nicht Platten: von der Seite sieht man sonst durch die Treppe hindurch.
 */
function templeStairs(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  parts.push(plinth(3.6, 4.2, 1.8, 'stone'));
  const steps = 12;
  const rise = 0.18;
  const tread = 0.3;
  const width = 3.6;
  for (let i = 0; i < steps; i++) {
    const height = rise * (i + 1);
    parts.push(at(box(width, height, tread, 'stone'), 0, height / 2, -i * tread));
  }
  // Seitliche Wangen, leicht überstehend.
  for (const side of [-1, 1]) {
    const cheek = box(0.34, 0.34, steps * tread + 0.4, 'stone');
    const slope = Math.atan2(steps * rise, steps * tread);
    parts.push(
      at(rotX(cheek, slope), side * (width / 2 + 0.17), (steps * rise) / 2 + 0.2, -(steps * tread) / 2),
    );
  }
  return finish(parts, 'templeStairs');
}

// ── Reisfelder ───────────────────────────────────────────────────────────────

/**
 * Bauernhaus im Minka-Stil, gemessen 11,9 × 7,5 × 9,8 m.
 *
 * Das Dach ist **mehr als die Hälfte der Bauhöhe** — das ist kein Versehen,
 * sondern das Merkmal: ein Reetdach mit 45° Neigung über einem niedrigen
 * Erdgeschoss. Wände heller Putz, Rahmenhölzer dunkel; die Tür misst 2 m,
 * damit der Maßstab an einem bekannten Maß prüfbar bleibt.
 */
function farmhouse(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  // Der größte gemessene Fall der ganzen Karte: 2,57 m Lücke. Siehe `plinth()`.
  parts.push(plinth(11, 8, 3.2, 'stone'));
  const wallH = 2.9;
  parts.push(at(box(11, wallH, 8, 'plaster'), 0, wallH / 2, 0));
  // Rahmenhölzer: Schwelle, Rähm und vier Pfosten.
  parts.push(at(box(11.2, 0.24, 8.2, 'wood'), 0, 0.12, 0));
  parts.push(at(box(11.2, 0.26, 8.2, 'wood'), 0, wallH - 0.13, 0));
  for (const x of [-5.3, -1.8, 1.8, 5.3]) {
    for (const z of [-3.9, 3.9]) parts.push(at(box(0.22, wallH, 0.22, 'wood'), x, wallH / 2, z));
  }
  // Tür, 2,0 m — das Prüfmaß aus der Abnahme.
  parts.push(at(box(1.1, 2.0, 0.1, 'wood'), -1.2, 1.0, 4.02));

  // Reetdach: zwei geneigte Platten plus Giebeldreiecke. Der Überstand von
  // 0,8 m je Seite gehört zum Bild — ein bündiges Dach sieht aus wie ein
  // Container mit Deckel.
  const roofH = 4.2;
  const slope = Math.atan2(roofH, 5.5);
  const slabLength = Math.hypot(roofH, 5.5) + 0.8;
  for (const side of [-1, 1]) {
    const slab = box(slabLength, 0.42, 9.6, 'thatch');
    // **Das Vorzeichen ist die Firstrichtung.** Hier stand `side * slope`, und
    // damit hob `rotZ` das **äußere** Ende jeder Platte an: das Dach war eine
    // nach oben offene Rinne, der Firstbalken stak mitten hindurch. So stand es
    // seit P5 in der Karte.
    //
    // Aufgefallen ist es erst am 2026-08-08 aus Augenhöhe. Die P5-Abnahme hat
    // die Reisfelder aus **120 m Höhe** fotografiert, und dort ist ein
    // Bauernhausdach ein paar Pixel groß — dieselbe Lehre wie bei den
    // Blickpunkten für die Vegetation: aus der Luft ist das meiste nicht
    // prüfbar, und sieben Häuser tragen den Fehler mit.
    parts.push(at(rotZ(slab, -side * slope), side * 2.75, wallH + roofH / 2, 0));
  }
  for (const z of [-4.5, 4.5]) {
    const gable = box(0.5, roofH * 0.72, 0.4, 'thatch');
    parts.push(at(gable, 0, wallH + roofH * 0.36, z));
  }
  parts.push(at(box(1.0, 0.5, 9.8, 'thatch'), 0, wallH + roofH - 0.1, 0));
  return finish(parts, 'farmhouse');
}

/** Geräteschuppen, gemessen 4,6 × 2,9 × 3,6 m — das Beiwerk, das einen Hof ausmacht. */
function shed(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  parts.push(plinth(4, 3, 0.9, 'stone'));
  parts.push(at(box(4, 2.3, 3, 'wood'), 0, 1.15, 0));
  parts.push(at(box(1.4, 1.9, 0.08, 'plaster'), 0.6, 0.95, 1.52));
  // Pultdach, zur Rückseite geneigt.
  const roof = box(4.6, 0.16, 3.6, 'roofTile');
  parts.push(at(rotX(roof, 0.16), 0, 2.5, 0));
  return finish(parts, 'shed');
}

/**
 * Strommast, gemessen 9,00 m.
 *
 * Betonmast mit zwei Auslegern und sechs Isolatoren. Über den Reisfeldern
 * stehen sie in Reihen und sind aus der Luft der stärkste Hinweis darauf, dass
 * die Fläche bewirtschaftet ist — deshalb steht er im Satz, obwohl er das
 * unauffälligste Stück darin ist.
 */
function powerPole(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  parts.push(pillar(0.14, 0.24, 9, 8, 'concrete'));
  for (const y of [7.5, 8.3]) {
    parts.push(at(box(2.6, 0.12, 0.12, 'steel'), 0, y, 0));
    for (const x of [-1.15, 0, 1.15]) {
      parts.push(at(pillar(0.07, 0.09, 0.22, 6, 'stone'), x, y + 0.06, 0));
    }
  }
  return finish(parts, 'powerPole');
}

// ── Küste ────────────────────────────────────────────────────────────────────

/**
 * Wellenbrecher-Tetrapode, gemessen 2,0 × 1,7 × 2,2 m.
 *
 * Vier Kegelstümpfe aus einem gemeinsamen Kern, in die Ecken eines Tetraeders.
 * Zu Hunderten an japanischen Küsten aufgeschüttet, und in dieser Karte das
 * Stück, das die Küste unverwechselbar macht.
 *
 * Die Achsen sind die vier Tetraederrichtungen; der Kern liegt so hoch, dass
 * das Ergebnis auf drei Beinen steht und das vierte nach oben zeigt.
 */
function tetrapod(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const armLength = 1.15;
  const axes: readonly [number, number, number][] = [
    [0, 1, 0],
    [0.9428, -0.3333, 0],
    [-0.4714, -0.3333, 0.8165],
    [-0.4714, -0.3333, -0.8165],
  ];
  parts.push(paint(new SphereGeometry(0.42, 8, 6), 'concrete'));
  for (const [ax, ay, az] of axes) {
    const arm = paint(new CylinderGeometry(0.17, 0.36, armLength, 6), 'concrete');
    // Der Zylinder steht in +Y; ihn auf die Achse zu drehen ist eine Drehung um
    // die Achse senkrecht zu beiden, um den Winkel dazwischen.
    const angle = Math.acos(Math.max(-1, Math.min(1, ay)));
    const nx = -az;
    const nz = ax;
    const norm = Math.hypot(nx, nz);
    if (norm > 1e-6) {
      arm.applyMatrix4(matrix.makeRotationAxis(axis.set(nx / norm, 0, nz / norm), angle));
    }
    parts.push(at(arm, (ax * armLength) / 2, (ay * armLength) / 2, (az * armLength) / 2));
  }
  // Der tiefste Punkt liegt bei −(1/3 · armLength + Radius); alles anheben,
  // damit der Pivot wie überall auf der Bodenmitte sitzt.
  const merged = finish(parts, 'tetrapod');
  merged.computeBoundingBox();
  return at(merged, 0, -(merged.boundingBox?.min.y ?? 0), 0);
}

/** Leuchtturm, gemessen 13,56 m. Der Fixpunkt der Küstenzone. */
function lighthouse(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  let y = 0;
  parts.push(at(pillar(2.0, 2.3, 1.1, 12, 'concrete'), 0, y, 0));
  y += 1.1;
  parts.push(at(pillar(1.05, 1.75, 9.0, 12, 'plaster'), 0, y, 0));
  y += 9.0;
  // Galerie: der auskragende Umgang. Er ist der Grund, warum ein Leuchtturm
  // auch als Silhouette einer ist und nicht ein Schornstein.
  parts.push(at(pillar(1.55, 1.55, 0.16, 12, 'steel'), 0, y, 0));
  parts.push(at(pillar(1.5, 1.5, 0.5, 12, 'steel'), 0, y + 0.16, 0));
  y += 0.66;
  parts.push(at(pillar(1.0, 1.0, 1.7, 12, 'steel'), 0, y, 0));
  y += 1.7;
  parts.push(at(cone(1.25, 1.1, 12, 'roofTile'), 0, y, 0));
  return finish(parts, 'lighthouse');
}

/**
 * Fischerboot, gemessen 5,6 m lang.
 *
 * Der Rumpf ist ein sechseckiger Zylinder quer gelegt und in der Länge
 * gestreckt — aus dem Wasser ragt ohnehin nur die obere Hälfte, und die
 * Facetten lesen sich als Klinkerbeplankung.
 */
function boat(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const hull = paint(new CylinderGeometry(0.9, 0.55, 5.6, 6, 1), 'wood');
  rotX(hull, Math.PI / 2);
  parts.push(at(hull, 0, 0.55, 0));
  parts.push(at(box(2.0, 0.12, 5.2, 'wood'), 0, 1.0, 0));
  parts.push(at(box(1.4, 1.0, 1.6, 'plaster'), 0, 1.5, -1.2));
  parts.push(at(box(1.5, 0.1, 1.7, 'roofTile'), 0, 2.02, -1.2));
  parts.push(at(pillar(0.05, 0.06, 1.6, 5, 'wood'), 0, 1.0, 1.9));
  return finish(parts, 'boat');
}

// ── Berg / Tōge ──────────────────────────────────────────────────────────────

/**
 * Streckenmarkierung am Bergpass, gemessen 1,00 m.
 *
 * Ein Pfosten mit reflektierendem Kopf, wie er an japanischen Bergstraßen
 * alle paar Meter steht. Einzeln bedeutungslos, in der Reihe entlang einer
 * Serpentine ist es das Stück, das die Kurve lesbar macht.
 */
function delineator(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  parts.push(pillar(0.05, 0.06, 1.0, 5, 'plaster'));
  parts.push(at(box(0.12, 0.14, 0.05, 'vermilion'), 0, 0.86, 0.04));
  return finish(parts, 'delineator');
}

// ── Sandō — P8.9 ─────────────────────────────────────────────────────────────
//
// Vier Torii und zwölf Laternen ergeben keinen Tempelaufgang. Was fehlt, sind
// die beiden Bauten, ohne die kein Schrein auskommt: das Wasserbecken, an dem
// man sich vor dem Betreten die Hände wäscht, und der Glockenturm. Beide sind
// klein, beide sind unverwechselbar, und beide kosten zusammen weniger
// Dreiecke als die Tempelhalle allein.

/**
 * Chōzuya — das überdachte Wasserbecken am Aufgang, gemessen 3,25 × 2,90 × 3,25 m.
 *
 * Vier Pfosten, ein Walmdach, darunter ein steinernes Becken mit Schöpfkellen.
 * Das Merkmal ist das **Verhältnis**: ein sehr kleiner Grundriss unter einem
 * verhältnismäßig großen Dach. Ein Pavillon mit bündigem Dach liest sich als
 * Bushaltestelle.
 */
function chozuya(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  parts.push(plinth(2.6, 2.6, 1.0, 'stone'));
  const postH = 2.05;
  for (const x of [-1.1, 1.1]) {
    for (const z of [-1.1, 1.1]) {
      parts.push(at(pillar(0.11, 0.13, postH, 6, 'wood'), x, 0, z));
      // Fundamentstein wie beim Torii: sonst schneidet jede Bodenwelle den Pfosten an.
      parts.push(at(pillar(0.2, 0.24, 0.16, 6, 'stone'), x, 0, z));
    }
  }
  // Querriegel oben, auf denen das Dach sitzt.
  for (const z of [-1.1, 1.1]) parts.push(at(box(2.6, 0.16, 0.14, 'wood'), 0, postH - 0.08, z));

  // Das Becken: ein flacher Steintrog, randvoll. Kein Wasser-Mesh — bei 1,4 m
  // Kantenlänge wäre eine eigene Wasserfläche ein Draw-Call für sechs Pixel.
  // Die Palettenfarbe `steel` liest sich bei 2,2° Sonnenstand als Spiegelung.
  parts.push(at(box(1.5, 0.52, 1.0, 'stone'), 0, 0.26, 0));
  parts.push(at(box(1.26, 0.06, 0.78, 'steel'), 0, 0.53, 0));
  // Schöpfkellen liegen quer über dem Rand.
  for (const x of [-0.4, 0.15]) parts.push(at(box(0.5, 0.05, 0.07, 'wood'), x, 0.57, -0.4));

  // Walmdach, 1,6 m über die Pfosten hinaus — derselbe Griff wie bei der Halle.
  const roof = rotY(cone(2.3, 0.85, 4, 'roofTile'), Math.PI / 4);
  parts.push(at(roof, 0, postH, 0));
  return finish(parts, 'chozuya');
}

/**
 * Shōrō — der Glockenturm, gemessen 3,54 × 4,23 × 3,54 m.
 *
 * Die vier Pfosten stehen **nach außen geneigt** (4°), und das ist nicht
 * Zierde: ein Glockenturm trägt eine Tonne Bronze auf halber Höhe, und die
 * Spreizung ist das, was ihn von einem Gartenpavillon unterscheidet. Bei einem
 * senkrechten Turm sieht die Silhouette aus wie ein Vogelhaus auf Stelzen.
 */
function bellTower(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  parts.push(plinth(3.2, 3.2, 1.2, 'stone'));
  const postH = 3.1;
  const spread = (4 * Math.PI) / 180;
  const foot = 1.35;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = pillar(0.15, 0.19, postH, 6, 'wood');
      // Neigung um beide waagerechten Achsen: der Fuß steht weiter außen als
      // der Kopf. rotZ kippt in X, rotX kippt in Z — die Reihenfolge ist bei
      // 4° ohne messbaren Unterschied.
      rotZ(post, -sx * spread);
      rotX(post, sz * spread);
      parts.push(at(post, sx * foot, 0, sz * foot));
      parts.push(at(pillar(0.28, 0.32, 0.2, 6, 'stone'), sx * (foot + 0.05), 0, sz * (foot + 0.05)));
    }
  }
  // Rähm, auf dem das Dach ruht, und der Querbalken, an dem die Glocke hängt.
  for (const z of [-1.2, 1.2]) parts.push(at(box(2.8, 0.2, 0.18, 'wood'), 0, postH - 0.1, z));
  parts.push(at(box(0.2, 0.22, 2.6, 'wood'), 0, postH - 0.1, 0));

  // Bonshō: eine japanische Tempelglocke ist ein fast zylindrischer Topf mit
  // gewölbtem Scheitel, keine europäische Kelchglocke. Deshalb Zylinder plus
  // Kugelkalotte statt eines Kegelstumpfs.
  parts.push(at(pillar(0.52, 0.56, 1.25, 10, 'steel'), 0, postH - 1.95, 0));
  parts.push(at(paint(new SphereGeometry(0.52, 10, 5), 'steel'), 0, postH - 0.7, 0));
  parts.push(at(pillar(0.09, 0.09, 0.28, 6, 'steel'), 0, postH - 0.34, 0));
  // Shumoku — der waagerecht aufgehängte Rammbalken. Das Stück, an dem man die
  // Glocke als japanische erkennt.
  parts.push(at(rotZ(pillar(0.09, 0.11, 1.5, 6, 'wood'), Math.PI / 2), 1.5, postH - 1.35, 0));

  const roof = rotY(cone(2.5, 1.0, 4, 'roofTile'), Math.PI / 4);
  parts.push(at(roof, 0, postH, 0));
  parts.push(at(box(1.0, 0.22, 0.3, 'roofTile'), 0, postH + 1.0, 0));
  return finish(parts, 'bellTower');
}

// ── Fischerdorf — P8.9 ───────────────────────────────────────────────────────
//
// Der Befund aus PLAN 8.9: es gibt Leuchtturm, Steg, vier Boote und 372
// Tetrapoden — „die Zutaten eines Hafens ohne den Hafen". Was einen Hafen
// ausmacht, ist nicht ein weiteres großes Bauwerk, sondern **Kleinkram in
// Gebrauch**: Gestelle, Kisten, eine Rampe. Deshalb sind vier der fünf Stücke
// hier unter 30 Dreiecken.

/**
 * Fischerhütte, gemessen 6,20 × 3,77 × 4,92 m.
 *
 * Bewusst **nicht** das Bauernhaus mit anderer Skalierung: ein Minka hat ein
 * Reetdach mit 45°, eine Hütte am Wasser hat Wellblech mit 12°. Der Unterschied
 * ist aus 100 m die ganze Unterscheidung zwischen Dorf und Hof — und der Grund,
 * warum das Fischerdorf sonst wie ein zweites Reisfeld aussähe.
 *
 * Sie steht auf niedrigen Pfählen. An einer Flachküste, deren Uferlinie im
 * Median auf 0,02 m liegt (gemessen in `gen-props.mjs`), ist das kein Zierrat.
 */
function fishHut(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const wallH = 2.4;
  const y0 = 0.45;
  for (const x of [-2.4, 0, 2.4]) {
    for (const z of [-1.7, 1.7]) parts.push(at(pillar(0.13, 0.15, y0 + 0.1, 5, 'wood'), x, 0, z));
  }
  parts.push(at(box(5.6, 0.18, 4.0, 'wood'), 0, y0, 0));
  parts.push(at(box(5.4, wallH, 3.8, 'wood'), 0, y0 + wallH / 2, 0));
  // Rahmen und Öffnungen — ohne sie ist es eine Kiste.
  parts.push(at(box(5.6, 0.16, 4.0, 'wood'), 0, y0 + wallH, 0));
  parts.push(at(box(1.3, 1.95, 0.09, 'plaster'), -1.2, y0 + 0.98, 1.92));
  parts.push(at(box(1.0, 0.8, 0.09, 'steel'), 1.3, y0 + 1.5, 1.92));
  // Wellblechdach, flach geneigt und mit deutlichem Überstand nach vorn.
  const roof = box(6.2, 0.12, 5.0, 'steel');
  parts.push(at(rotX(roof, 0.21), 0, y0 + wallH + 0.34, -0.1));
  return finish(parts, 'fishHut');
}

/**
 * Netztrockengestell, gemessen 2,91 × 2,47 × 4,60 m.
 *
 * Zwei A-Böcke, eine Firstlatte, darüber hängende Netzbahnen. Die Bahnen sind
 * dünne Quader und **keine** Alphaflächen: ein transparentes Material bräuchte
 * Sortierung, und dafür sind es zu wenige Pixel (PROPS-Klasse `klein`, ab 220 m
 * verschwindet das Stück ohnehin).
 */
function netRack(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const h = 2.4;
  const lean = 0.28;
  // Die beiden A-Böcke stehen an den **Enden** (z = ±2,1); ihre Beine spreizen
  // quer dazu, also in X. `rotZ` kippt in der XY-Ebene und ist damit die
  // richtige Achse — mit `rotX` spreizten sie längs und die Firstlatte stünde
  // auf nichts.
  for (const z of [-2.1, 2.1]) {
    for (const side of [-1, 1]) {
      const leg = pillar(0.07, 0.09, h / Math.cos(lean), 5, 'wood');
      parts.push(at(rotZ(leg, side * lean), -side * 0.7, 0, z));
    }
  }
  // Firstlatte **längs**, also entlang Z, und aus einem **zentrierten**
  // Zylinder. Zwei Messungen liegen dazwischen:
  //   `rotZ(pillar(…), π/2)`  → 6,00 × 2,48 × 4,16 — die Latte lag quer.
  //   `rotX(pillar(…), π/2)`  → 2,91 × 2,47 × 6,77 — richtige Achse, aber
  //                             `pillar` setzt den Fuß auf y = 0, und die
  //                             Drehung nimmt diesen Versatz mit: die Latte
  //                             begann am Bock und endete 4,6 m dahinter.
  // Deshalb hier die rohe `CylinderGeometry` (um den Ursprung zentriert),
  // wie es `boat` für seinen Rumpf schon tut.
  const ridge = paint(new CylinderGeometry(0.06, 0.06, 4.6, 5), 'wood');
  parts.push(at(rotX(ridge, Math.PI / 2), 0, h, 0));
  // Netzbahnen, unterschiedlich tief herabhängend — gleich lange sähen wie ein
  // Zaun aus. Feste Werte statt Zufall: die Geometrie wird einmal gebaut und
  // von allen Instanzen geteilt.
  const drops = [1.5, 1.05, 1.35, 0.85, 1.2];
  drops.forEach((drop, i) => {
    const z = -1.7 + i * 0.85;
    parts.push(at(box(0.62, drop, 0.05, 'thatch'), 0, h - drop / 2, z));
  });
  return finish(parts, 'netRack');
}

/**
 * Bootsrampe, gemessen 5,25 × 2,53 × 11,58 m.
 *
 * Eine geneigte Betonplatte mit zwei Bordsteinen, die ins Wasser läuft. Der
 * Pivot liegt am **oberen** Ende, weil dort das Land ist: die Platzierung
 * setzt das Prop auf die Uferlinie, und alles darunter darf im Wasser
 * verschwinden. Umgekehrt stünde die Rampe auf dem Meer.
 *
 * Neigung 8° — flach genug, um einen Kahn hinaufzuziehen, steil genug, dass
 * die Platte im Bild als Rampe und nicht als Weg gelesen wird.
 */
function boatRamp(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const length = 11;
  const tilt = (8 * Math.PI) / 180;
  const slab = box(4.4, 0.4, length, 'concrete');
  parts.push(at(rotX(slab, -tilt), 0, -Math.sin(tilt) * length * 0.5 - 0.1, length / 2));
  for (const side of [-1, 1]) {
    const kerb = box(0.35, 0.55, length, 'concrete');
    parts.push(at(rotX(kerb, -tilt), side * 2.2, -Math.sin(tilt) * length * 0.5 + 0.1, length / 2));
  }
  // Poller am Kopf der Rampe. Ohne ihn fehlt der Maßstab.
  parts.push(at(pillar(0.16, 0.2, 0.7, 6, 'steel'), -2.7, 0, -0.4));
  return finish(parts, 'boatRamp');
}

/**
 * Kisten- und Reusenstapel, gemessen 2,11 × 1,23 × 1,49 m.
 *
 * Eines der billigsten Stücke im Satz (72 Dreiecke) und das, was den Unterschied
 * zwischen „Häuser am Wasser" und „hier wird gearbeitet" macht. Zwei
 * Kistenstapel und eine liegende Reuse.
 */
function crateStack(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  parts.push(at(box(0.9, 0.42, 0.68, 'wood'), -0.6, 0.21, 0));
  parts.push(at(box(0.86, 0.4, 0.64, 'plaster'), -0.55, 0.62, 0.08));
  parts.push(at(box(0.88, 0.42, 0.66, 'wood'), -0.62, 1.02, -0.05));
  parts.push(at(box(0.94, 0.44, 0.7, 'wood'), 0.55, 0.22, 0.3));
  // Reuse: ein liegender Sechskantzylinder, wie sie zu Dutzenden am Kai stehen.
  const trap = paint(new CylinderGeometry(0.34, 0.34, 1.1, 6, 1), 'thatch');
  rotZ(trap, Math.PI / 2);
  parts.push(at(trap, 0.5, 0.34, -0.5));
  return finish(parts, 'crateStack');
}

/**
 * Kleiner Holzsteg, gemessen 2,59 × 2,60 × 14,00 m.
 *
 * Der zweite Steg aus PLAN 8.9. Prozedural und **nicht** ein zweites
 * `modular_wooden_pier`: das Fremdmodell ist 24 m lang und trägt seine eigene
 * Höhenlage (`y: seaLevel − 2,2`, gemessen in `gen-props.mjs`). Ein Dorfsteg
 * soll daneben klein aussehen, und ein hochskaliertes Modell zweimal im selben
 * Bild liest sich als Wiederholung.
 *
 * Der Pivot liegt auf der **Deckoberkante**, damit die Platzierung ihn direkt
 * auf die gewünschte Höhe über der Wasserlinie setzen kann; die Pfähle hängen
 * 1,6 m darunter und dürfen im Wasser stehen.
 */
function jetty(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const length = 14;
  parts.push(at(box(2.2, 0.14, length, 'wood'), 0, -0.07, 0));
  // Bohlen quer: fünf schmale Leisten reichen, damit die Richtung ablesbar ist.
  for (let i = 0; i < 7; i++) {
    parts.push(at(box(2.3, 0.06, 0.18, 'wood'), 0, 0.03, -length / 2 + 1 + i * 2));
  }
  for (let i = 0; i < 5; i++) {
    const z = -length / 2 + 1.4 + i * 3;
    for (const x of [-0.9, 0.9]) parts.push(at(pillar(0.13, 0.16, 1.6, 5, 'wood'), x, -1.74, z));
  }
  // Zwei Dalben am Kopf, an denen ein Boot festmacht.
  for (const x of [-1.15, 1.15]) parts.push(at(pillar(0.12, 0.15, 2.6, 5, 'wood'), x, -1.74, length / 2 - 0.6));
  return finish(parts, 'jetty');
}

// ── Stadtrand — P8.9, aus dem Befund von 8.8 ─────────────────────────────────
//
// 8.8 hat am Bild geprüft, dass die **Silhouette** bereits abgestuft ist, und
// den naheliegenden Regler (`randomFloors` am Rand) deshalb nicht angefasst.
// Was dort im Bild stand, war eine Kante **am Boden**: die Bebauung hört auf,
// daneben liegt leere Fläche. Diese drei Stücke sind die Antwort darauf, und
// sie sind absichtlich das Unauffälligste im ganzen Satz — was den Rand einer
// Kleinstadt ausmacht, ist nichts, was man ansieht.

/**
 * Mauerabschnitt, gemessen 8,42 × 2,05 × 0,44 m.
 *
 * Betonfertigteile auf einem Sockel, wie sie in Japan jedes Grundstück
 * begrenzen. In Reihen gesetzt ergibt sich daraus die Gliederung, die einem
 * Stadtrand sonst fehlt: nicht Gebäude, sondern **Parzellen**.
 *
 * Ein Abschnitt ist 8 m lang, weil die Reihe damit einer Blockkante folgen kann,
 * ohne dass jede Ecke ein eigenes Prop braucht — und weil 8 m bei 20 Instanzen
 * 160 m Mauer sind und damit die Breite des Vorfelds aus 8.5c abdecken.
 */
function concreteWall(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  parts.push(at(box(8.0, 0.3, 0.42, 'stone'), 0, 0.15, 0));
  parts.push(at(box(7.9, 1.6, 0.26, 'concrete'), 0, 1.1, 0));
  // Abdeckung und Pfeiler. Die Pfeiler sind das, was eine Betonwand von einer
  // Mauer unterscheidet — ohne sie liest sich die Reihe als Lärmschutzwand.
  parts.push(at(box(8.0, 0.14, 0.36, 'concrete'), 0, 1.97, 0));
  for (const x of [-4.0, 0, 4.0]) parts.push(at(box(0.42, 2.05, 0.44, 'concrete'), x, 1.02, 0));
  return finish(parts, 'concreteWall');
}

/**
 * Foliengewächshaus, gemessen 7,10 × 3,60 × 14,30 m.
 *
 * Ein halber Zylinder auf einem Sockel. Am Rand japanischer Kleinstädte stehen
 * sie zu Dutzenden zwischen den letzten Häusern und dem Feld — genau die Zone,
 * die hier fehlt.
 *
 * `plaster` als Material und nicht durchscheinend: ein Tunnel aus Folie ist bei
 * 2,2° Sonnenstand von außen ohnehin milchig weiß, und ein transparentes
 * Material kostet Sortierung für ein Prop, das ab 650 m verschwindet.
 */
function greenhouse(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const length = 14;
  const radius = 3.4;
  // Echte Halbschale über `thetaStart`/`thetaLength`, nicht ein ganzer Zylinder
  // mit versenkter Unterhälfte. Der ganze Zylinder war der erste Versuch, und
  // die Messung hat ihn verworfen: er reichte **3,20 m unter den Boden** und
  // die Hüllbox meldete 6,80 m Höhe für einen 2,8 m hohen Tunnel. Das ist keine
  // Kosmetik — `PROP_CLASSES` staffelt nach Silhouettenhöhe, und eine doppelt
  // so hohe Box hätte das Gewächshaus in die falsche Größenklasse gezogen.
  //
  // `thetaStart = π/2` ist gemessen und nicht hergeleitet: von den vier
  // Vielfachen liefert nur dieses nach `rotX(π/2)` die **obere** Hälfte
  // (y 0…3,40); bei 0 und π steht die Schale hochkant, bei −π/2 unter Grund.
  const shell = paint(
    new CylinderGeometry(radius, radius, length, 12, 1, true, Math.PI / 2, Math.PI),
    'plaster',
  );
  rotX(shell, Math.PI / 2);
  parts.push(at(shell, 0, 0.2, 0));
  parts.push(at(box(radius * 2 + 0.3, 0.5, length + 0.3, 'concrete'), 0, 0.25, 0));
  // Giebel und Tür an der Stirnseite.
  for (const side of [-1, 1]) {
    parts.push(at(box(radius * 1.7, 2.4, 0.1, 'plaster'), 0, 1.4, side * length * 0.5));
  }
  parts.push(at(box(1.6, 2.0, 0.14, 'steel'), 0, 1.2, length * 0.5 + 0.03));
  return finish(parts, 'greenhouse');
}

/**
 * Lagerhalle, gemessen 21,52 × 6,42 × 13,30 m.
 *
 * Der größte der drei Stadtrand-Bauten und trotzdem niedriger als jedes
 * Wohnhaus im Distrikt (dort 2…17 Geschosse). Das ist der Punkt: eine flache
 * Halle zwischen Hochhaus und Feld ist die Stufe, die 8.8 im Bild gefehlt hat.
 *
 * Satteldach mit 9° — Wellblech, kein Ziegel. Ein Rolltor an der Giebelseite
 * gibt den Maßstab.
 */
function warehouse(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  parts.push(plinth(21, 12.4, 1.2, 'concrete'));
  const w = 21;
  const d = 12.4;
  const wallH = 4.6;
  parts.push(at(box(w, wallH, d, 'plaster'), 0, wallH / 2, 0));
  // Sockel und Stützenraster, damit die Wand nicht als eine Fläche liest.
  parts.push(at(box(w + 0.4, 0.6, d + 0.4, 'concrete'), 0, 0.3, 0));
  for (const x of [-8.4, -4.2, 0, 4.2, 8.4]) {
    for (const z of [-d / 2, d / 2]) parts.push(at(box(0.32, wallH, 0.3, 'steel'), x, wallH / 2, z));
  }
  parts.push(at(box(5.2, 4.0, 0.16, 'steel'), -3.0, 2.05, d / 2 + 0.16));

  // Satteldach aus zwei Platten plus Firstblech.
  const roofH = 1.7;
  const slope = Math.atan2(roofH, w / 2);
  const slabLength = Math.hypot(roofH, w / 2) + 0.5;
  for (const side of [-1, 1]) {
    const slab = box(slabLength, 0.16, d + 0.9, 'steel');
    // Dasselbe verkehrte Vorzeichen wie beim Bauernhaus, und aus demselben
    // Muster kopiert — elf Lagerhallen mit einer Rinne statt eines Satteldachs.
    // Gefunden, weil P8.11 die Regel hinterlassen hat: **ein Fehlerbild ist eine
    // Klasse, kein Einzelfall.** Nach dem ersten Fund wurde derselbe Ausdruck
    // im ganzen Bestand gesucht.
    parts.push(at(rotZ(slab, -side * slope), side * (w / 4), wallH + roofH / 2, 0));
  }
  parts.push(at(box(0.7, 0.2, d + 0.9, 'steel'), 0, wallH + roofH, 0));
  // Giebeldreiecke als schmale Quader — von vorn sieht man sonst unters Dach.
  for (const z of [-d / 2, d / 2]) parts.push(at(box(1.2, roofH * 0.8, 0.3, 'plaster'), 0, wallH + roofH * 0.4, z));
  return finish(parts, 'warehouse');
}

const BUILDERS: Readonly<Record<LandmarkId, () => BufferGeometry>> = {
  torii,
  stoneLantern,
  hokora,
  templeHall,
  templeStairs,
  farmhouse,
  shed,
  powerPole,
  tetrapod,
  lighthouse,
  boat,
  delineator,
  chozuya,
  bellTower,
  fishHut,
  netRack,
  boatRamp,
  crateStack,
  jetty,
  concreteWall,
  greenhouse,
  warehouse,
};

export const LANDMARK_IDS = Object.keys(BUILDERS) as readonly LandmarkId[];

/**
 * Alle Landmark-Geometrien bauen.
 *
 * **Keine reduzierte Stufe.** PLAN.md 5.5 verlangt sie ab 500 Dreiecken.
 * Gemessen (Summe **3972** Dreiecke über alle 22; die zehn aus P8.9 sind
 * eingerückt):
 *
 * | Landmark | Δ | | Landmark | Δ |
 * |---|---|---|---|---|
 * | templeHall | **504** | | tetrapod | 176 |
 * | bellTower | 416 | | templeStairs | 168 |
 * | jetty | 336 | | netRack | 160 |
 * | chozuya | 272 | | stoneLantern | 156 |
 * | lighthouse | 264 | | hokora | 84 |
 * | warehouse | 216 | | boat | 80 |
 * | farmhouse | 204 | | crateStack | 72 |
 * | torii | 200 | | concreteWall | 72 |
 * | powerPole | 200 | | greenhouse | 72 |
 * | fishHut | 192 | | boatRamp | 60 |
 * | — | | | shed | 36 |
 * | — | | | delineator | 32 |
 *
 * P8.9 hat den Satz von 12 auf 22 Stück und von 2104 auf 3972 Dreiecke
 * gebracht — **1868 Dreiecke für ein Fischerdorf, einen Tempelaufgang und
 * einen Stadtrand**, gegen ein Budget von 3 000 000. Die Geometrie ist hier
 * nie der Engpass; die Zahl, auf die es ankommt, steht in `PROPS.capacity`
 * und wird in `gen-props.mjs` geprüft.
 *
 * Die Tempelhalle reißt die Schwelle — um **vier Dreiecke**. Sie bekommt
 * trotzdem keine zweite Stufe: die Schwelle ist für Fremdmodelle gedacht, die
 * fünfstellig anfangen (`coastal_cliff_04`: 1 537 926), und ein zusätzlicher
 * Draw-Call, um im besten Fall 300 Dreiecke zu sparen, ist ein schlechtes
 * Geschäft gegen ein Budget von 3 000 000. Die Zahl hier stehenzulassen ist
 * ehrlicher, als die Halle um vier Dreiecke zu beschneiden, damit die Regel
 * formal stimmt.
 *
 * Kleine Props verschwinden stattdessen ab einer Entfernung ganz — die
 * Alternative, die 5.5 selbst nennt. Siehe `PROPS.fade`.
 */
export function createLandmarkMeshes(): Readonly<Record<LandmarkId, BufferGeometry>> {
  const meshes = {} as Record<LandmarkId, BufferGeometry>;
  for (const id of LANDMARK_IDS) meshes[id] = BUILDERS[id]();
  return meshes;
}
