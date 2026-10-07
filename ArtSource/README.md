# ArtSource — Quellen für 3D-Assets

Alles, woraus Assets **entstehen**: Blender-Dateien (`.blend`, über Git LFS)
und Blender-Python-Generatoren. Unity sieht diesen Ordner nicht. Was ins Spiel
geht, wird nach `Assets/_Project/Art/…` exportiert (Regeln:
`.claude/skills/blender-asset/SKILL.md`, Stil: `docs/ART-DIRECTION.md`).

| Ordner | Inhalt |
|---|---|
| `cars/blender/` | Prozedurale Fahrzeug-Generatoren aus dem Prototyp (`carkit.py`, `cars.py`, `build.py`, Lackierung, Tuning-Teile). Bauen die 10 Autos in Blender und exportieren GLB mit spielfertiger Hierarchie. Beschreibung: `cars/README.legacy.md` |
| `props/` | (Phase 4) Torii, Laternen, Automaten, Straßenmöbel |
| `buildings/` | (Phase 4/5) Modulare Gebäudebausätze je Ort |

Regeln:
- Eine Quelle je Asset. Wer ein Asset ändert, ändert die Quelle und exportiert
  neu — nie das exportierte FBX/GLB von Hand.
- Generator-Skripte sind besser als handgeklickte `.blend`-Dateien: ein Agent
  kann sie lesen, ändern und reproduzierbar neu ausführen.
