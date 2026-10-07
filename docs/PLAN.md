# japanMap — Plan von A bis Z (Unity)

> Vom Three.js-Prototyp zu einem fertigen, optimierten Browser-Spiel in
> Unity. Ziel-Plattform: **CrazyGames** (Desktop + Handy), Steam später
> optional. Begründung aller Grundsatzentscheidungen: [DECISIONS.md](DECISIONS.md).
> Hintergrund (Analyse, Recherche, Probelauf): [CONTEXT.md](CONTEXT.md).

## So wird dieser Plan benutzt

- Der Mensch sagt **„Beginne mit Phase N"** (oder „mach weiter").
- Der Agent liest [STATUS.md](STATUS.md) und **nur den Abschnitt der aktuellen
  Phase** hier — nicht den ganzen Plan, nicht die Legacy-Doku.
- Er zerlegt die Phase in Aufgaben, arbeitet sie **nacheinander** ab, hakt sie
  in STATUS.md ab und committet nach jeder abgeschlossenen Aufgabe.
- Eine Phase darf mehrere Sitzungen dauern. STATUS.md ist das Gedächtnis
  zwischen den Sitzungen; dieser Plan bleibt dabei unverändert.
- Jede Phase endet mit dem **Phasen-Tor** (unten). Erst danach beginnt die
  nächste.
- Der Plan darf verbessert werden — aber als Änderung des Soll, nicht als
  Tagebuch. Geschichte gehört in `git log` und [LESSONS.md](LESSONS.md).

### Was „AAA-Qualität" hier heißt

Kein AAA-Budget, sondern ein AAA-**Anspruch** innerhalb der Browser-Grenzen:
stimmige Art Direction statt einzelner hübscher Teile, Licht und Atmosphäre
als Hauptträger der Optik, „Juice" (Kamera, Partikel, Ton, Rückmeldung) bei
jeder Spieleraktion, null Konsolenfehler, stabile Bildrate auf Mittelklasse-
Hardware, sauberes Menü. Maßstab: das beste 3D-Fahrspiel auf CrazyGames —
nicht Forza.

### Das Phasen-Tor (gilt für jede Phase)

1. **Abnahme** der Phase erfüllt — gemessen, nicht behauptet.
2. **Prüfschleife grün:** kompiliert, 0 Fehler in der Konsole, alle Tests grün.
3. **Web-Build** gebaut, Größe notiert, lädt im Browser (ab Phase 1).
4. **Bilder** von den festen Blickpunkten gemacht und angesehen (ab Phase 2).
5. **Hygiene:** STATUS.md aktuell, Doku widerspricht dem Code nicht,
   `CLAUDE.md` unter 150 Zeilen, tote Dateien/Skripte entfernt.
6. **Retro:** Was hat Zeit gekostet? Was ist schiefgegangen? Jede Erkenntnis
   wird zu einer Vorkehrung (Skill `retro`).
7. **Für den Menschen:** Liste dessen, was nur ein Mensch prüfen kann
   (Fahrgefühl, Optik, Ton, Handy) — mit genauer Anleitung, was zu tun ist.
8. Commit „Phase N abgeschlossen", Push nur nach Zustimmung.

---

## Phase 0 — Vorbereitung ✅ (2026-10-07)

Erledigt im Three.js-Repo: Prototyp nach `legacy/threejs/`, Kartendaten nach
`SourceData/legacy/`, Auto-Generatoren nach `ArtSource/cars/`, neue Doku,
Skills, `.gitignore`/`.gitattributes` für Unity. Kein Unity-Code.

---

## Phase 1 — Fundament: Projekt, Werkzeuge, Prüfschleife

**Ziel:** Ein leeres, sauber aufgesetztes Unity-Projekt, in dem ein Agent
ohne Handarbeit ändern, prüfen, Bilder machen und für das Web bauen kann. Diese
Phase entscheidet über das Arbeitstempo aller folgenden.

**Aufgaben**

