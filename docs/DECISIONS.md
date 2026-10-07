# Entscheidungen

> Eine Zeile Entscheidung, ein paar Zeilen Warum, verworfene Alternativen.
> Neue Entscheidungen unten anhängen. Wird eine Entscheidung umgeworfen: nicht
> löschen, sondern als **ersetzt durch Dxx** markieren.

## D01 — Engine: Unity 6 (URP) statt Three.js · 2026-10-07

**Warum:** Der Prototyp (≈ 95 000 Zeilen TypeScript in 10 Wochen) hat rund ein
Drittel seines Codes in Dinge gesteckt, die eine Engine mitbringt — Physik und
Kollision (≈ 8 200 Zeilen, Quelle der meisten Bugs), Renderweg, Shader,
Vegetations-Streaming, Kamera, Debug-Werkzeuge. Ein Probelauf (ein Agent, eine
Sitzung, Unity-MCP + Blender-MCP) hat in kurzer Zeit eine stimmige Szene mit
eigenen Assets und Menü gebaut. Unity bringt außerdem Asset Store, NavMesh,
Splines, Cinemachine, Terrain, ein offizielles CrazyGames-SDK.

**Verworfen:**
- *Three.js weiter (aufgeräumt, + Rapier/Jolt):* kleinster Download, schnellste
  Schleife — aber das Eigenbau-Muster bleibt, und Optik hängt an selbst
  gebauten Systemen.
- *Babylon.js:* Web-nativ mit Havok-Physik, aber kein vollwertiger Editor,
  kein Asset Store, keine Gelände-/Straßenwerkzeuge.
- *Godot:* im Web nur der einfache Renderer, kein C# im Web, großer Grunddownload.
- *Unreal:* kein Web-Export.
- *PlayCanvas:* Web-nativ mit offiziellem MCP, aber schwache Physik, Projekt im Cloud-Editor.

**Preis, bewusst akzeptiert:** größerer Download (Handy-Startseite ≤ 20 MB wird
Arbeit, siehe D04), langsamere Schleife (Kompilieren, Web-Build in Minuten),
iOS-Risiko (CrazyGames schaltet Unity-Spiele auf iOS zunächst ab).

## D02 — Plattform: Browser zuerst (CrazyGames), Steam später optional · 2026-10-07

**Warum:** Spieler kommen über die Plattform, ohne Marketing; Einnahmen über
Werbung (60 % Anteil). Auf Steam konkurriert ein Japan-Open-World-Fahrspiel
direkt mit *Forza Horizon 6* (Japan, seit 19.05.2026), *Tokyo Xtreme Racer* und
*JDM: Japanese Drift Master*; der Median-Umsatz eines Indie-Spiels dort ist
gering. Unity kann später ohne Neubau auch für Desktop bauen.

## D03 — Unity-Projekt liegt im Repo-Wurzelordner, Prototyp unter `legacy/threejs/` · 2026-10-07

**Warum:** Ein Repo, ein Pull. Agenten finden die Unity-Standardstruktur dort,
wo sie sie erwarten. Der Prototyp bleibt lesbar (Verhalten, Zahlen, Lagen) und
lauffähig (für den GLB-Export der Orte), bis er nicht mehr gebraucht wird.
Seine 48 000-Token-`CLAUDE.md` heißt dort `WORKFLOW-LEGACY.md`, damit sie
nicht automatisch geladen wird.

## D04 — Startdownload über Addressables klein halten · 2026-10-07

**Warum:** CrazyGames misst den Startdownload bis zum ersten `gameplayStart`.
Für die Handy-Startseite gilt ≤ 20 MB. Darum von Anfang an: kleiner Boot,
Startgebiet zuerst, Rest der Welt im Hintergrund nachladen. Das muss die
Architektur ab Phase 1 erlauben, nicht erst in Phase 10.

## D05 — Oberfläche mit UI Toolkit · 2026-10-07

**Warum:** UXML/USS sind Textdateien nach dem Vorbild von HTML/CSS — für einen
Agenten lesbar, änderbar und vergleichbar, anders als uGUI-Prefabs mit
Objekthierarchien im Szenen-YAML. Der Prototyp hatte seine Oberfläche bereits
in DOM/CSS. *Prüfen in Phase 1/9:* Leistung und Touch auf dem Handy im Web.

## D06 — Sprache: Code Englisch, Doku Deutsch, Spiel Englisch · 2026-10-07

**Warum:** Unity-Ökosystem, Asset Store und Trainingsdaten sind Englisch; der
Eigentümer liest Deutsch; das Publikum ist international.

## D07 — Binärdateien über Git LFS · 2026-10-07

**Warum:** Modelle, Texturen, Ton und `.blend`-Dateien blähen Git sonst auf.
Regeln in `.gitattributes`, nur für `Assets/` und `ArtSource/` (der Prototyp
bleibt unberührt). **Achtung Kontingent:** GitHub-LFS hat ein Speicher- und
Bandbreitenlimit — Größe von `Assets/` im Blick behalten, Rohquellen > 50 MB
nicht einchecken.

