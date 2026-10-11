---
name: unity-verify
description: How to check that a Unity change actually works - compile, console, tests, screenshots - and how to check the environment. Use after every code, scene, prefab or asset change, before saying something is done, and at the start of Phase 1.
---

# Prüfen in Unity

„Fertig" heißt: kompiliert, Konsole ohne Fehler, Tests grün, und bei allem
Sichtbaren ein Bild angesehen. Ungeprüftes wird als ungeprüft gemeldet.

## Zwei Wege — je nachdem, ob der Editor offen ist

| Editor zu | Editor offen |
|---|---|
| `node Tools/verify.mjs` → eine Zeile GREEN/RED (Kompilierfehler, fehlgeschlagene Tests, verwaiste `.meta`) | MCP: `refresh_unity` (compile) → `read_console` (error, warning) → `run_tests` + `get_test_job` |
| `node Tools/capture.mjs` | MCP: `manage_scene` load → `execute_menu_item` „JapanMap/Capture Main Camera" |

Batchmode auf ein offenes Projekt scheitert (Sperre); die Werkzeuge melden
dann `BLOCKED` (Exit 2). Nicht den Editor schließen, ohne den Menschen zu
fragen — es sei denn, der Agent hat ihn selbst geöffnet.

## Reihenfolge nach einer Änderung

1. **Kompilieren abwarten**, dann Konsole lesen: 0 Fehler. Warnungen aus
   eigenem Code ernst nehmen.
2. **Testzahl** mit `Tools/test-count.json` vergleichen (über den MCP von
   Hand, `verify.mjs` tut es selbst): weniger Tests als dort = ein Test ist
   verloren gegangen, RED. Mehr: Datei hochsetzen.
3. **Tests** der betroffenen Module (EditMode zuerst, schnell; PlayMode für
   Laufzeitverhalten). Neue Logik bekommt einen Test, Bugfixes einen Test,
   der vorher rot war.
4. **Bild** bei allem Sichtbaren: von einem festen Blickpunkt (ab Phase 2),
   klein (≈ 1024 px), und **ansehen** — Zahlen allein haben im Prototyp
   mehrfach grobe Fehler durchgelassen.
5. **Play-Modus-Konsole** nach ein paar Sekunden Laufzeit: Fehler, die erst
   zur Laufzeit kommen (NullReference, fehlende Referenzen).
6. Bei Leistungsfragen: Debug-Overlay / Profiler am Blickpunkt, Vorher und
   Nachher am **selben** Ort.

## Umgebung prüfen (Beginn Phase 1 und nach Rechnerwechsel)

- Unity-Version (`ProjectSettings/ProjectVersion.txt`) und Editor-Pfad: macOS
  `/Applications/Unity/Hub/Editor/<v>/Unity.app/Contents/MacOS/Unity`, Windows
  `C:/Program Files/Unity/Hub/Editor/<v>/Editor/Unity.exe` (Überschreiben:
  `UNITY_EDITOR`). Web-Modul: `<v>/PlaybackEngines/WebGLSupport`.
- `git lfs version` funktioniert, `git lfs install` wurde ausgeführt.
- Unity-MCP antwortet (Tools auflisten), Blender-MCP antwortet
  (`get_addon_status`).
- Grafikkarte notieren (Leistungsangaben gelten nur für diesen Rechner).

Fehlt etwas: genaue Anleitung in STATUS.md „Für dich", dann stoppen.

## Bekannte Fallen
- **Gegenversuch mit altem Code nie per `git checkout <rev> -- <ordner>`**, solange ungesicherte Änderungen darin
  liegen — das Zurückholen mit `git checkout HEAD` löscht sie (Phase 11: ein frischer Test ging so verloren und der
  nächste Commit behauptete ihn). Vorher committen oder `git stash`; danach `git status` gegen die Erwartung prüfen.

- **Editor hängt / MCP antwortet nicht** („Unknown tool“, `{success:false}`, 0 % CPU): **nicht fragen, nicht warten** —
  `node Tools/editor-restart.mjs` (verweigert nur im Play-Modus; beendet Editor + MCP-Server, öffnet neu, wartet bis
  der MCP Code ausführt). Der Mensch ist oft weg und sieht Fragen nicht.
- **Nie offene Szenen per git zurücksetzen** (`git checkout -- Assets/.../Scenes`): Unity zeigt dann einen modalen
  „modified externally“-Dialog und blockiert alles. Vorher per MCP eine leere Szene öffnen
  (`EditorSceneManager.NewScene(NewSceneSetup.EmptyScene)`), dann zurücksetzen, dann `refresh_unity`.
