#!/usr/bin/env node
/**
 * Asset-Pipeline — PLAN.md P5 / 5.1
 *
 *   node tools/process-assets.mjs            alle Rezepturen
 *   node tools/process-assets.mjs boulder_01 nur diese
 *
 * Eingang `assets/source/models/`, Ausgang `assets/generated/models/`. Der
 * Renderer lädt **ausschließlich** den Ausgang; die Quelldateien stehen in
 * `.gitignore` und werden mit `tools/polyhaven.mjs` wiederbeschafft.
 *
 * **Warum es diese Kette überhaupt gibt.** Nicht wegen der Dateigröße — wegen
 * der Vergleichbarkeit. Ein CC0-Modell kommt in fremder Skalierung, mit dem
 * Pivot irgendwo im Raum, mit einer beliebigen Blickrichtung und mit einem
 * Material-Setup, das zu keinem anderen im Projekt passt. Ohne diesen Schritt
 * ist Kitbashing genau der Stil-Mix, vor dem SPEC §6 warnt, und jedes Modell
 * bräuchte seine eigene Sonderbehandlung im Renderer.
 *
 * Was die Zahlen dazu sagen: `coastal_cliff_04` kommt mit **1 537 926
 * Dreiecken** aus dem Netz. Das Dreiecksbudget des ganzen Projekts liegt bei
 * 3 000 000 (SPEC §4). Ein einziger Felsen, ungefragt eingebunden, wäre die
 * halbe Karte.
 *
 * Die Kette je Asset:
 *
 *   1. dedup        doppelte Meshes, Materialien, Texturen zusammenführen
 *   2. flatten+join Hierarchie auflösen, Primitive je Material verschmelzen
 *   3. weld         identische Vertices zusammenziehen
 *   4. normalisieren  Meter, Pivot auf Bodenmitte, +Z nach vorn
 *   5. Material     auf die Projekt-Palette umschreiben (oder Textur behalten,
 *                   dann auf 1024 begrenzt)
 *   6. prune        was danach niemand mehr referenziert, fliegt raus
 *   7. LOD          über `simplify` eine reduzierte Stufe, ab 500 Dreiecken
 *   8. meshopt      Quantisierung und Kompression
 *
 * **Was diese Kette (noch) nicht tut: KTX2.** PLAN.md 5.1 nennt es unter
 * Schritt 3. Der Basis-Encoder liegt nicht als Bibliothek vor, sondern als
 * externes Programm (`toktx` aus der KTX-Software), und das ist auf dieser
 * Maschine nicht installiert. Die Texturen werden deshalb auf 1024 begrenzt
 * und als JPEG neu geschrieben — das ist die halbe Miete und nicht die ganze.
 * Der offene Rest gehört zu P7.5 („alle Texturen KTX2"), wo er ohnehin steht.
 * Für die aktuellen Assets ist der Unterschied klein, weil die meisten ihre
 * Textur ohnehin gegen eine Flachfarbe tauschen.
 */

import { mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join as pathJoin, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Logger, NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  cloneDocument,
  dedup,
  flatten,
  join,
  weld,
  prune,
  simplify,
  meshopt,
  textureCompress,
  clearNodeTransform,
} from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

import { paletteEntry, paletteLinearRgba } from '../src/config/palette.mjs';

// `fileURLToPath`, nicht `.pathname` — siehe tools/bake-terrain.mjs.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_DIR = pathJoin(ROOT, 'assets/source/models');
const OUT_DIR = pathJoin(ROOT, 'assets/generated/models');

/** Projekt-Maximum für Texturkanten, PLAN.md 5.1 Schritt 3. */
const MAX_TEXTURE = 1024;

/** Ab dieser Dreieckszahl bekommt ein Modell eine reduzierte Stufe (PLAN.md 5.5). */
const LOD_THRESHOLD = 500;

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
};

