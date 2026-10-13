# Politur vor dem Live-Gang — Analyse und Plan

> Stand 2026-10-13. Grundlage: echtes Spiel im Editor (`Captures/audit-ui*`, `Captures/audit-world`), alter Prototyp
> live (lepro10.github.io/japanMap) und sein Code, vier Code-Analysen (Feature-Vergleich, Grafik, UI, CrazyGames-Regeln).
> Jede Zeile hat einen Beleg (Datei:Zeile oder Bild). Reihenfolge = Wirkung je Aufwand. S/M/L = klein/mittel/groß.

## 1. Befund in einem Satz je Bereich

| Bereich | Befund | Hauptursache |
|---|---|---|
| **Spiegelungen** | Straße glänzt gleichmäßig blau wie Plastik, nichts spiegelt sich (keine Neons, Fenster, Lampen) | Einzige Quelle: Himmel als 128-px-Würfel, 0 Reflection Probes, kein Pfützen-Shader, Normal-Map auch unter Wasser voll (`LookSetup.cs:93-95,170-183`, `Road_Asphalt.mat`). Prototyp: Pfützenmaske (Rauheit 0,045, Normale flach) + Planarspiegel für Tokyo + echtes HDRI |
| **Tokyo** | Von oben endlose beige Kästen, Straße leer, Schilder glühen kaum, keine Lichtinseln, keine Kabel, keine Markierungen | Neon-Emission 2 statt 5,5; Bloom auf Niedrig aus (HDR aus); 0 Lichter in Tokyo; Boden einfarbig; SSAO 0,4 statt 1,15 |
| **Straße → Erde** | Harte Kante, Gelände beißt zackig in die Bankette, Bankette sieht aus wie Asphalt, keine Fahrbahnmarkierungen | 4-Punkt-Querschnitt ohne Übergang (`RoadImporter.cs:355`), Gelände 1,5 m/Texel, Splatmap 3 m/Texel ohne Bankett-Zone |
| **Reisfelder** | Wasser als achsparallele Treppe, weiße Himmelsflecken, breite Schlammränder | `WaterImporter.cs:70-123` legt 3-m-Rechtecke; der Prototyp hatte genau diesen Fehler schon mit Marching Squares + Uferverlauf behoben |
| **Landschaft** | Berge rotbraun und kahl (Pass, Reisfeld-Hintergrund), Küste flache braune Fläche, Meer ein glatter Spiegel ohne Wellen/Schaum, ein grauer Platzhalter-Kasten im Dorf (`vp dorf`) | Fels-Splat überall an Hängen; kein Strand/Schaum; Wasser ohne Wellen |
| **UI** | Wirkt wie ein Programmier-Werkzeug | **Keine eigene Schrift** (Unity-Standard), Platzhalter-Icons, keine Bewegung/Übergänge, HUD-Farben/Größen als Zahlen im Code (107 Inline-Stile), Tacho unten abgeschnitten, Ergebnis = ein Textblock, Autos ohne Bild |
| **Tuning** | Gibt es (4 Teile × Street/Sport, Setups, Lack, Felgen, Kits) — **aber man findet es nicht** und es ist eine Knopf-Tabelle | Nur Esc → Cars → kleiner „Tune“-Knopf oder „E“ in 8 m Nähe der Open Bay ohne Schild; keine Werte-Vorschau, kein Vorher/Nachher, feste Kamera; „Dirt“-Fahrhöhe wird nie benutzt (toter Regler) |
| **Fotomodus** | Maus dreht die Kamera nicht | Absicht im Code: nur **rechte** Maustaste (`PhotoMode.cs:357`), linkes Ziehen verworfen (`:144`) — auf dem Trackpad praktisch unmöglich. Mausrad = Tempo statt Zoom; keine Filter/Schärfentiefe; Test umgeht echte Eingabe |
| **Ton** | Keine Musik, keine Umgebungstöne, kein Drift-Ton auf Erde, kein Ton bei Fußgänger-Treffer | Clips fehlen (Asset-Sitzung), `music: []` |
| **Wiederkommen** | Kein Grund, morgen wiederzukommen | Kein Tagesbonus/Tagesaufgabe (CrazyGames nennt das ausdrücklich), kein Geist der Bestzeit |
| **Gegner** | KI schwach | Kein Gummiband, keine Ideallinie (`RaceEventSet.cs:67-79`) |

