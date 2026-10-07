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
2. **Tests** der betroffenen Module (EditMode zuerst, schnell; PlayMode für
   Laufzeitverhalten). Neue Logik bekommt einen Test, Bugfixes einen Test,
   der vorher rot war.
3. **Bild** bei allem Sichtbaren: von einem festen Blickpunkt (ab Phase 2),
   klein (≈ 1024 px), und **ansehen** — Zahlen allein haben im Prototyp
   mehrfach grobe Fehler durchgelassen.
4. **Play-Modus-Konsole** nach ein paar Sekunden Laufzeit: Fehler, die erst
   zur Laufzeit kommen (NullReference, fehlende Referenzen).
5. Bei Leistungsfragen: Debug-Overlay / Profiler am Blickpunkt, Vorher und
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

- Nach dem Anlegen/Umbenennen von Skripten erst Kompilierung abwarten, bevor
  Komponenten hinzugefügt werden — sonst „script class not found".
- `.meta`-Dateien gehören zum Asset; nie einzeln löschen.
- Mit abgeschaltetem Domain Reload bleiben statische Felder zwischen
  Play-Sitzungen erhalten → statische Zustände explizit zurücksetzen.

- **Batchmode-PlayMode rendert nicht:** Render-Zähler (Draw Calls, Dreiecke)
  sind dort 0. Zahlen dazu nur im offenen Editor oder im Web-Dev-Build ablesen.
- **Der Unity-MCP verbindet sich nur beim Start einer Claude-Sitzung.** Startet
  der Editor später, ist er für diese Sitzung nur per HTTP erreichbar
  (`POST http://127.0.0.1:8080/mcp`, JSON-RPC: `initialize` → Header
  `mcp-session-id` → `tools/call`). Der Server startet mit dem Editor (~25 s).
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