/**
 * Die Rezepturen.
 *
 * **Bewusst hier und nicht neben den Quelldateien**: `assets/source/` steht in
 * `.gitignore`, eine Rezeptur dort wäre bei jedem frischen Auschecken weg. Sie
 * ist das eigentliche Wissen über ein Fremdmodell — alles andere lädt man neu.
 *
 * Felder:
 *
 *  - `targetHeight`  Höhe der Hüllbox in Metern nach der Normalisierung.
 *                    `null` heißt „Quelle ist bereits maßstabsgetreu"; die
 *                    gemessene Größe steht dann trotzdem im Bericht, damit ein
 *                    falscher Maßstab auffällt statt durchzurutschen.
 *  - `yawDeg`        Drehung um Y, damit die Vorderseite nach +Z zeigt. Aus dem
 *                    Modell selbst ist das nicht abzuleiten — ein Felsen hat
 *                    keine Vorderseite, ein Steg schon.
 *  - `material`      Name aus `src/config/palette.mjs`, oder `'keep'`.
 *  - `lodRatio`      Zielanteil der Dreiecke in der reduzierten Stufe.
 *  - `maxTriangles`  Obergrenze für die **volle** Stufe. Wird sie überschritten,
 *                    wird auch die volle Stufe vereinfacht. Das ist der Schritt,
 *                    ohne den ein einzelner Photoscan das Budget sprengt.
 */
const RECIPES = {
  boulder_01: {
    quelle: 'polyhaven:boulder_01',
    // **Der einzige Eintrag mit einer Zielhöhe**, und er zeigt, warum das Feld
    // sparsam benutzt gehört: die Quelle misst 1,27 × 1,00 × 1,83 m, ein
    // Findling also, wie er am Wegrand liegt. Ein erster Versuch mit 3,2 m
    // Zielhöhe machte daraus einen Block von 4,1 × 3,2 × 5,8 m — die Skalierung
    // ist uniform, und wer die Höhe verdreifacht, verdreifacht die Grundfläche
    // mit. 1,6 m ist der Wert, bei dem er neben einer 9-m-Kiefer noch zählt und
    // trotzdem ein Stein bleibt.
    targetHeight: 1.6,
    yawDeg: 0,
    material: 'rock',
    maxTriangles: 1200,
    lodRatio: 0.25,
  },
  coastal_cliff_04: {
    quelle: 'polyhaven:coastal_cliff_04',
    // Der Grund, warum `maxTriangles` existiert: 1 537 926 Dreiecke in der
    // Quelle. Als Felsnase an der Küste oder am Bergpass. Photogrammetrie ist
    // maßstabsgetreu vermessen — 87 × 11 × 24 m ist eine echte Klippe, und sie
    // nachzuskalieren hieße, die Messung durch eine Schätzung zu ersetzen.
    targetHeight: null,
    yawDeg: 0,
    material: 'rock',
    maxTriangles: 2500,
    lodRatio: 0.2,
  },
  rock_moss_set_02: {
    quelle: 'polyhaven:rock_moss_set_02',
    // Sieben Steine als **eine** Formation. Poly Haven liefert sie als Satz in
    // einer Datei, und als Satz werden sie auch gesetzt — sie einzeln
    // herauszutrennen wäre ein Editor-Problem, kein Pipeline-Problem. Die
    // Formation ist deshalb 8,3 m breit und nur 1,4 m hoch.
    targetHeight: null,
    yawDeg: 0,
    material: 'rock',
    maxTriangles: 900,
    lodRatio: 0.3,
  },
  modular_wooden_pier: {
    quelle: 'polyhaven:modular_wooden_pier',
    // **Die eine Ausnahme mit Textur.** Ein Steg aus Flachfarbe wäre ein
    // brauner Kasten; was ihn als Steg lesbar macht, sind die Fugen zwischen
    // den Planken, und die stecken in der Albedo. Der Pfad „Textur behalten"
    // ist deshalb kein toter Zweig der Pipeline, sondern begründet benutzt.
    targetHeight: null,
    yawDeg: 0,
    material: 'keep',
    // Knapper als bei einem Asset mit Flachfarbe, weil es keine zweite Stufe
    // bekommt (siehe `writeLod`): was hier steht, wird bis zur Sichtgrenze
    // gezeichnet. Die Mole steht einmal auf der Karte.
    maxTriangles: 3000,
    lodRatio: 0.35,
  },
};

// Der Encoder muss **am IO** hängen, nicht nur an der `meshopt()`-Transformation:
// die Transformation markiert nur, was komprimiert werden soll, geschrieben wird
// es beim `writeBinary`. Ohne diese Zeile bricht der Schreibvorgang mit
// „Cannot read properties of undefined (reading 'encodeFilterOct')" ab — einer
// Meldung, die auf die Geometrie zeigt statt auf die fehlende Abhängigkeit.
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })
  // Ohne das meldet jede Transformation jedes gelöschte Accessor einzeln, und
  // der eigentliche Bericht — Dreiecke rein, Dreiecke raus — geht darin unter.
  .setLogger(new Logger(Logger.Verbosity.WARN));

