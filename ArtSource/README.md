# ArtSource — Quellen für 3D-Assets

Alles, woraus Assets **entstehen**: Blender-Dateien (`.blend`, über Git LFS)
und Blender-Python-Generatoren. Unity sieht diesen Ordner nicht. Was ins Spiel
geht, wird nach `Assets/_Project/Art/…` exportiert (Regeln:
`.claude/skills/blender-asset/SKILL.md`, Stil: `docs/ART-DIRECTION.md`).

| Ordner | Inhalt |
|---|---|
| `cars/blender/` | Prozedurale Fahrzeug-Generatoren aus dem Prototyp (`carkit.py`, `cars.py`, `build.py`, Lackierung, Tuning-Teile). Bauen die 10 Autos in Blender und exportieren GLB mit spielfertiger Hierarchie. Beschreibung: `cars/README.legacy.md` |
| `kit/` | Stil-Kit: Atlas-Generator (`atlas.py`), Bausteine/UV/Fasen/Export (`core.py`), Vorschau-Bühne (`preview.py`), Felsen/Büsche (`organic.py`). Regeln: `STYLE-KIT.md` |
| `build.py` | Läufer: `build.run([...])` baut, exportiert, rendert Vorschau, schreibt `exports/manifest.json` |
| `kit/graphics.mjs` | Schild- und Tafelgrafiken als SVG → `kit/gfx/*.png` (Headless-Chrome); Tokyo-Grafiken in `kit/graphics_tokyo.mjs` |
| `props/` | Generatoren für Straßenmöbel (Steinlaterne, Getränkeautomat, …) |
| `buildings/` | Generatoren für ganze Gebäude je Baustil (Kura, Tokyo, …), aus Feldern zusammengesetzt; `<stil>_kit.py` = Bausatz-Module eines Stils (Wandprofil, Fenster, Ladenfronten, Schilder) |
| `exports/` | Erzeugte FBX + Atlas-Texturen (nicht von Hand ändern) |
| `previews/` | Vorschaubilder (Stimmung, neutral, `_clay` ohne Textur); `compare/` vorher/nachher |
| `STATUS.md` | Stand des Asset-Sprints |

Regeln:
- Eine Quelle je Asset. Wer ein Asset ändert, ändert die Quelle und exportiert
  neu — nie das exportierte FBX/GLB von Hand.
- Generator-Skripte sind besser als handgeklickte `.blend`-Dateien: ein Agent
  kann sie lesen, ändern und reproduzierbar neu ausführen.