## 2. Vom alten Spiel noch nicht drin

Fehlt: Fotomodus mit Maus/Zoom/Ultra-Qualität beim Auslösen · 3D-Garage mit Hebebühne, Kamerafahrten, Vergleich ·
Schilder/Marker in Sakura Commons (Petal Motors, Open Bay, Event Board) + Begrüßung · Intro endet in der Garage ·
„Intro wiederholen“ · Routen-Band auf der Straße · Wasser-Spritzer · Motorhauben-Kamera · Neon-Lichtsystem ·
Planarspiegel Tokyo · Pfützen · Kabel zwischen Masten · Fahrbahnmarkierungen/Zebrastreifen · Reisfeld-Ufer ·
Sandkasten-Code `og123` (dein TODO) · Häuser zerfallen in Teile (dein TODO).
Alles andere (Fahren, 10 Autos, Rennen, Drift, Schanzen, Entdeckungen, Zu Fuß, Verkehr, Karte, Menü, Touch) ist da.

## 3. Plan

### Block A — Sofort, klein, spürbar (S)
1. Fotomodus: linkes Ziehen dreht, Mausrad = Zoom (FOV 18–90), Leertaste/Shift hoch/runter, Auslösen in Hoch-Qualität; Test über echte Maus.
2. Tacho nicht mehr abgeschnitten.
3. Tuning auffindbar: Kachel „Tune your car“ auf der Play-Seite, Marker über der Open Bay, langsam hineinrollen öffnet die Garage, Intro endet vor der Bay.
4. Toten Regler „Dirt“-Fahrhöhe anschließen; HappyTime bei echten Erfolgen (erster Sieg, Rekord).

### Block B — Grafik (S–M je Punkt, fast ohne Leistungskosten)
1. **Nasse Straße**: Straßen-Shader mit Pfützenmaske (Spiegel-Flecken, Normale flach, trockener Asphalt matter).
2. **Umgebungs-Würfel 256 px + Wolken am Himmel**, Prüfung ob der Web-Build den richtigen Himmel spiegelt.
3. **Neon/Fenster heller + Bloom**, auch auf Niedrig wenn gemessen tragbar.
4. **Reisfelder**: Marching Squares, Uferverlauf, leichte Wellen.
5. **Straßenränder**: Bankett-Streifen aus Kies/Erde mit weichem Übergang, Bankett-Zone in der Splatmap.
6. **Markierungen** (Mittellinie, Ränder, Zebrastreifen Tokyo) + Pflaster-Shader für die Stadtplatte.
7. **Lichtinseln** unter Laternen + wandernde echte Lichter (Hoch 16 / Mittel 6), Kabel zwischen Masten, SSAO stärker.
8. **Reflection Probes** in Tokyo und Dorfstraßen; danach Planarspiegel nur Tokyo auf Hoch (M–L, messen).
9. Landschaft: grüne bewaldete Hänge statt rotem Fels (Vorschlag), Strand + Schaum an der Küste, Platzhalter-Kasten ersetzen.

### Block C — UI neu (M–L)
1. Fundament: eine Schrift-Familie (OFL, z. B. Saira Condensed für Zahlen + Inter für Text), Farben/Größen nur noch im Stylesheet, echtes Icon-Set, Sparks-Symbol.
2. HUD: Tacho neu, Drift-Zähler mit Pop, Meldungen mit Icon, eine Tastenkappe für alles.
3. Ergebnis-Bildschirm: Medaille, Zeit, Belohnung aufgeschlüsselt, hochzählend; Countdown mit Ampel.
4. Menü mit Übergängen, Tab-Tasten Q/E, Fokus für Tastatur/Gamepad; Ladebildschirm im selben Stil.
5. Garage als Schaufenster: Auto dreht sich, Werte-Balken mit Vorschau (grün = besser), Vorher/Nachher, Teile mit Namen statt „Option 1“.
6. Touch-Knöpfe mit Icons statt Wörtern.

