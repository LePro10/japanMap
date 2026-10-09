# japanMap — Arbeitsanleitung für Agenten

Open-World-Fahrspiel in Japan („Blaue Stunde nach Regen"), gebaut in
**Unity 6 (URP)**, Ziel **Browser / CrazyGames** (Desktop + Handy).
Der Mensch, dem das Projekt gehört, schreibt keinen Code und klickt nicht im
Editor — alles läuft über Agenten. Er spricht Deutsch; erkläre einfach.

**Diese Datei bleibt unter 150 Zeilen.** Details stehen in Skills und `docs/`.

## Sitzungsablauf

1. **Start:** [docs/STATUS.md](docs/STATUS.md) lesen, dann **nur** den
   Abschnitt der aktuellen Phase in [docs/PLAN.md](docs/PLAN.md).
2. **Arbeiten:** eine Aufgabe nach der anderen. Nach jeder Änderung prüfen
   (Skill `unity-verify`). Nach jeder fertigen Aufgabe: STATUS.md abhaken,
   committen.
3. **Ende:** STATUS.md aktualisieren (wo stehen wir, was ist als Nächstes
   dran, was muss der Mensch tun), Skill `retro`, commit. Push nur, wenn der
   Mensch es sagt.
4. **Phasenende:** Skill `phase-gate`.

## Repo-Karte

| Pfad | Inhalt |
|---|---|
| `Assets/_Project/` | Alles Eigene: `Scripts/<Modul>/`, `Art/`, `Data/` (ScriptableObjects), `Prefabs/`, `Scenes/`, `Editor/`, `Tests/` |
| `Assets/ThirdParty/` | Fremd-Assets, unverändert; Lizenzen in `LICENSES.md` dort |
| `Packages/`, `ProjectSettings/` | Unity — committen |
| `SourceData/legacy/` | Kartendaten aus dem Prototyp (nur lesen, README dort: **Achsen!**) |
| `ArtSource/` | Blender-Quellen und Generator-Skripte für Assets |
| `Tools/` | Kommandozeilen-Werkzeuge für Agenten (ab Phase 1) |
| `Captures/`, `Builds/` | Bilder und Builds — nicht im Git |
| `docs/` | PLAN, STATUS, DECISIONS, LESSONS, CONTEXT, LEGACY-MAP, SETUP, ART-DIRECTION |
| `legacy/threejs/` | Alter Three.js-Prototyp. **Nur lesen.** Einstieg: [docs/LEGACY-MAP.md](docs/LEGACY-MAP.md) |

Module (je eine `.asmdef`, Namespace `JapanMap.<Modul>`): `Core`, `World`,
`Vehicles`, `OnFoot`, `Gameplay`, `UI`, `Audio`, `Platform`, `DevTools`;
dazu `Editor` und `Tests`. Abhängigkeiten nur nach unten zu `Core`.

## Befehle

Alle einmal ausgeführt (2026-10-07). Einrichtung einmalig: `cd Tools && npm install
&& npx playwright install chromium-headless-shell`.

| Zweck | Editor **zu** (Batchmode) | Editor **offen** (Unity-MCP) |
|---|---|---|
| Prüfen: kompilieren, EditMode + PlayMode | `node Tools/verify.mjs` (`--edit` nur EditMode) — eine Zeile GREEN/RED, ~15 s | `node Tools/unity-test.mjs EditMode\|PlayMode [Gruppe]`; C# ausführen: `node Tools/unity-exec.mjs datei.cs` |
| Bild der Main Camera → `Captures/` | `node Tools/capture.mjs [--scene … --out …]`, `--viewpoint <name\|all>` | `execute_menu_item` „JapanMap/Capture Main Camera"; `ViewpointTools.Capture("pass")`; **echtes Spiel mit Tasten:** `node Tools/play.mjs <ordner> "<skript>"` |
| Web-Build + `Builds/Web/size-report.txt` | `node Tools/build-web.mjs` (`--dev` mit F1-Overlay) | Menü „JapanMap/Build Web (Release)" |
| Rauchprobe im Headless-Chrome; ausliefern | `node Tools/smoke.mjs` (baut nicht); `--gpu` = echte GPU + FPS, `--quality Low`; Speichern im Browser: `node Tools/save-web.mjs`; `node Tools/serve-web.mjs` → Port **8090** (Handy: `--lan`; Mensch spielt nebenher: `--preview`, 8092; 8091 = Rauchprobe) | — |
| Karte/Look/Modelle neu importieren | `node Tools/unity-run.mjs <Klasse.Methode>` | Menüs „JapanMap/Map/Import All“, „Look/Apply“, „Art/Import Library“, „Art/Build Showroom“ |
| Bilder nebeneinander (alt/neu) | `node Tools/montage.mjs --out Captures/x.png a.png b.png …` | `node Tools/views.mjs <ordner> <name> <blickpunkt…>`; Nahbild: `node Tools/look.mjs` |
| Draw Calls/Dreiecke je Blickpunkt (Editor offen) | — | `node Tools/bench.mjs <label> <blickpunkte>` (Hoch + Niedrig) |
| Orte aus dem Prototyp exportieren / bauen | `node Tools/export-places.mjs [ort]` | Menü „JapanMap/Places/Import All" |
| Arbeitsschleife messen | `node Tools/measure-loop.mjs` | — |
| Einstellungen erzwingen | `-executeMethod JapanMap.Editor.ProjectSetup.Apply` | Menü „JapanMap/Setup/Apply Project Settings" |

Die Batch-Werkzeuge melden `BLOCKED` (Exit 2), wenn der Editor das Projekt
offen hat — dann den MCP nehmen, nicht den Editor schließen, ohne zu fragen.
Play immer aus `Boot.unity` starten (sie startet die Systeme). Port 8080 gehört
dem Unity-MCP. Der MCP verbindet sich nur beim Start einer Claude-Sitzung.

## Regeln

1. **Was nicht gemessen wurde, gilt als nicht erledigt.** Ergebnis melden,
   nicht Absicht. Ungeprüftes ausdrücklich als ungeprüft benennen.
2. **Zahl *und* Bild.** Bei allem Sichtbaren ein Bild machen und ansehen.
   Vorher/Nachher immer vom selben Blickpunkt.
3. **Standard vor Eigenbau.** Erst Unity-Funktion oder Paket (Physik,
   NavMesh, Splines, Cinemachine, Terrain, UI Toolkit), dann Asset Store, erst
   dann eigener Code — mit einem Satz Begründung in DECISIONS.md.
4. **Daten statt Zahlen im Code.** Einstellwerte in ScriptableObjects unter
   `Data/`, nicht als Konstanten verstreut. Ein Regler, dessen Wirkung nie
   gemessen wurde (Wert verdoppeln / auf null → ändert sich etwas?), ist tot.
5. **Ein Regler je Messung.** Bei Optik- oder Fahrproblemen erst Ursachen
   trennen (Teil abschalten, messen), dann drehen.
6. **Echte Wege testen.** Zustand nicht von Hand setzen, sondern über den Weg,
   den das Spiel geht (Menü über Knopf, Auto über Spawn). Ein von Hand
   gesetzter Zustand existiert im Betrieb nicht.
7. **Ein Fehler ist eine Klasse.** Wer einen findet, sucht dieselbe Ursache
   im ganzen Projekt, bevor er weitergeht.
8. **Szenen und Prefabs über Editor/MCP ändern**, nicht durch Bearbeiten des
   YAML — außer bei trivialen Werten. `.meta`-Dateien immer mit ihrem Asset
   committen, nie einzeln löschen oder umbenennen.
9. **Code und Code-Kommentare Englisch, Doku Deutsch.** Kommentare erklären
   das *Warum*, kurz.
10. **Spieltexte Englisch** (internationales Publikum).
11. **Nicht im Legacy-Ordner arbeiten.** Verhalten portieren, nicht Code
    abschreiben. `legacy/threejs/WORKFLOW-LEGACY.md` nie ganz laden (48 000
    Tokens) — gezielt suchen.
12. **Leistung zählt ab Tag 1.** Budgets in docs/PLAN.md; nach größeren
    Änderungen Web-Build bauen und Größe/FPS notieren.
13. **Ein Agent zur Zeit in Unity.** Einzige Ausnahme: der Asset-Sprint
    (PLAN.md) in einer zweiten Sitzung, nur in `ArtSource/` und Blender,
    Commits nur mit eigenen Dateien. Subagenten für Recherche sind ok.
    Darum committet **jede** Sitzung nur ihre eigenen Pfade (`git add <pfad>`,
    nie `-A`/`commit -a`) und liest vor einem DECISIONS-Eintrag die höchste
    Nummer neu.

14. **Mitdenken und gleich verbessern.** Bei Bug oder Unschönem die Ursache
    suchen. Klein: sofort beheben, prüfen, im Commit nennen. Größer: unter
    „Gefunden" in STATUS.md, bei der Aufgabe bleiben. Verbesserungen vorschlagen.
15. **Wiedererkennbar bleiben, aber besser machen.** Karte, Orte, Strecken,
    Autos und Spielregeln sollen wiedererkennbar sein. Kleine Verbesserungen
    darfst du selbst machen, wenn sie das Spiel für CrazyGames besser machen
    (schönere Kurve, Prop versetzt, leere Fläche gefüllt, hässliche Stelle
    geglättet) — Begründung im Commit. Große Änderungen (Ort verlegen, Straße
    entfernen, Regel ändern) nur mit Zustimmung und Eintrag in DECISIONS.md.

16. **Was der Mensch einmal korrigiert, muss er nie wieder sagen.** Jede
    Rückmeldung wird in derselben Sitzung festgeschrieben (Skill, Kit, Test);
    Freigegebenes ist der neue Maßstab.

## Sich selbst verbessern — Pflicht, nicht Kür

Jeder Fehler, jede Sackgasse und jeder langsame Arbeitsschritt wird zu einer
**Vorkehrung**, damit er nicht wieder passiert (Skill `retro`). Reihenfolge,
von stark nach schwach:

1. automatischer Test / Prüfung im Importer / Editor-Validierung,
2. Werkzeug oder Skript, das den Schritt übernimmt,
3. Skill anpassen (`.claude/skills/`),
4. Regel hier in CLAUDE.md — nur wenn sie überall gilt und das Budget
   von 150 Zeilen hält; sonst lieber eine alte Regel zusammenfassen.

Jede Vorkehrung bekommt eine Zeile in [docs/LESSONS.md](docs/LESSONS.md).
Du darfst und sollst CLAUDE.md, Skills, Werkzeuge und Tests ändern, wenn das
die Arbeit verbessert — mit Begründung im Commit. Keine Geschichten in
CLAUDE.md: Geschichte gehört in `git log`.

## Der Mensch

- Braucht der Mensch etwas zu tun (installieren, anmelden, Fahrgefühl
  prüfen, Handy testen, Kauf im Asset Store), sammle es gebündelt in
  STATUS.md unter „Für dich" — mit genauer Anleitung — statt mittendrin zu
  fragen. Nur bei echten Blockaden sofort fragen.
- Ein Durchlauf darf das Kontingent nicht sinnlos fressen: Bilder klein
  halten (≈ 512–1024 px), keine Endlosschleifen — nach drei Fehlversuchen
  notieren und anders angehen.
- Rechner des Menschen: Leistung nur grob prüfen; nie zwei Spiel-Instanzen
  gleichzeitig rendern (der PC ist dabei einmal abgestürzt).

## Werkzeuge

- **Unity-MCP**: Szene, Objekte, Skripte, Konsole, Play, Tests, Builds.
  Zuerst die verfügbaren Tools auflisten, nicht Namen raten.
- **Blender-MCP**: Assets per Python (`bpy`) bauen, `look` zum Prüfen. Keine
  kostenpflichtige Generierung ohne Zustimmung des Menschen.
- **CLI**: git (mit LFS), Node für Hilfsskripte, Unity im Batchmode.