- **EditMode-Tests schreiben Szenen neu** (`ImportAll_TwiceGivesIdenticalMap` u. a.): danach sind ~63 Szenen/NavMeshes
  „geändert“ (gleicher Inhalt, andere Reihenfolge). Nicht mitcommitten — nur eigene Pfade `git add`.

- Nach dem Anlegen/Umbenennen von Skripten erst Kompilierung abwarten, bevor
  Komponenten hinzugefügt werden — sonst „script class not found".
- `.meta`-Dateien gehören zum Asset; nie einzeln löschen.
- Mit abgeschaltetem Domain Reload bleiben statische Felder zwischen
  Play-Sitzungen erhalten → statische Zustände explizit zurücksetzen.

- **Batchmode-PlayMode rendert nicht:** Render-Zähler (Draw Calls, Dreiecke)
  sind dort 0. Zahlen dazu nur im offenen Editor oder im Web-Dev-Build ablesen.
- **Der Unity-MCP verbindet sich nur beim Start einer Claude-Sitzung.** Startet
  der Editor später, ist er für diese Sitzung nur per HTTP erreichbar:
  `node Tools/mcp-call.mjs <tool> '<json>'` (z. B. `refresh_unity`,
  `run_tests` + `get_test_job`, `execute_code`; `list` zeigt alle). Der Server
  startet mit dem Editor (~25 s). Fehlermeldungen von `get_test_job` enthalten
  Zeilenumbrüche → in Python `json.loads(..., strict=False)`.
- **Einen selbst gestarteten Editor schließen:** AppleScript `quit` greift
  nicht; `kill -TERM <pid>` beendet ihn sauber in ~2 s. **Danach auch den
  MCP-Server beenden** (`lsof -nP -iTCP:8080 -sTCP:LISTEN`, Prozesse
  `mcp-for-unity`): Er überlebt den Editor, und ein später geöffneter Editor
  meldet sich dann nicht an ("0 verbundene Editoren"). Abhilfe: verwaisten
  Server beenden, im Fenster "MCP for Unity" "Start Server" drücken.
- **Projektname-Kollisionen:** Unity hat eigene Typen wie
  `UnityEngine.Rendering.DebugOverlay` — eigene Klassen eindeutig benennen.

- **Generierte Meshes nie mit `EditorUtility.CopySerialized` überschreiben:** die
  Daten stimmen danach, gezeichnet wird bis zum Neustart das alte Mesh.
  Immer `JapanMap.Editor.Map.MeshAssets.Save`. Allgemein: wenn Zahl und Bild
  sich widersprechen, einen Testwürfel neben das fehlende Objekt stellen —
  so trennt man „nicht da" von „nicht gezeichnet".
- **`UnityStats` liest im Editor nur das letzte Game-View-Bild**, nicht ein
  `camera.Render()`. Render-Zahlen je Blickpunkt: `ViewpointBench`.

(Ergänzen, sobald neue Fallen auftauchen — Skill `retro`.)