### Block D — Tuning mit Tiefe (M)
Sichtbare Teile (Felgen je Stufe, Fahrhöhe, Sturz, Spoiler), Feinregler wie bei Drift Hunters (Fahrhöhe, Sturz, Spur), erster
lohnender Kauf in ≤ 5 min. 3D-Bay mit Hebebühne und Kamerafahrten (L, nach C5).

### Block E — Halten und Wiederkommen (M)
Tagesbonus + Tagesaufgabe · Geist der eigenen Bestzeit im Zeitfahren · KI mit Ideallinie + Gummiband · Routen-Band ·
Wasser-Spritzer · Musik/Umgebungstöne (Clips aus der Asset-Sitzung).

### Block F — Launch-Pflicht
Start ≤ 20 MB (Hachi auf ≤ 40 k Eckpunkte) · neue Store-Videos aus dem Intro · im Portal „Progress Save“ ankreuzen
(fehlt in LAUNCH.md) · Regeln für Werbe-Knöpfe als Test · Login mitten im Spiel prüfen · AZERTY prüfen · Handy-/Gerätetest (Mensch).

## 4. Braucht deine Zustimmung (Regel 15)

- Berge grün/bewaldet statt rotbraun (Lage bleibt, nur Oberfläche).
- Tagesbonus/Tagesaufgabe und Preise (erster Kauf) — Wirtschaft ändert sich.
- Schriftarten (Vorschlag oben, alle kostenlos/OFL).

## 5. Umgesetzt (2026-10-13, je Punkt gemessen/Bild angesehen)

| Block | Erledigt | Beleg |
|---|---|---|
| A | Fotomodus: Ziehen mit jeder Maustaste, Rad = Zoom, Space/C, Shift | `MapTests.PhotoMode_LeftDragLooks_WheelZooms` |
| A | Tacho im Rahmen; Weltmarken „TUNE & CARS“ + Event-Starts; Garage-Kachel; Intro endet an der Open Bay; HappyTime bei Siegen | `MenuTests.Tuning_IsFound_…`, Bilder `Captures/a2-*`, `a3-*` |
| B | Nasse Straße (Pfützen, Markierungen, Bankett-Ton) als eigener Shader | `LookTests`, `Captures/b1-wet` |
| B | Planarspiegel Tokyo (Hoch ½, Mittel ⅓, Niedrig aus), 31 Reflection Probes | `Captures/b2-planar`, `b3-probes` |
| B | Bloom fehlte in Fotos/Aufnahmen (8-Bit-Ziel) → `CameraShot`; Neon 5 / Läden 3 | `LookTests.CameraShot_KeepsTheBloom` |
| B | Reisfelder per Marching Squares; Moos-Fels statt roter Schlucht; Himmel mit Wolken, kein Horizontstreifen | `Captures/b5-paddy`, `b6-rock`, `b7-sky` |
| B | Kies-Bankett an Straßenrändern; SSAO 0,9; Laternen-Lichtflecken + nächste Punktlichter | `Captures/b8-edge`, `b10-lamps` |
| B | Start-Download: Straßen 64→44 B/Eckpunkt, Reisfeld verschweißt | Build: Start 19,15 MB, Hoch 133 fps, Niedrig 383 fps |
| C | Schriften Saira Condensed + Barlow (OFL); Pausenmenü mit Kamerafahrt, Verlauf, Einblenden, Q/E | `Captures/c1-fonts`, `c2-menu` |
| C | HUD: Zahlen-Schrift, Pop-Animationen, Rekord-Meldungen erst ab sinnvollen Werten | `Captures/c3-hud` |
| C | Ergebnis mit Medaille, großer Zeit, hochzählenden Sparks | `Captures/c4-result`, `RaceAcceptanceTests` |
| C/D | Garage: Leistungsbalken mit Vorschau, Teile-Karten, Setups mit Erklärung, Live-Änderung am Auto | `Captures/c5-garage`, `GarageTests` |
| E | Tagesbonus mit Serie + tägliche Herausforderung | `DailyTests`, `Captures/e1-daily` |
| E | KI: Gummiband + mutigere Gegner | `RaceAcceptanceTests` 2× grün |
| C | Ladebildschirm: Spielschrift, Regen, Tipps | Build |