1. **Umgebung prüfen** (Skill `unity-verify`, Abschnitt „Umgebung"): Unity-
   Version, Pfad zu `Unity.exe`, Web-Modul, Git LFS, Unity-MCP und
   Blender-MCP erreichbar. Was fehlt → Liste für den Menschen, dann stoppen.
2. **Projekt anlegen im Repo-Wurzelordner** (Unity-Projekt = Repo-Wurzel):
   aus der URP-Vorlage per CLI (`-createProject` + `-cloneFromTemplate` in
   einen Temp-Ordner, dann `Assets/`, `Packages/`, `ProjectSettings/`
   herüberholen) oder aus dem Probelauf-Projekt des Menschen (Pfad erfragen).
   Version exakt festhalten (`ProjectSettings/ProjectVersion.txt`).
3. **Projekteinstellungen:** Asset Serialization *Force Text*, Visible Meta
   Files, Input System (neues), Color Space Linear, Web als Build-Ziel,
   Enter-Play-Mode-Optionen (Domain Reload aus, wenn es Zeit spart — messen).
4. **Pakete:** URP, Input System, Cinemachine, Splines, AI Navigation,
   Addressables, Test Framework, UI Toolkit (eingebaut). Nur was gebraucht
   wird; jedes Paket mit einem Satz Begründung in DECISIONS.md.
5. **Ordnerstruktur und Assemblies** wie in `CLAUDE.md` beschrieben
   (`Assets/_Project/…`, eine `.asmdef` je Modul, Namespaces `JapanMap.*`).
6. **Werkzeuge für Agenten** (Editor-Skripte + Kommandozeile, alle in
   `CLAUDE.md` unter „Befehle" eintragen und **einmal ausprobieren**):
   - `Tools/verify` — Kompilieren + EditMode-/PlayMode-Tests + Konsole
     auswerten, Ergebnis als eine Zeile (grün/rot + Zahlen).
   - `Tools/capture` — Bild aus der Game-Kamera als PNG nach
     `Captures/` (auch ohne fokussiertes Fenster).
   - `Tools/build-web` — Web-Build per Batchmode, danach Größenbericht
     (gesamt, größte 10 Dateien) nach `Builds/Web/size-report.txt`.
   - `Tools/serve-web` + Rauchprobe: Build lokal ausliefern, in Headless-Chrome
     laden, Konsole mitlesen, Bild machen (Vorbild:
     `legacy/threejs/tools/smoke.mjs`).
   - Batchmode geht nicht, solange der Editor das Projekt offen hat → jedes
     Werkzeug kann auch über den Unity-MCP ausgelöst werden.
7. **Debug-Overlay im Spiel** (F1): FPS, Frame-ms, Draw-Calls, Dreiecke,
   Speicher (über `ProfilerRecorder`). Nur in Development-Builds.
8. **Boot-Szene + leere Spielszene**, Bootstrapper, der Systeme in fester
   Reihenfolge startet.
9. **Qualitätsstufen** als URP-Assets angelegt (Hoch / Mittel / Niedrig),
   noch ohne Feinschliff.
10. **Schleife messen:** eine kleine Änderung von Anfang bis Ende (Code →
    kompilieren → Test → Bild → Web-Build) und die Zeiten je Schritt in
    STATUS.md notieren. Langsame Schritte sofort verbessern.

**Abnahme**
- `Tools/verify` läuft und meldet grün; ein absichtlich kaputter Test macht
  es rot (Gegenprobe).
- Ein Bild aus `Tools/capture` liegt vor und zeigt die Szene.
- Web-Build lädt im Headless-Chrome ohne Konsolenfehler; Größe des leeren
  Builds notiert.
- `CLAUDE.md`-Befehle sind alle einmal ausgeführt worden.

**Nicht in dieser Phase:** Karte, Autos, Optik.

---

## Phase 2 — Die Karte

**Ziel:** Die bestehende Karte steht in Unity: Gelände, Wasser, Straßen,
Platzhalter für alle Props — maßstabsgetreu, reproduzierbar importiert.

**Eingaben:** `SourceData/legacy/` (README dort zuerst lesen — Achsen!).

**Aufgaben**
1. **Terrain-Importer** (Editor-Skript, erneut ausführbar): `height_2049.raw`
   → TerrainData, Größe/Position aus `terrain.json`. Danach `checkpoints.json`
   prüfen (Abweichung ≤ 0,1 m). Entscheiden und messen: eine Terrain-Kachel
   3 km oder 2 × 2 / 4 × 4 Kacheln (Draw-Calls, Web-Leistung).
2. **Splatmap** aus `zones.png` (Fels/Gras/Sand/Reisfeld) als Terrain-Layer;
   vorläufige Texturen aus `legacy/threejs/assets/textures/` (CC0).
3. **Wasser:** Meer auf Höhe 0, Reisfelder (Maske `paddy.png`, 0,30 m tief),
   Fluss aus `river.json`. Erst einfach, Optik in Phase 4.
4. **Straßen-Importer:** `roads.json` → Fahrbahn-Meshes entlang der
   Mittellinie (Breite, Querneigung je Punkt), Leitplanken aus `rails`.
   Kreuzungen sauber (Vorbild: `legacy/threejs/src/world/roads/`). Prüfen:
   Fahrbahn liegt auf dem eingeschnittenen Gelände (kein Schweben, kein
   Versinken — Stichproben je Straßentyp).
5. **Props-Importer:** `props.json` → Platzhalter-Prefabs je `id`, Höhe aus
   dem Terrain, Drehung nach Formel aus dem README — **erst an `templeHall`
   im Bild prüfen**, dann alle.
6. **Blickpunkte:** benannte Kamerapositionen (aus
   `legacy/threejs/src/debug/viewpoints.ts`, z gespiegelt) als Asset + Menü
   „Gehe zu" + `Tools/capture` je Blickpunkt. Ab jetzt wird jede Optik- oder
   Leistungsfrage an einem Blickpunkt beantwortet.
7. **Kollision:** Terrain-Collider, Straßen-Collider, einfache Collider für
   Props (Bäume, Wände, Felsen).

**Abnahme**
- Checkpoints ≤ 0,1 m; Bilder von mindestens 6 Blickpunkten (Pass, Stadt,
  Reisfeld, Küste, Tempel, Übersicht) neben die alten aus
  `legacy/threejs/screenshots/` gelegt — Lage stimmt.
- Importer zweimal laufen lassen → identisches Ergebnis.
- Web-Build mit ganzer Karte: Größe und FPS auf dem Rechner des Menschen
  notiert.

**Mensch prüft:** einmal durch die Karte fliegen — stimmt sie?

---

## Phase 3 — Fahren

**Ziel:** Ein Auto, das sich besser fährt als im Prototyp — und dann alle
zehn. Das Herz des Spiels.

**Eingaben:** Verhalten (nicht Code!) aus `legacy/threejs/src/game/arcadeDynamics.ts`,
`src/config/arcade.config.ts`, `vehicles.config.ts`; Messwerte und Proben aus
`legacy/threejs/tools/bench/arcade.mts`, `fleet.mts`; Autos aus
`legacy/threejs/car-lab/models/*.glb` (Hierarchie: `ArtSource/cars/README.legacy.md`).

**Aufgaben**
1. **Ansatz wählen und begründen** (DECISIONS.md): Rigidbody + Raycast-
   Federung + Arcade-Querkraftmodell (Empfehlung: PhysX übernimmt Kollision,
   die ~8 000 Zeilen Eigenbau-Kollision des Prototyps entfallen; das Arcade-
   Gefühl bleibt eine kleine eigene Schicht) gegen WheelCollider und
   gegen ein Asset-Store-Paket. Kurz prototypisch vergleichen, nicht raten.
2. **Ein Auto** (Kite S / Starter) fahrbar: Gas, Bremse, Lenkung,
   Handbremsen-Drift, Rückwärts, Nitro, Respawn auf nächste Straße.
3. **Eingabe:** Tastatur, Gamepad, Touch (Stick + Knöpfe) über Input System.
4. **Kameras:** Verfolger + Cockpit (Cinemachine), Zoom, Blick zurück.
5. **Prüfstände als PlayMode-Tests** (übertragen aus `legacy/.../tools/bench`):
   0–100 km/h, Endtempo, Bremsweg, Lenksymmetrie (rechts = −links),
   Ausrollen monoton fallend, Drift ohne Absicht bleibt aus, Handbremsdrift
   setzt ein, Hang 20° befahrbar, Landung aus 6 m ohne Einsinken, Auto klebt
   nicht an Wand/Planke.
6. **Alle zehn Autos** als Datensätze (ScriptableObjects) mit eigener
   Identität (Gewicht, Grip, Leistung, Lenkung) — Werte aus der Legacy-Konfig
   als Startpunkt.
7. **Fahrzeug-Optik:** Räder drehen/lenken/federn, Bremslichter,
   Reifenspuren, Staub/Wasser-Partikel (einfach; Feinschliff Phase 4/9).

**Abnahme:** alle Prüfstands-Tests grün für alle zehn Autos; Runde auf dem
Ring und Bergpass-Abfahrt ohne Hängenbleiben (automatisierte Fahrt entlang
der Mittellinie).

**Mensch prüft:** Fahrgefühl — Drift kontrollierbar? Offroad kein Sumpf?
Lenkung direkt genug? Das ist die wichtigste Mensch-Abnahme des Projekts;
Rückmeldung wird in Zahlen übersetzt und erneut gemessen.

---

## Phase 4 — Look und Asset-Pipeline

**Ziel:** Die Stimmung des Probelaufs auf der ganzen Karte, und eine
Asset-Pipeline, die gleichbleibend gute Modelle liefert.

**Aufgaben**
1. **Art Direction festschreiben** ([ART-DIRECTION.md](ART-DIRECTION.md)
   ausbauen): Palette, Licht, Materialregeln, Polygon- und Texturbudgets,
   Referenzbilder (`legacy/threejs/docs/astra-refs/`).
2. **Licht und Atmosphäre:** „Blaue Stunde nach Regen" — Himmel, Sonne,
   Nebel, nasse Straßen (Reflexionen über Probes/Planar, was im Web trägt),
   Postprocessing, je Qualitätsstufe.
3. **Vegetation:** Bäume (Zeder, Ahorn, Kirsche, Bambus), Gras/Reis als
   Detail, LOD + Billboards, Dichte je Stufe.
4. **Asset-Pipeline Blender → Unity** (Skill `blender-asset`): Generator-
   Skripte in `ArtSource/`, Export, Import-Einstellungen, LODs, Vorschaubild.
5. **Erste Bibliothek:** Torii, Steinlaternen, Automaten, Straßenmöbel,
   Leitplanken, Strommasten, Zäune, Felsen — ersetzt die Platzhalter aus
   Phase 2.
6. **Fremd-Assets** (Asset Store, Fab, Poly Haven, Kenney, Quaternius) dort,
   wo sie besser/schneller sind — Lizenz je Paket in `ThirdParty/LICENSES.md`.

**Abnahme:** Bilder aller Blickpunkte auf Hoch und Niedrig; FPS-Ziel auf
Niedrig gehalten (Budgets unten); Konsole sauber.

**Mensch prüft:** Optik — „würde ich das spielen wollen?"

---

## Phase 5 — Orte

**Ziel:** Die Orte des Prototyps — schöner, aus Bausätzen statt Code-Klötzen.

**Eingaben:** Lagen und Inhalte aus `legacy/threejs/docs/TOKYO.md`,
`DOERFER.md`, `NEON_CITY.md`, `WP2-SAKURA.md`, `WP5-stillwater.md`; Produkt-
Soll `legacy/threejs/ASTRA_PLAN.md` §2–3, §7.

**Aufgaben**
1. **Blockout aus dem Prototyp:** Stadt und Dörfer einmal als GLB aus dem
   laufenden Three.js-Spiel exportieren (`GLTFExporter`, Weg in
   [LEGACY-MAP.md](LEGACY-MAP.md)) → als Lagereferenz importieren.
2. **Modulare Bausätze** je Baustil (Tokyo-Hochhaus/Laden, Kura-Speicher
   Koedo, Kiso-Poststation, Gassho-Bauernhaus, Fischerdorf) in Blender.
3. **Orte bauen, in dieser Reihenfolge** (erster Eindruck zuerst):
   Sakura Commons (Spawn/Lobby) → Tokyo (Shibuya-Kreuzung, Neon, Läden) →
   Fischerdorf Funaura/Hafen → Koedo → Kiso-Juku am Pass → Gassho-Weiler →
   Tempel → Needle Circuit.
4. **Dichte:** keine leeren Flächen — Entdeckungen, Details, Leben
   (Wünsche aus `legacy/threejs/TODO.md` §4).

**Abnahme:** je Ort Bilder von 2–3 Blickpunkten; Draw-Call-/Speicherbudget je
Ort eingehalten.

**Mensch prüft:** Wirkung jedes Ortes.

---

## Phase 6 — Zu Fuß und Leben

1. **Spielfigur zu Fuß:** Laufen, Rennen, Rutschen (wie Fortnite-Slide),
   Kamera; Ein-/Aussteigen (Aussteigen erst unter 5 km/h, Einsteigen mit 0
   km/h), Auto herbeirufen.
2. **Fußgänger** auf NavMesh (Gehwege, Plätze) — nie auf der Fahrbahn
   stehend; Rückstoß bei Zusammenstoß (Ragdoll/Impuls), Auto verliert wenig
   Tempo.
3. **Verkehr** (wenige NPC-Autos in der Stadt, wegschiebbar).
4. **Zerstörbares:** Pfosten, Zäune, Automaten, Bäume, kleine Hütten
   zerfallen in Teile statt zu verschwinden (vorzerlegte Meshes).
5. **Begehbare Läden** (ohne Funktion), Tiere/Arbeiter im Fischerdorf.

**Abnahme:** Fußgänger-Test: 10 min Simulation, kein Fußgänger auf
Fahrbahnfläche; Zerstörung kostet ≤ Budget-ms.

---

## Phase 7 — Spielinhalt

1. **Drift-Wertung:** Kette, Multiplikator bis ×5 (ab ×2 exponentiell
   langsamer), Driftzonen ×2.
2. **Zonen/Regionen** (8, lückenlos), „Region erkundet"-Meldung + Belohnung.
3. **Entdeckungen** statt 90 anonymer Pickups (ASTRA §9: 24 Entdeckungen),
   Easter Eggs mit Mini-Aufgaben.
4. **Schanzen und Stunts** an sinnvollen Orten (Fundament statt
   Geländeauflage — Lehre aus dem Prototyp), Stunt-Modus (Doppel-Leertaste).
5. **Rennen:** Startaufstellung gerade, Countdown sperrt, Checkpoints,
   KI-Gegner auf Ideallinie, die wirklich fahren, Rammen erlaubt, Ergebnis.
   Veranstaltungen: Coast Loop, Tōge Descent/Climb, Neon Circuit, Ring Time
   Trial, Tōge Drift Run, dann Katalog aus ASTRA §8.

**Abnahme:** jede Veranstaltung automatisiert vom Start bis Ziel gefahren
(KI gegen KI) ohne Hängenbleiben; Rundenzählung an der Naht korrekt.

---

## Phase 8 — Progression und Speichern

1. **Währung „Sparks"**, Wirtschaftskurve (spürbarer Fortschritt, kein
   Abbruch aus Langeweile) — als Tabelle simuliert, nicht geschätzt.
2. **Autohaus/Shop, Garage, Tuning** (Motor, Bremsen, Lenkung, Grip, Optik-
   Teile aus `ArtSource/cars`), Tuning ändert die Fahrzeug-Werte sichtbar
   und messbar.
3. **Speichern:** CrazyGames-Datenmodul, lokal als Rückfall. Was gespeichert
   wird: ASTRA §9.
4. **Rekorde und Fotos** (Analytics-Reiter).

---

## Phase 9 — UI, HUD, Ton

1. **Menü** (UI Toolkit): Weiter, Shop, Garage, Karte, Fotomodus, Rekorde,
   Einstellungen (Grafik, Steuerung, Tastenbelegung, Ton). ESC pausiert
   **alles**. Sprache Englisch.
2. **HUD:** Tacho mit Gang/Nitro, Drift-Kette, Runde/Position, Minimap mit
   Zonen und Icons, Richtungspfeil; Handy-Layout ohne Überlappung.
3. **Weltkarte**, Teleport zur Lobby, **Fotomodus** (Pause, freie Kamera,
   Hochqualitäts-Render, PNG).
4. **Ton:** Motor je Auto (synchron zu Gang/Drehzahl, Tuning hörbar),
   Reifen/Drift je Belag, Kollisionen nach Tempo/Winkel, Umgebung, Musik.
   Web-Audio-Grenzen von Unity vorher prüfen.
5. **Touch-Bedienung** erstklassig, nicht nachträglich.

**Mensch prüft:** Bedienung auf dem Handy, Klang mit Kopfhörern.

---

## Phase 10 — Plattform und Leistung

1. **CrazyGames-SDK** (Unity): `loadingStart/Stop`, `gameplayStart/Stop`,
   Werbung (Rewarded), Nutzer, Datenmodul, `muteAudio`.
2. **Startdownload ≤ 20 MB** bis zum ersten `gameplayStart` (zählt für die
   Handy-Startseite): kleiner Boot + Startgebiet, Rest per Addressables im
   Hintergrund nachladen.
3. **Speicher:** läuft auf 4-GB-Chromebook; iOS-Safari-Test (CrazyGames
   schaltet Unity-Spiele auf iOS zunächst ab).
4. **Automatische Qualitätswahl** nach Gerät, WebGPU mit WebGL2-Rückfall
   prüfen (Unity 6.6).
5. **Profiling** an allen Blickpunkten, Budgets halten (unten).
6. Optional: Build-CI (GameCI) für automatische Web-Builds.

**Abnahme:** alle Zeilen der CrazyGames-Anforderungen grün
([CONTEXT.md](CONTEXT.md#crazygames-anforderungen)).

---

## Phase 11 — Launch

1. QA-Durchgang (Checkliste aus allen Abnahmen), AdBlock-Test, Geräte-Test.
2. **Basic Launch** auf CrazyGames, Spielzeit und Wiederkehr messen.
3. Die drei größten Absprungstellen beheben, dann Full Launch.

## Phase 12 — Danach

- Live-Betrieb: kleine Updates nach Spielerdaten.
- Optional Desktop/Steam-Build mit höherer Qualitätsstufe.
- `legacy/` löschen, sobald nichts mehr daraus gelesen wird (Mensch
  entscheidet).

---

## Budgets (Startwerte — in Phase 1/10 gegen echte Geräte kalibrieren)

| Größe | Hoch (Desktop) | Niedrig (Handy/Chromebook) |
|---|---|---|
| Bildrate | 60 fps auf iGPU-Laptop 1080p | 30 fps stabil |
| Draw-Calls | < 1 500 (SRP Batcher) | < 400 |
| Dreiecke | < 3 M | < 800 k |
| Speicher (WASM-Heap) | < 1,5 GB | < 768 MB |
| Startdownload bis Spielen | ≤ 50 MB | **≤ 20 MB** |
| Gesamtgröße | ≤ 250 MB | — |
| Zeit bis spielbar | ≤ 20 s | ≤ 20 s |