function countTriangles(document) {
  let total = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices();
      const attribute = primitive.getAttribute('POSITION');
      total += (indices ? indices.getCount() : (attribute?.getCount() ?? 0)) / 3;
    }
  }
  return Math.round(total);
}

/**
 * Vertices verschmelzen, die **fast** an derselben Stelle liegen.
 *
 * `weld()` aus gltf-transform vergleicht bitgenau. Für ein modelliertes Asset
 * ist das richtig; für einen Photoscan nicht, weil dessen Auspackung an jeder
 * Naht zwei Vertices mit minimal verschiedenen Koordinaten hinterlässt. Die
 * Folge ist keine Fehlermeldung, sondern eine Vereinfachung, die einfach nicht
 * greift: meshoptimizer darf über eine Randkante nicht zusammenziehen, und ein
 * fragmentiertes Netz besteht fast nur aus Randkanten.
 *
 * Gemessen an `boulder_01`, Ziel 1200 Dreiecke:
 *
 * | Verschweißung | Vertices | erreicht | Fehler |
 * |---|---|---|---|
 * | `weld()` allein (bitgenau) | 61 991 | **53 498** | 0,0155 |
 * | dasselbe, Fehlergrenze auf 1,0 gesetzt | 61 991 | **53 498** | 0,0155 |
 * | zusätzlich räumlich, 0,1 mm | **33 063** | **1200** | 0,0132 |
 * | zusätzlich räumlich, 5 mm | 32 387 | 1200 | 0,0131 |
 *
 * Zwei Dinge stehen darin. Erstens: die Fehlergrenze war **nicht** die Ursache
 * — auf 1,0 gesetzt ändert sich nichts, es ist die Topologie. Zweitens: 0,1 mm
 * genügt bereits vollständig; die Vertexzahl fällt auf 33 063, also genau auf
 * die Hälfte der Dreieckszahl, wie es für ein geschlossenes Netz sein muss.
 * Ein gröberer Wert bringt nichts mehr.
 *
 * **Nur im Flachfarb-Pfad**, und deshalb ohne Rücksicht auf Normalen: gleiche
 * Position heißt gleicher Vertex, die erste Normale gewinnt. Bei einem Scan
 * gibt es keine gewollten harten Kanten, bei einem modellierten Asset schon —
 * dort würde dieser Schritt sie verschleifen.
 */
function spatialWeld(document, tolerance = 1e-4) {
  const buffer = document.getRoot().listBuffers()[0];
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      const indices = primitive.getIndices();
      if (!position || !indices) continue;

      const source = position.getArray();
      const normalSource = primitive.getAttribute('NORMAL')?.getArray() ?? null;
      const lookup = new Map();
      const remap = new Uint32Array(position.getCount());
      const positions = [];
      const normals = [];

      for (let i = 0; i < position.getCount(); i++) {
        const key =
          `${Math.round(source[i * 3] / tolerance)}|` +
          `${Math.round(source[i * 3 + 1] / tolerance)}|` +
          `${Math.round(source[i * 3 + 2] / tolerance)}`;
        let slot = lookup.get(key);
        if (slot === undefined) {
          slot = positions.length / 3;
          lookup.set(key, slot);
          positions.push(source[i * 3], source[i * 3 + 1], source[i * 3 + 2]);
          if (normalSource) {
            normals.push(normalSource[i * 3], normalSource[i * 3 + 1], normalSource[i * 3 + 2]);
          }
        }
        remap[i] = slot;
      }

      const oldIndices = indices.getArray();
      const triangles = [];
      for (let i = 0; i < oldIndices.length; i += 3) {
        const a = remap[oldIndices[i]];
        const b = remap[oldIndices[i + 1]];
        const c2 = remap[oldIndices[i + 2]];
        // Entartete Dreiecke fallen weg: durch das Zusammenziehen können zwei
        // Ecken auf denselben Vertex fallen, und ein Dreieck ohne Fläche ist
        // für den Vereinfacher ein Sonderfall, der nichts beiträgt.
        if (a !== b && b !== c2 && a !== c2) triangles.push(a, b, c2);
      }

      primitive.setAttribute(
        'POSITION',
        document.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer),
      );
      if (normalSource) {
        primitive.setAttribute(
          'NORMAL',
          document.createAccessor().setType('VEC3').setArray(new Float32Array(normals)).setBuffer(buffer),
        );
      }
      primitive.setIndices(
        document.createAccessor().setType('SCALAR').setArray(new Uint32Array(triangles)).setBuffer(buffer),
      );
    }
  }
}

