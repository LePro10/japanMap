# Wegweiser durch den Three.js-Prototyp

> `legacy/threejs/` ist der alte Stand (bis 2026-10-01, Commit `76483c3`).
> **Nur lesen.** Portiert wird **Verhalten, Daten und Lage** — nicht Code.
> Die alte Arbeitsanleitung heißt dort `WORKFLOW-LEGACY.md` (48 000 Tokens):
> **nie ganz laden**, nur gezielt mit Grep suchen.
> Live-Version des Prototyps: https://lepro10.github.io/japanMap/

## Wo was steht (alle Pfade relativ zu `legacy/threejs/`)

| Thema | Code / Daten | Doku |
|---|---|---|
| Gesamtbild, Systeme | `src/main.ts` (Boot-Reihenfolge), `src/core/` | `ARCHITECTURE.md` (≈ 13 000 Tokens, gut gegliedert) |
| Produkt-Soll (Design) | — | **`ASTRA_PLAN.md`** (Englisch, ≈ 50 000 Tokens — abschnittsweise lesen, Index unten) |
| Wünsche des Eigentümers | — | **`TODO.md`** (Englisch, seine eigenen Worte) |
| Gelände, Straßen, Bake-Kette | `tools/bake-terrain.mjs`, `tools/gen-roads.mjs`, `src/world/roads/` | `SPEC.md` §2, `docs/WP6-status.md` |
| Fahrmodell (Arcade) | `src/game/arcadeDynamics.ts`, `Vehicle.ts`, `src/config/arcade.config.ts`, `vehicle.config.ts`, `vehicles.config.ts`, `groundContact.config.ts`, `gearbox.config.ts`, `tuning.config.ts` | `docs/2026-09-13-physics.md`, `docs/superpowers/specs/2026-09-13-driving-physics-design.md` |
| Fahr-Prüfstände | `tools/bench/arcade.mts`, `fleet.mts`, `hill.mts`, `world.mts`, `offroad*.mts`, `ramp-contact.mts` | Kopf der jeweiligen Datei |
| Autos (10, Blender-generiert) | `car-lab/models/*.glb`, `car-lab/blender/*.py` (Kopie in `ArtSource/cars/`) | `car-lab/README.md` (Kopie: `ArtSource/cars/README.legacy.md`) |
| Stadt Tokyo | `src/world/city/` (`TokyoGenerator.ts`, `CityGenerator.ts`, `CityPedestrians.ts`, `NeonSystem.ts`), `src/config/tokyoLayout.mjs`, `city.config.ts` | `docs/TOKYO.md`, `docs/NEON_CITY.md` |
| Dörfer | `src/world/settlements/` (`koedo/`, `kiso/`, `funaura/`, `gassho/`, `StillwaterVillage.ts`) | `docs/DOERFER.md`, `docs/WP5-stillwater.md` |
| Sakura Commons (Spawn) | `src/world/stunt/SakuraCommons.ts` | `docs/WP2-SAKURA.md` |
| Props, Landmarken | `src/world/props/`, `assets/props.json` | — |
| Vegetation | `src/world/scatter/`, `src/config/vegetation.config.ts` | `ARCHITECTURE.md` §3 |
| Schanzen, Stunts, Driftzonen | `src/world/stunt/`, `src/config/stunt.config.ts` | — |
| Rennen, KI-Gegner | `src/game/RaceDirector.ts`, `RivalField.ts`, `src/game/ai/`, `src/config/events.config.ts` | — |
| Drift-Wertung, Rekorde | `src/game/DriftScore.ts`, `BestTimes.ts` | — |
| Zu Fuß | `src/game/Walker.ts`, `WalkCamera.ts`, `src/config/walker.config.ts` | — |
| Zerstörbares | `src/game/SmashField.ts`, `breakables.ts`, `DebrisFx.ts` | — |
| Garage, Tuning, Profil | `src/game/GarageStage.ts`, `garage*.ts`, `Profile.ts` | `docs/WP3.md` |
| Menü, HUD, Minimap, Fotomodus, Touch | `src/ui/` | `docs/WP1.md` |
| Ton (Motor-Synthese) | `src/audio/`, `src/audio/dsp/`, `src/config/engines.config.ts` | `docs/2026-09-27-audio.md` |
| Licht, Atmosphäre, Qualitätsstufen | `src/render/`, `src/config/lighting.config.ts`, `atmosphere.config.ts`, `quality.config.ts` | `SPEC.md` §3–4 |
| Blickpunkte | `src/debug/viewpoints.ts` | — |
| Referenzbilder (Stimmung) | `docs/astra-refs/*.png` — **nicht im Git** (fremde Bilder), nur auf dem alten Rechner | — |
| Screenshots des Prototyps | `screenshots/` (teils veraltet) | — |
| Fremd-Assets (alle CC0) | `assets/hdri/`, `assets/textures/` | `assets/CREDITS.md` |

## ASTRA_PLAN.md — Index nach Phase

| Phase | Abschnitte |
|---|---|
| 5 Orte | §2 Erster Besuch / Sakura Commons, §3 Karte, Regionen, Stadtviertel, Needle Circuit, Hafen |
| 6 Zu Fuß | §7 Zu Fuß, begehbare Innenräume |
| 7 Spielinhalt | §4 Schanzen, §5 Fahren/Stunts/Zerstörung, §8 Veranstaltungen (Katalog) |
| 8 Progression | §6 Zehn Autos + Tuning + Ton je Auto, §9 Sparks, Entdeckungen, Speichern |
| 9 UI/Ton | §10 Menü und HUD, §11 Fotos und Rekorde |
| 10 Plattform | §12 Werbung (Rewarded) |

