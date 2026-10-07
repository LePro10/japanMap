# Unity-Umzug — Plan

> Stand 2026-10-07. **Entscheidung offen.** Zuerst läuft ein kleiner Probelauf
> (Phase 0). Erst wenn der die Kriterien erfüllt, beginnt Phase 1.
> Hintergrund und Abwägung: Gespräch vom 2026-10-07 (Unity vs. Babylon.js vs.
> Three.js, Browser vs. Steam).

## Warum die Doku in diesem Repo jetzt nicht umgebaut wird

- **Kommt der Umzug,** bekommt das Unity-Projekt eine eigene, kurze Doku. Ein
  Umbau von `CLAUDE.md`/`PLAN.md` hier wäre dann verschwendet.
- **Kommt er nicht,** sieht der Umbau anders aus (Three.js + Rapier/Jolt), und
  er richtet sich nach dem, was der Probelauf gezeigt hat.

Dieses Repo bleibt bis zur Entscheidung, wie es ist, und dient danach als
**Archiv und Datenquelle** — nur gelesen, nicht weiterentwickelt.

## Phase 0 — Probelauf (jetzt)

Eine kleine Szene in Unity 6.6, in einem Durchgang von einem Agenten gebaut:
ein Stück der echten Karte, zwei bis drei in Blender gebaute Assets, ein Menü,
ein Web-Build. Prompt: [unity-spike-prompt.md](unity-spike-prompt.md).

Das Kartenstück liegt fertig in `export/unity-spike/` (nicht eingecheckt,
neu erzeugen mit `node tools/export-unity-tile.mjs`):

| Datei | Inhalt |
|---|---|
| `height_513.raw` | 513 × 513, 16 bit, little endian, 768 m Kante, 31…191 m Höhe |
| `terrain.json` | Terraingröße, Position in Unity-Koordinaten, Gipfel zur Prüfung |
| `height_preview.png` | Graustufenbild, Norden oben |

**Kriterien — vorher festgelegt, damit nicht nach Gefühl entschieden wird:**

| Frage | Unity gewinnt, wenn … |
|---|---|
| Browser | Web-Build lädt, Startdownload ≲ 30 MB, läuft auf dem eigenen Handy |
| KI-Arbeit | Szene entstand ohne Handarbeit im Editor (außer Installation/Anmeldung) |
| Tempo | Kompilieren/Play/Build bremsen den Agenten nicht spürbar aus |
| Optik | Assets + Szene sehen besser aus als der heutige Stand |
| Kosten | Verbrauch des Laufs ist für ein ganzes Projekt tragbar |

## Phase 1 — Daten aus japanMap mitnehmen (nur nach „ja")

Die Karte ist **Daten**, nicht Code. Das wandert mit:

| Quelle | Weg nach Unity | Werkzeug |
|---|---|---|
| `height.r16` (2048², 1,5 m) | Terrain. Unity braucht 2^n + 1 → als 4 × 4 Kacheln à 513 oder auf 2049 umgetastet | `tools/export-unity-tile.mjs` (für die ganze Karte erweitern) |
| `zones.png` (Fels/Gras/Sand/Reis) | Splatmap → Terrain-Layer | neu, klein |
| `roads.json` (72 Routen, Mittellinien) | Splines → Straßen-Mesh | neu |
| `assets/props.json` | Platzierungen → Prefabs | neu, klein |
| Stadt, Dörfer, Landmarken (im Code gebaut) | **einmal** aus dem laufenden Spiel als GLB exportieren (`GLTFExporter`) | neu |
| `car-lab/models/*.glb` (10 Autos) | direkt importieren — Knotenhierarchie ist schon spielfertig | — |
| Zahlen aus `src/config/*.config.ts` (Fahrzeuge, Arcade, Wirtschaft) | ScriptableObjects | von Hand übertragen |
| Motor-Ton (`src/audio/dsp`) | portieren oder neu, später | — |

Was **nicht** mitkommt: eigene Physik, Kollision, Renderweg, Shader,
Vegetations-Streaming, Kamera, Debug-Werkzeuge. Das übernimmt Unity.

## Phase 2 — Neues Repo, neue Regeln

- Eigenes Repo `japanMap-unity`. Dieses Repo bleibt Archiv.
- **`CLAUDE.md` unter 150 Zeilen:** Befehle, Ordnerstruktur, Regeln. Keine
  Fehlergeschichten — die Lehren aus `CLAUDE.md` hier werden auf rund 30
  Regeln eingedampft.
- **Eine `STATUS.md`** statt `PLAN.md`: was geht, was ist kaputt, was ist dran.
- **Ein Agent zur Zeit**, ein Werkzeug. Nächstes Feature erst, wenn das
  vorige fertig ist.
- **Standardlösungen vor Eigenbau:** NavMesh, Splines, Cinemachine,
  Physik-Fahrzeug, Asset-Store-Pakete. Eigenbau nur mit Begründung in STATUS.md.

## Phase 3 — Reihenfolge des Neubaus

1. Terrain (ganze Karte) + Straßen
2. Ein Auto fahrbar, Verfolgerkamera
3. Stadt und Dörfer als importierte GLBs
4. Fußgänger auf NavMesh
5. Menü und HUD
6. Rennen, KI-Gegner
7. Tuning, Shop, Wirtschaft
8. Ton
9. CrazyGames-SDK
10. Web-Optimierung (Downloadgröße, Handy, Chromebook)

Nach Schritt 2 und nach Schritt 5 jeweils ein Web-Build auf dem Handy — damit
eine Browser-Grenze nicht erst am Ende auffällt.