/**
 * Maßstab, Pivot und Blickrichtung festnageln — PLAN.md 5.1 Schritt 5.
 *
 * Die Transformation wird auf die Wurzelknoten gelegt und mit
 * `clearNodeTransform` sofort **in die Vertexdaten gebacken**. Sie am Knoten
 * stehen zu lassen wäre kürzer und würde bei jedem späteren `join` oder
 * `simplify` wieder zur Frage; gebacken ist sie ein für alle Mal beantwortet.
 *
 * Der Pivot liegt auf **Bodenmitte**: XZ in der Mitte der Hüllbox, Y auf ihrer
 * Unterkante. Das ist dieselbe Konvention wie bei der Vegetation aus P4 — dort
 * sitzt der Instanzursprung auf dem Gelände. Ein Prop mit Pivot im Schwerpunkt
 * schwebte auf halber Höhe im Boden, und zwar je Modell verschieden weit.
 */
function normalise(document, recipe) {
  const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
  const before = getBounds(scene);
  const sizeBefore = [
    before.max[0] - before.min[0],
    before.max[1] - before.min[1],
    before.max[2] - before.min[2],
  ];

  const scale = recipe.targetHeight ? recipe.targetHeight / sizeBefore[1] : 1;
  const yaw = ((recipe.yawDeg ?? 0) * Math.PI) / 180;
  // Quaternion einer reinen Y-Drehung.
  const rotation = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];

  for (const node of scene.listChildren()) {
    node.setScale(node.getScale().map((v) => v * scale));
    node.setRotation(rotation);
    node.setTranslation(node.getTranslation().map((v) => v * scale));
  }
  for (const node of scene.listChildren()) clearNodeTransform(node);

  // **Erst jetzt** verschieben: die Hüllbox nach Skalierung und Drehung ist
  // eine andere als davor, und der Pivot soll auf der neuen sitzen.
  const rotated = getBounds(scene);
  const offset = [
    -(rotated.min[0] + rotated.max[0]) / 2,
    -rotated.min[1],
    -(rotated.min[2] + rotated.max[2]) / 2,
  ];
  for (const node of scene.listChildren()) {
    node.setTranslation(node.getTranslation().map((v, i) => v + offset[i]));
  }
  for (const node of scene.listChildren()) clearNodeTransform(node);

  const after = getBounds(scene);
  return {
    sizeBefore,
    size: [after.max[0] - after.min[0], after.max[1] - after.min[1], after.max[2] - after.min[2]],
    scale,
    // Größter waagerechter Abstand vom Pivot — der Radius, den das
    // Platzierungs-System für Culling und Abstandsprüfungen braucht.
    radius: Math.max(
      Math.hypot(after.min[0], after.min[2]),
      Math.hypot(after.max[0], after.max[2]),
      Math.hypot(after.min[0], after.max[2]),
      Math.hypot(after.max[0], after.min[2]),
    ),
    floor: after.min[1],
  };
}

/**
 * Materialien auf die Projekt-Palette umschreiben — PLAN.md 5.1 Schritt 6.
 *
 * Texturen werden **gelöst, nicht gelöscht**: `prune()` räumt danach auf. Das
 * ist der Unterschied zwischen „diese Textur wird nicht mehr gebraucht" und
 * „ich weiß, dass niemand sonst sie benutzt" — letzteres weiß prune, dieser
 * Code nicht.
 */
function rewriteMaterials(document, recipe) {
  const entry = paletteEntry(recipe.material);
  const rgba = paletteLinearRgba(entry.color);
  for (const material of document.getRoot().listMaterials()) {
    material
      .setBaseColorFactor(rgba)
      .setBaseColorTexture(null)
      .setMetallicRoughnessTexture(null)
      .setOcclusionTexture(null)
      .setEmissiveTexture(null)
      .setEmissiveFactor([0, 0, 0])
      .setNormalTexture(null)
      .setRoughnessFactor(entry.roughness)
      .setMetallicFactor(entry.metalness);
    // **Auch die Normalmap geht.** Naheliegend wäre, sie zu behalten — sie
    // trägt keine Farbe und damit keinen fremden Stil, sondern die Oberfläche.
    // Sie braucht aber UVs, und die sind hier schon weg (siehe
    // `dropTextureAttributes`): ohne sie wäre die Textur eine Datei, die
    // niemand abtastet. Die Oberfläche kommt stattdessen aus den Facetten der
    // Geometrie selbst — bei einem Felsen aus 1200 Dreiecken sind das genug.
  }
}