## Was der Prototyp kann (Stand 2026-10-01) — die Messlatte

10 Autos (Kite S bis Needle 01) auf einem Arcade-Modell · 6 Veranstaltungen
(Coast Loop, Tōge Descent, Neon Circuit, Tōge Climb, Ring Time Trial, Tōge
Drift Run) mit bis zu 3 KI-Gegnern · Drift-Kette bis ×5, doppelt in zwei
Driftzonen · Zu Fuß mit Rutschen, Ein-/Aussteigen · Fotomodus · Menü mit
sechs Reitern · Minimap, Weltkarte, Regionen · 6 Schanzen, 90 Pickups ·
zerstörbare Objekte · Fußgänger in der Stadt · Motor-Ton je Auto · Touch ·
fünf Qualitätsstufen. Bekannte Mängel: Rennen wackelig, KI-Gegner schwach,
Straßen/Kreuzungen mit Fehlern, Fußgänger an falschen Orten, Optik aus
Code-Grundformen, Speichern fehlt, CrazyGames-SDK fehlt.

## Prototyp starten (für den GLB-Export der Orte, Phase 5)

```bash
cd legacy/threejs
npm ci            # einmalig
npm run dev       # http://localhost:5173 (oder --port 5180 --strictPort)
```

Die gebackenen Daten liegen im Git (`assets/generated/`), ein neues Backen
ist **nicht** nötig. Im Dev-Build gibt es `window.japanMap` (u. a.
`japanMap.view('name')`, `japanMap.shot('name')`, `japanMap.engine`).

**Ort als GLB exportieren** (Blockout, nicht Endgeometrie):

```js
const { GLTFExporter } = await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js');
const root = japanMap.engine.scene.getObjectByName('Funaura fishing village'); // Gruppenname im jeweiligen *System / *Village
const glb = await new GLTFExporter().parseAsync(root, { binary: true });
const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([glb])), download: 'funaura.glb' }); a.click();
```

Achtung: eigene Shader (`onBeforeCompile`) werden zu Standardmaterialien,
Instanzen über `EXT_mesh_gpu_instancing` — für eine Lagereferenz reicht das.
Achsen beim Import: siehe `SourceData/legacy/README.md`.

## Lehren aus dem Prototyp, die in jeder Engine gelten

Verdichtet aus über 100 Einträgen der alten Arbeitsanleitung. Was davon in
die Regeln von `CLAUDE.md` passt, steht dort; der Rest hier zum Nachschlagen.

1. **Ziel statt Ergebnis gemeldet** — mehrfach: Kennwerte von *vor* dem
   Schnitt, Sollwerte statt Messung. → Nach jeder Änderung neu messen.
2. **Alle Zahlen grün, im Bild nichts** — Shader übersetzt nicht, Fläche
   unter einer anderen, rückseitig gewickelt, Pass ohne Ausgang. → Bild
   ansehen; Konsole nach Material-/Shader-Änderungen lesen.
3. **Im Bild, aber in keiner Zahl** — Karosserie steckte 0,78 m im Hang bei
   „0 Kontakten". → Fehlt eine Kennzahl, ist das der erste Befund.
4. **Klemme auf einen Betrag trifft beide Enden** (viermal passiert). →
   Bereiche über ihre Richtung/Variable abgrenzen.
5. **Exakt eine Konstante als Messwert** (−6,00 cm, exakt 2,00 m) ist kein
   Ergebnis, sondern ein Hinweis, dass der Messaufbau falsch ist.
6. **Von Hand gesetzter Zustand** (Menü sichtbar gesetzt, Auto ohne
   Straßenkontext abgesetzt, Kamera direkt gedreht) → misst sich selbst.
7. **Kommentar, der rechnet, ist eine Abhängigkeit** — Herleitungen gehören
   in Tests, nicht in Kommentare.
8. **Tote Regler** (`viewDistance`, `shadowCascades`, `minSpinGrip`) —
   Wert verdoppeln und nullen; ändert sich nichts, ist er tot.
9. **Neue Nutzungsart findet alte Fehler** (Fahrmodus fand Planken quer über
   Straßen, Touch fand Pointer-Lock-Fehler, Springen fand Räder ohne Auto).
   → Zeit dafür einplanen.
10. **Warm gegen kalt** — Zwischenspeicher verfälschen Zeiten; kalt messen.
11. **Vorher/Nachher an zwei Orten** misst die Kamera. → feste Blickpunkte.
12. **Prüfstand feiner als die Quelle** misst seine eigene Abtastung.
13. **Anzeige-Schicht darf die Simulation nicht mitnehmen** (ein NaN im Ton
    hielt das ganze Spiel an). → Eingaben fremder APIs an *einer* Stelle prüfen.
14. **Koordinaten auf erodierter Karte sind Behauptungen** — 4 von 5
    handgesetzten Schanzenplätzen waren unbrauchbar. → Ort im Bild prüfen.
15. **Unbeleuchtete Farben schreiben direkt ins Bild** — Staub war 31× heller
    als der Boden. → gegen gemessenen Bezugspunkt setzen, Tonemapper beachten.
16. **Gleichgewichtspunkt vor Sollwert** — eine Regelgröße ohne Fixpunkt läuft
    davon (Drift-Gierrate). → erst ausrechnen, dann einstellen.
17. **Eingaben mit zwei Bedeutungen** (Bremse = Rückwärts) brauchen eine
    vollständige Bedingung dazwischen (KI fuhr in der Startaufstellung rückwärts).
18. **Auf einem Kreis ist die Differenz zweier Positionen nicht der Weg**
    (Rundenzählung an der Naht).