- **Werkzeuge bei offenem Editor:** `node Tools/unity-test.mjs EditMode [Gruppe]`
  (wartet, prüft vorher Kompilierfehler), `node Tools/unity-exec.mjs datei.cs`
  (C#-Methodenrumpf, `return` liefert das Ergebnis). `AssetDatabase.DeleteAsset`
  blockt der MCP → Datei + `.meta` per `git rm`, dann `refresh_unity`. Lange
  Aufrufe (Web-Build) melden `success:false`, laufen aber weiter → auf die
  Ausgabedatei warten. Editor-Log: `Logs/Editor.log` (nicht `~/Library/Logs`).
- **Tastatur-Tests:** virtuelle Tastatur nur mit `InputSystem.settings.backgroundBehavior = IgnoreFocus`
  und `editorInputBehaviorInPlayMode = AllDeviceInputAlwaysGoesToGameView` (in SetUp setzen, in TearDown
  zurück) — sonst rot, sobald Unity nicht das vordere Fenster ist (und im Batchmodus).
- **Spielabläufe:** `node Tools/play.mjs <ordner> "<skript>"` (Tasten, Bilder, `probe`, `stats`, `place x z`,
  `view <blickpunkt>`, `tier Low`; Spielinhalt: `screen` (Bild **mit HUD**), `drive x z yaw` (Auto dort, Spieler drin),
  `aim x z` (lenkt per A/D auf einen Punkt), `orbit x z r` (Kreis), `pace kmh`, `waitstunt`, `race <id> [auto]`, `timescale 4`;
  Fortschritt: eigener frischer Speicherplatz je Lauf (`keepsave` als erster Befehl = Neustart-Test), `sparks n`, `garage pick/buy/fit Engine 2/paint Navy/close`; `probe` meldet Drift, Region,
  Entdeckung, Stunt, Rennteilnehmer). **Leben folgt dem Spieler, nicht der Kamera:** Fußgänger, Verkehr und
  Akteure erscheinen nur um die Figur. `ViewpointBench` misst sie deshalb nur in Sakura (Start); Kosten an
  einem anderen Ort: `play.mjs "place x z; wait 20; stats; crowd off; wait 1; stats"`. `view` nimmt die Figur mit.
- **ViewpointBench** schaltet Cinemachine/CarCameraRig ab — sonst misst jeder
  Blickpunkt das Auto-Bild. Gleiche Zahlen an allen Blickpunkten = Messfehler.
- **Offene Punkte aus STATUS erst ansehen, dann bauen:** „Hochstraße ohne Brüstungen" war längst erledigt
  (Leitplanken auf allen 204 Viadukt-Rändern) — ein Nahbild (`node Tools/look.mjs`) spart die Arbeit.
- **Werkzeuge kompilieren selbst:** `unity-exec`/`unity-test` lassen Unity vorher geänderte Skripte
  übersetzen (`Tools/lib/fresh.mjs`) — außer im Play-Modus (dann bleibt alter Code, Hinweis beachten).
- **Bench je Ort:** `node Tools/bench.mjs <label> <blickpunkte>` misst Hoch und Niedrig in einem Lauf.
  Für Versuche („Schatten aus") das geänderte Asset `EditorUtility.SetDirty` + `AssetDatabase.SaveAssets`
  — sonst lädt Play die alte Fassung, und der Versuch misst nichts (gleiche Zahlen bis zur letzten Stelle).
- **Spielstand in Tests:** jede PlayMode-Testklasse, die das Spiel startet, trägt `[FreshSave]` (eigener Speicher im
  Arbeitsspeicher; `SaveIsolationTests` prüft es). Einen gespeicherten Stand vor dem Start in `FreshSaveAttribute.Store` schreiben.
- **Stufen messen:** Editor `QualitySystem.SetTier("Low")` + `TerrainQuality.Apply`;
  Browser `node Tools/smoke.mjs --gpu --quality Low`.

- **Test hängt bei Zeit 0:** Unitys Test-Zeitlimit zählt Spielzeit — ein Test, der ein Menü/den Fotomodus offen lässt,
  wartet ewig. `unity-test.mjs` bricht nach 60 s Pause ab und nennt die offene Seite. In Tests `WaitForSecondsRealtime`
  nehmen, wo das Spiel pausiert sein kann.
- **`Screen.*` in einem Editor-Callback** (PlayScript, `EditorApplication.update`) ist das Editorfenster, nicht die
  Spielansicht — für UI-Koordinaten `UiPanel.Size`/`UiPanel.Scale` nehmen.
- **Nach einem Import** (Vegetation, Karte) `git status` auf die erwarteten Assets prüfen: ungespeichert = beim nächsten
  Play/Reload verloren (Phase 9: Grastest erst nach `AssetDatabase.SaveAssets` grün).
- **Kein Werkzeug hinter einem anderen in derselben Hintergrund-Kette** (`compile … ; unity-test …`): bricht das erste ab,
  startet das zweite unbemerkt und ließ einmal den Editor im Play-Modus zurück.

- **Die Welt liegt in mehreren Szenen (ab Phase 10, D36):** Orte außer Sakura in `Scenes/Places/`, Straßenkacheln, Props,
  Orts-NavMeshes und Vegetation in `Scenes/World/`. Im Editor öffnen sie mit Game.unity (`PlaceScenesInEditor`); Code und
  Tests finden Teile mit `MapScene.Part(gruppe, kind)` / `Parts(gruppe)`, nicht `GameObject.Find("World/…")`. Play lädt sie
  per Addressables (Editor sofort, Browser nach gameplayStart). Wer Gruppen in Game.unity neu baut: am Ende
  `StreamingSetup.Apply()` (MapImport.ImportAll tut es). Autos haben `modelAsset` statt `model` (`CarModels.Get`).
- **Jede Komponente in einer Datei ihres Namens** — sonst speichert die Szene ein lokales Skript-Objekt (`ScriptFileTests`).
- **Qualitätsstufen vergleichen nur im Play-Modus** (`play.mjs "tier High; view <bp>; shot x"`): `TerrainQuality` (Gras, Bäume)
  greift im Edit-Modus nicht — `views.mjs` zeigte Grasdichte 0,6 und 1,0 gleich.
- **Editor zu?** Nur `Tools/lib` (`editorIsOpen`) entscheidet; `compile.mjs`/`unity-test.mjs` brauchen den offenen Editor und warten
  sonst. Bei geschlossenem Editor: `verify.mjs`, `build-web.mjs`, `unity-run.mjs` (Batchmode).