/**
 * UVs, Tangenten und Vertexfarben werfen — nur bei Assets mit Flachfarbe.
 *
 * **Der Schritt, ohne den die Vereinfachung nicht funktioniert.** Gemessen:
 * `boulder_01` ging mit UVs von 66 122 auf 54 114 Dreiecke herunter, obwohl das
 * Ziel bei 1200 lag — meshoptimizer darf über eine UV-Naht hinweg nicht
 * zusammenziehen, und ein Photoscan besteht aus solchen Nähten. Ohne UVs sind
 * es 1200, also das Ziel. Derselbe Grund, warum `coastal_cliff_04` von Anfang
 * an funktionierte: dessen Auspackung hat weniger Inseln.
 *
 * Es kostet nichts, weil diese Assets ihre Textur ohnehin gegen eine
 * Palettenfarbe tauschen. Für `material: 'keep'` bleibt alles stehen.
 */
function dropTextureAttributes(document) {
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      for (const semantic of primitive.listSemantics()) {
        if (semantic.startsWith('TEXCOORD') || semantic.startsWith('COLOR') || semantic === 'TANGENT') {
          primitive.setAttribute(semantic, null);
        }
      }
    }
  }
}

async function processAsset(id, recipe, report) {
  const source = pathJoin(SOURCE_DIR, id, `${id}.gltf`);
  const document = await io.read(source);
  const trianglesBefore = countTriangles(document);

  await document.transform(
    dedup(),
    // `flatten` vor `join`: join verschmilzt nur Primitive, deren Knoten
    // dieselbe Weltmatrix haben, und die entsteht erst durch das Auflösen der
    // Hierarchie.
    flatten(),
    join(),
  );

  // **Vor** dem Verschweißen: mit UVs sind zwei Vertices an derselben Stelle
  // verschiedene Vertices, und `weld` lässt sie stehen.
  if (recipe.material !== 'keep') dropTextureAttributes(document);

  await document.transform(weld());
  if (recipe.material !== 'keep') spatialWeld(document);

  const geometry = normalise(document, recipe);

  if (recipe.material === 'keep') {
    await document.transform(
      textureCompress({
        encoder: sharp,
        targetFormat: 'jpeg',
        resize: [MAX_TEXTURE, MAX_TEXTURE],
        // `resizeFilter` bleibt Vorgabe (lanczos3). Der Unterschied zu
        // `nearest` wäre bei einer Halbierung sichtbar, hier wird meist gar
        // nicht verkleinert — die Quellen kommen schon in 1k.
      }),
    );
  } else {
    rewriteMaterials(document, recipe);
  }

  await document.transform(prune());

  // Volle Stufe deckeln. Ein Photoscan ist nicht „hochauflösend", sondern für
  // diese Karte schlicht unbrauchbar: 1,5 Mio. Dreiecke gegen ein Gesamtbudget
  // von 3 Mio.
  let triangles = countTriangles(document);
  if (triangles > recipe.maxTriangles) {
    await document.transform(
      simplify({
        simplifier: MeshoptSimplifier,
        ratio: recipe.maxTriangles / triangles,
        // Großzügig: bei einem Felsen ist die Silhouette alles, was zählt, und
        // ein enger Fehlerdeckel bricht die Vereinfachung ab, bevor sie das
        // Ziel erreicht. Was tatsächlich herauskam, steht im Bericht.
        error: 0.05,
      }),
    );
    triangles = countTriangles(document);
  }

  const lods = [];
  await mkdir(OUT_DIR, { recursive: true });

  /**
   * Eine Stufe als `.glb` schreiben — eine Datei, ein Fetch, alles darin.
   *
   * Ausgelagerte Ressourcen (`.gltf` plus `.bin` plus `textures/`) wären der
   * naheliegende Weg, um Texturen zwischen den Stufen zu **teilen**. Er wurde
   * gebaut und wieder verworfen: der Renderer lädt jede Datei über Vites
   * `?url`-Import, damit sie einen Inhalts-Hash bekommt und ein Tippfehler beim
   * Bauen auffällt statt im Browser. Relative Verweise aus einer `.gltf` heraus
   * überleben das Hashen nicht — man müsste die URIs beim Laden von Hand
   * umschreiben. Die einfachere Antwort steht unten bei `LOD_THRESHOLD`.
   */
  const writeLod = async (suffix, count) => {
    // Auf einer **Kopie** komprimiert: `meshopt` quantisiert die Attribute, und
    // `simplify` auf quantisierten Daten für die nächste Stufe wäre eine
    // Vereinfachung des bereits Gerundeten.
    const clone = cloneDocument(document);
    await clone.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }));
    const file = `${id}${suffix}.glb`;
    const bytes = await io.writeBinary(clone);
    await writeFile(pathJoin(OUT_DIR, file), bytes);
    lods.push({ datei: file, dreiecke: count, bytes: bytes.length });
  };

  await writeLod('', triangles);

  // **Eine zweite Stufe nur ohne Textur.** PLAN.md 5.5 setzt die Schwelle bei
  // 500 Dreiecken, und für Geometrie stimmt sie. Bei einem texturierten Asset
  // dominiert aber die Textur: `modular_wooden_pier` bringt 1,5 MB davon mit
  // und 78 kB Geometrie. Eine zweite `.glb` verdoppelte die 1,5 MB, um 3 936
  // Dreiecke zu sparen — gegen ein Dreiecksbudget von 3 000 000 und ein
  // Downloadbudget von 15 MB ist das der falsche Tausch. Solche Assets bekommen
  // stattdessen ein knapperes `maxTriangles`.
  if (triangles > LOD_THRESHOLD && document.getRoot().listTextures().length === 0) {
    await document.transform(
      simplify({ simplifier: MeshoptSimplifier, ratio: recipe.lodRatio, error: 0.08 }),
    );
    await writeLod('.lod1', countTriangles(document));
  }

  report[id] = {
    quelle: recipe.quelle,
    material: recipe.material,
    dreieckeQuelle: trianglesBefore,
    groesse: geometry.size.map((v) => Number(v.toFixed(3))),
    groesseQuelle: geometry.sizeBefore.map((v) => Number(v.toFixed(3))),
    massstab: Number(geometry.scale.toFixed(4)),
    radius: Number(geometry.radius.toFixed(3)),
    stufen: lods,
  };
  return report[id];
}

