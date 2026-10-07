# SourceData/legacy — die Karte aus dem Three.js-Prototyp

Rohdaten für die Unity-Importer. **Nur lesen.** Erzeugt am 2026-10-07 aus dem
gebackenen Stand des Prototyps (Seed 20260725, WP6-Straßennetz). Unity sieht
diesen Ordner nicht (er liegt außerhalb von `Assets/`); Editor-Importer lesen
ihn über einen Pfad relativ zum Projektordner.

Neu erzeugen (aus `legacy/threejs/`):
`node tools/export-unity-tile.mjs --full --out ../../SourceData/legacy/terrain`

## Achsen — das Wichtigste zuerst

| | Three.js (Quelle) | Unity (Ziel) |
|---|---|---|
| Händigkeit | rechtshändig | linkshändig |
| Oben | +Y | +Y |
| Norden | **−Z** | **+Z** |
| Umrechnung | — | `unity = (x, y, −z)` |
| Einheit | 1 = 1 m | 1 = 1 m |
| Kartenmitte | (0, 0) | (0, 0) |
| Kartenfläche | x, z ∈ [−1536, 1536] | x ∈ [−1536, 1536], z ∈ [−1536, 1536] |

Drehungen um Y (Props): `props.json` führt `rot` in **Grad** (der Prototyp
rechnet es beim Laden in Radiant um). Three dreht positiv gegen den
Uhrzeigersinn (von oben), Unity im Uhrzeigersinn. Mit der Spiegelung an z gilt
**`unityYawDeg = 180 − rot`**, sofern das Modell in beiden Welten
nach lokal +Z schaut. **Nicht verifiziert** — an einem unsymmetrischen Prop
(z. B. `templeHall`) im Bild prüfen, bevor alle 977 gesetzt werden.

## terrain/

| Datei | Inhalt |
|---|---|
| `height_2049.raw` | Höhenfeld, 2049 × 2049, **16 bit unsigned, little endian** („Windows"). Zeilen **bereits gespiegelt**: Zeile 0 = Südrand (Unity-z minimal). In Unity ohne „Flip Vertically" importieren. Werte 0…65535 = `heightMeters.min…max` |
| `terrain.json` | Terraingröße (3073,5 × 488 × 3073,5 m), Position des Terrain-Objekts in Unity, Prüfpunkt Gipfel |
| `checkpoints.json` | Geländehöhe an fünf festen Punkten (Mitte, Tempelhalle, …) in Three- **und** Unity-Koordinaten. **Die Abnahme des Imports:** `Terrain.SampleHeight` + Terrain-y muss dort auf ~0,1 m stimmen |
| `height_preview.png` | Graustufen, Norden oben (ungespiegelt — zum Ansehen) |
| `meta.json` | Originale Metadaten des Bakers (Weltgröße, Meeresspiegel 0, Wasser, Reisfelder) |
| `zones.png` | Splatmap 1024², RGB = Fels / Gras / Sand, Rest = Reisfeld. **Zeile 0 = Norden** (nicht gespiegelt) |
| `paddy.png` | Wassermaske der Reisfelder 1024², grau. Zeile 0 = Norden. 718 Parzellen, Wassertiefe 0,30 m, Damm 0,55 m |
| `river.json` | Fluss als Knotenliste (Three-Koordinaten) mit Halbbreite und Spiegelhöhe. Zwei Wasserfälle (11,2 m und 39,7 m) |

Die Quelle hat 2048² Stützstellen; für Unitys 2^n + 1 sind letzte Zeile und
Spalte verdoppelt. Die Karte ist dadurch am Ost- und Südrand 1,5 m breiter —
kein Umtasten, jeder Originalwert liegt bitgenau an seiner Stelle.
2677 Stützstellen liegen genau auf dem Maximum (450 m): der Gipfel ist ein
Plateau, deshalb gibt es zusätzlich `checkpoints.json`.

## roads/roads.json

Straßennetz, **Three-Koordinaten**. 152 Einträge in `roads`: `ring`
(highway, 5985 m, geschlossen), `toge` (Bergpass, 3502 m, 4 Kehren), `dorf`
(village), `sando`/`feldpfad`/`kuestenpfad` (Pfade) und 146 Stadtstraßen.

| Feld | Bedeutung |
|---|---|
| `id`, `type`, `tags`, `closed` | Name, Klasse, Schlagworte, Rundkurs ja/nein |
| `nodes[]` | Kontrollpunkte `{pos:[x,y,z], width, banking}` |
| `centerline` | **flaches Array** `[x0,y0,z0, x1,y1,z1, …]`, Abstand `sampleSpacing` = 2 m. y ist die Fahrbahnhöhe |
| `widths[]`, `banking[]` | je Mittellinienpunkt: Fahrbahnbreite (m), Querneigung (Grad) |
| `length` | Länge in m |
| `junctions[]` | Einmündungen in andere Straßen |
| `rails[]` | Leitplanken `{side: ±1, from, to}` in Metern entlang der Straße |
| `trimStart`, `trimEnd` | an Kreuzungen abgeschnittene Länge |
| `measured` | Kennwerte: Mindestradius, Steigung, Kehren, Erdbau |
| `urbanLots[]` (oben) | 121 Bauparzellen der Stadt (Rechteck + Boden-/Dachhöhe) |

Das Terrain in `height_2049.raw` ist **bereits eingeschnitten**: Straßen
liegen in Einschnitten und auf Dämmen. Ein Straßen-Mesh auf der Mittellinie
passt also zum Gelände.

## props/props.json

977 Platzierungen `{id, x, z, rot, scale}` (Three-Koordinaten, `rot` in
**Grad**). **Keine Höhe** — y = Geländehöhe an (x, z). Die `id` ist ein
Prop-Typ; häufigste: tetrapod 372, delineator 170, concreteWall 79, shed 66,
powerPole 66, Felsen 90, greenhouse 30, stoneLantern 20, farmhouse 18,
torii 9, dazu Einzelstücke (templeHall, templeStairs, chozuya, bellTower,
hokora, lighthouse, Pier). Welche Geometrie dazu gehört, steht in
`legacy/threejs/src/world/props/` (`landmarkMeshes.ts`, `PropSystem.ts`).

## Was hier fehlt und woher es kommt

- **Stadt und Dörfer** (Tokyo, Koedo, Kiso-Juku, Funaura, Gassho/Stillwater):
  werden im Prototyp zur Laufzeit im Code erzeugt. Weg nach Unity: einmal aus
  dem laufenden Spiel als GLB exportieren (Plan, Phase 5) — als Blockout und
  Lagereferenz, nicht als Endgeometrie.
- **Autos:** `legacy/threejs/car-lab/models/*.glb` (10 Stück, spielfertige
  Knotenhierarchie, siehe `ArtSource/cars/README.legacy.md`).
- **HDRIs und Texturen** (Poly Haven, CC0): `legacy/threejs/assets/hdri/`,
  `legacy/threejs/assets/textures/`.