## D08 — Agenten verbessern ihren Arbeitsablauf selbst · 2026-10-07

**Warum:** Der Prototyp hat Fehlerlehren als Geschichten in einer immer
längeren `CLAUDE.md` gesammelt (am Ende 48 000 Tokens, bei jedem Start
geladen) — Wissen, das niemand mehr lesen konnte. Neu: jede Lehre wird zu einer
**Vorkehrung** (Test > Werkzeug > Skill > Regel), mit einer Zeile in
`docs/LESSONS.md`; `CLAUDE.md` hat ein festes Budget von 150 Zeilen.

## D09 — Pakete in Phase 1 · 2026-10-07

Jedes Paket mit einem Satz Begründung. Neues Paket = neue Zeile hier.

| Paket | Version | Warum |
|---|---|---|
| URP | 17.6.0 | Renderweg für Web und Handy; Qualitätsstufen als URP-Assets |
| Input System | 1.20.1 | Tastatur, Gamepad und Touch über einen Weg; altes Input ist abgeschaltet |
| Cinemachine | 3.1.7 | Verfolger- und Fotokamera ohne Eigenbau (Phase 3/9) |
| Splines | 2.9.1 | Straßen aus `roads.json` als Splines (Phase 2) |
| AI Navigation | 2.0.15 | NavMesh für Fußgänger und Verkehr (Phase 6) |
| Addressables | 4.1.1 | Welt nachladen statt im Startpaket (D04) |
| Test Framework | 1.8.0 | EditMode-/PlayMode-Tests für `Tools/verify` |
| MCP for Unity (CoplayDev) | Git `main` | Agent steuert den offenen Editor; Stand im `packages-lock.json` festgehalten |
| Rider / Visual Studio | — | nur Editor, kostet im Build nichts |

**Entfernt** aus der URP-Vorlage: Visual Scripting, Collab, Timeline und die
Module XR, Tilemap, 2D-Physik, Cloth, Video, Vector Graphics, Adaptive
Performance, Android JNI, Analytics. Was ein Paket davon wieder braucht, holt
der Paketmanager als Abhängigkeit nach.

## D10 — Domain Reload beim Play aus · 2026-10-07

**Warum:** gemessen mit `node Tools/measure-loop.mjs`: Play-Eintritt 1,17 / 1,19 s
mit Domain Reload, 0,11 / 0,07 s ohne. **Preis:** statische Felder überleben
zwischen zwei Play-Sitzungen. Jede Klasse mit statischem Zustand setzt ihn in
einer `[RuntimeInitializeOnLoadMethod(SubsystemRegistration)]`-Methode zurück
(Vorbild: `Bootstrapper.ResetStatics`).

## D11 — Agenten-Werkzeuge in Node, Logik in C# · 2026-10-07

**Warum:** Die Werkzeuge unter `Tools/` müssen auf macOS und Windows laufen
(das Projekt hat schon einmal den Rechner gewechselt); Node ≥ 22 ist ohnehin
da. Was Unity-Wissen braucht (Bild rendern, bauen, Einstellungen), steckt in
Editor-Skripten unter `Assets/_Project/Editor/` und ist damit auch über den MCP
und das Menü erreichbar — die Node-Skripte starten nur, warten und fassen das
Ergebnis in einer Zeile zusammen.

## D12 — Entwickler-Overlay mit IMGUI, nicht UI Toolkit · 2026-10-07

**Warum:** Das F1-Overlay (`StatsOverlay`) existiert nur im Editor und in
Development-Builds; IMGUI braucht dafür kein Asset und keine Panel-Settings.
D05 (UI Toolkit) gilt für alles, was ein Spieler sieht.

## D13 — Terrain als eine Kachel (3 km, 2049²), GPU-Instancing an · 2026-10-07

**Warum:** gemessen mit `ViewpointBench` an sechs Blickpunkten (Editor, M4, Stufe Hoch):
Draw Calls 43–59 bei 1 Kachel, 43–105 bei 2 × 2, 63–198 bei 4 × 4; Dreiecke in
allen Fällen gleich (100 k–1,3 M). Kacheln brächten nur Streaming, und die
Höhendaten sind 8 MB. Ohne Instancing 200–2 550 Draw Calls → Instancing bleibt an
(im Web-Build geprüft: sichtbar, 0 Fehler). `pixelError` 5; 10 halbiert die
Dreiecke (57–587 k) → Kandidat für die Stufe Niedrig (Phase 10).
Regler: `Data/Map/MapImportSettings.asset`.

## Offen (in der genannten Phase entscheiden)

- **Fahrphysik-Ansatz** (Phase 3): eigene Raycast-Federung + Arcade-Modell auf
  PhysX-Rigidbody (Empfehlung) vs. WheelCollider vs. Asset-Store-Paket.
- **Unity-Version:** 6.6 (wie im Probelauf) oder auf die nächste LTS (6.7) gehen,
  sobald verfügbar (Phase 1 oder 10).
- **Spielname:** Arbeitstitel „japanMap"; der Probelauf schlug „Ameagari" vor.