async function main() {
  await MeshoptSimplifier.ready;
  await MeshoptEncoder.ready;

  const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const ids = wanted.length ? wanted : Object.keys(RECIPES);

  console.log(c.bold('\nAsset-Pipeline') + c.dim('  — assets/source/models → assets/generated/models\n'));

  let available;
  try {
    available = await readdir(SOURCE_DIR);
  } catch {
    console.log(c.yellow(`  Kein Quellordner ${SOURCE_DIR.replace(ROOT, '')}.`));
    console.log(c.dim('  Assets holen:  node tools/polyhaven.mjs get models <id> --res 1k\n'));
    process.exit(1);
  }

  const report = {};
  for (const id of ids) {
    const recipe = RECIPES[id];
    if (!recipe) throw new Error(`Keine Rezeptur für „${id}". Bekannt: ${Object.keys(RECIPES).join(', ')}`);
    if (!available.includes(id)) {
      console.log(c.yellow(`  ⚠ ${id} — Quelle fehlt, übersprungen`));
      console.log(c.dim(`      node tools/polyhaven.mjs get models ${id} --res 1k`));
      continue;
    }
    const started = Date.now();
    const result = await processAsset(id, recipe, report);
    const stufen = result.stufen
      .map((l) => `${l.dreiecke.toLocaleString('de-DE')} Δ / ${(l.bytes / 1024).toFixed(0)} kB`)
      .join('  →  ');
    console.log(
      `  ${c.green('✓')} ${c.bold(id.padEnd(24))} ` +
        c.dim(`${result.dreieckeQuelle.toLocaleString('de-DE')} Δ Quelle  ·  `) +
        stufen +
        c.dim(`  ·  ${result.groesse[1].toFixed(2)} m hoch  ·  ${Date.now() - started} ms`),
    );
  }

  const manifest = { version: 1, erzeugt: new Date().toISOString(), assets: report };
  await writeFile(pathJoin(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(c.dim(`\n  manifest.json  ·  ${Object.keys(report).length} Assets\n`));
}

await main();
