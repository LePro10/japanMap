# Status

> Nur der **aktuelle** Stand — keine Geschichte (die steht in `git log`).
> Wird am Ende jeder Sitzung aktualisiert. Unter 80 Zeilen halten.

**Stand:** 2026-10-08 · **Phase:** 4 abgeschlossen (Optik-Abnahme durch dich offen), **Phase 5 (Orte) ist als Nächstes dran**

Phase 2 (Karte) ✅ · Phase 3 (Fahren) ✅ von dir freigegeben.

## Phase 4 — Look und Asset-Pipeline ✅

- [x] 1. Art Direction festgeschrieben (`docs/ART-DIRECTION.md`: Licht-Werte, Modelle, Showroom, Budgets)
- [x] 2. „Blaue Stunde nach Regen": `Data/Look/Look.asset`, Menü JapanMap/Look/Apply — Sonne 126°/7° (Prototyp-Richtung), Himmel, Nebel, Post, nasser Asphalt, Gegenlicht-Blickpunkt `stadt-sonne`
- [x] 3. Vegetation: 77 700 Bäume/Büsche + Gras + Reis nach Prototyp-Regeln, eigener Instanz-Renderer (D18); Bäume **vorläufig** aus dem Editor bis Sprint-Aufgabe 4
- [x] 4. Asset-Pipeline: `ArtSource/exports` → Menü JapanMap/Art/Import Library (nur freigegebene Atlanten, `Data/Art/LibraryImport.asset`), LOD, Collider, Lichter; Showroom-Szene
- [x] 5. Bibliothek: 158 Prefabs aus 16 Atlanten; **321 von 977** Platzhaltern auf der Karte ersetzt (Torii, Laternen, Masten, Felsen, Gassho-Höfe, Schuppen, Hafenkram, Schrein)

**Abnahme (gemessen):** Bilder aller 40 Blickpunkte Hoch `Captures/p4-after/`, Niedrig `Captures/p4-low/`
(vorher: `Captures/p4-before/`). Bench Hoch (Editor, M4): 307–1 700 Draw Calls, ≤ 3,4 Mio. Dreiecke, ≤ 3,9 ms;
Niedrig: 119–357 Draw Calls, ≤ 0,34 Mio. Dreiecke, ≤ 2 ms → **Budget Niedrig gehalten**. Konsole 0 Fehler.
Tests im Editor: EditMode 53/53, PlayMode 139/139 (+4 auf Abruf). Web: 0 Fehler, Hoch 105 fps, Mittel 244, Niedrig 545 (M4).

## Phase 5 — Orte (als Nächstes)

- [ ] 1. Blockout aus dem Prototyp (Lagen der Städte/Dörfer)
- [ ] 2. Bausätze: liegen aus dem Asset-Sprint in Unity bereit (Showroom)
- [ ] 3. Orte bauen: Sakura Commons → Tokyo → Funaura → Koedo → Kiso → Gassho → Tempel → Needle Circuit
- [ ] 4. Dichte: keine leeren Flächen; dabei Vegetation in den Orten freiräumen (Import neu laufen lassen)

## Offene Probleme / Gefunden

- **Download 43,0 MB** (Ziel Handy 20 MB). Unkomprimiert: Autos 71 MB (alle zehn im Build), Gelände 15, Straßen 10,5, Modell-Atlanten 8 + 6 neue Stile, Baumdaten 2 → nur gewähltes Auto laden (Addressables), Atlanten ohne Leuchten ohne Emission-Karte, Phase 10.
- **Hoch kostet viel** (105 fps auf M4 gegen 244 auf Mittel: 4 Schatten-Kaskaden über Wald, MSAA, doppelte LOD-Weite) — auf iGPU-Laptops vermutlich unter 60 → Standardstufe in Phase 10 kalibrieren.
- **Löcher in Gebäuden:** Unity verwirft 395 sich selbst schneidende Polygone in 29 Meshes (Tokyo-Mansion 114, Gassho-Häuser je ~20, Kiso/Koedo 3–20) → Asset-Sitzung: vor dem Export triangulieren. Liste: Import-Bericht „JapanMap/Art/Import Library".
- **Fahrtests nur im Batchmodus rot** (`PlayerDriveTests`, Gas bleibt 0): schon vor Phase 4 so, im Editor grün. Ursache offen (nicht der Fensterfokus allein).
- **Niedrig:** Laternen beleuchten das Gelände kaum (Forward, 4 Lichter je Objekt; das Gelände ist ein Objekt) — bewusster Kompromiss.
- Vegetation wächst noch dort, wo Phase 5 Orte baut (Gassho-Tal, Funaura) → beim Bau der Orte freiräumen.
- Horizont vom Startpunkt (hoch oben): schmale grünliche Linie zwischen Himmel und Nebel.
- Vorläufige Bäume: Zeder von unten gesehen (Stufen-Kegel) und Bambus noch grob → Sprint-Aufgabe 4 ersetzt sie.
- Rest aus Phase 3: Straßen-Höhenstufen + Kuppen-Knicke (Phase 5), Leitplanken zerbrechen nicht (Phase 7), `PathFollower` ohne Zurücksetzen (Phase 7), Terrain-Dreiecke `pixelError` (jetzt je Stufe in `TerrainQuality`), Web-Seite Standardvorlage (Phase 9/10), zwölf alte Zweige `agent/*` (du entscheidest).
- **Aus Phase 4 nicht geschafft:** Reisfeldränder treppig, Fels ohne Triplanar-Mapping, Wasser ohne Tiefe/Collider (kein Spritzwasser) → Phase 5/7. Hochstraße ohne Brüstungen, Stadtplatte ohne Böschung → Phase 5.
- Batchmodus jetzt geprüft: `verify.mjs` (Sperrklinke) und `capture.mjs --viewpoint all` laufen.
- 656 Platzhalter bleiben (Tetrapoden 372, Leitpfosten 170, Betonmauern 79, Gewächshäuser 30 u. a.) — dafür gibt es noch keine Modelle.

## Für dich (Mensch)

1. **Optik-Abnahme (~10 Min.): „Würde ich das spielen wollen?"** Unity offen, Szene `Boot` → ▶ Play.
   Du startest in der Stadt. Bitte anschauen:
   - **Gegenlicht:** Fahr auf der Stadtstraße Richtung Sonne (tief, rechts vom Start) — kleine Sonne, Glanzstreifen auf dem nassen Asphalt. Zu hell, zu dunkel, zu blau?
   - **Wald und Wiesen:** Fahr aus der Stadt raus Richtung Berge — dichter Zedernwald, grüne Wiesen, ab und zu ein roter Ahorn. Die Bäume sind **vorläufig** (einfache Formen), bis der Asset-Sprint sie baut. Stört dich die Form schon jetzt?
   - **Tempelpfad (Sandō):** Torii mit Steinlaternen, die warm leuchten — so wie im Prototyp?
   Ohne Fahren geht es schneller mit Bildern: `Captures/p4-after/` (Hoch) und `Captures/p4-low/` (Handy-Stufe), vorher/nachher `Captures/p4-before/montage-a.png` ↔ `Captures/p4-after/montage-a.png`.
2. **Modelle im Spiel-Licht:** Datei → `Assets/_Project/Scenes/Showroom.unity` öffnen (Play nicht nötig) — alle 158 Modelle in Reihen (Requisiten, Tokyo, Koedo, Kiso, Gassho, Minato, Tera, Bäume).
3. **Tempel (Tera):** Laut Asset-Sprint wartet der Stil noch auf deine Freigabe (+ Frage zu drei Wahrzeichen über 5 000 Dreiecken, siehe `ArtSource/STATUS.md`). Ich habe ihn schon importiert, weil du „alle fertig" geschrieben hast — sag Bescheid, falls nicht.
4. **Asset-Sitzung:** bitte ausrichten: „Löcher: vor dem FBX-Export alle n-Ecke triangulieren (Liste in docs/STATUS.md), danach Vegetation (Aufgabe 4)".
5. **Hachi (noch offen aus Phase 3):** Von hinten sieht man durch die Heckscheibe in den Innenraum (`Captures/web-smoke-High.png`). Richtig so oder fehlt ein Dach?
6. Commits liegen lokal; **Push** nur, wenn du es sagst.

## Web-Build

| Datum | Typ | Gesamt | wasm | data | Boot (lokal) |
|---|---|---|---|---|---|
| 2026-10-07 | Release, ganze Karte | 25,81 MB | 5,28 MB | 20,34 MB | 1,6 s |
| 2026-10-08 | Release, Karte + 10 Autos | 34,56 MB | 5,54 MB | 28,84 MB | 1,0 s |
| 2026-10-08 | Release, Phase 4 (Look, Vegetation, 158 Modelle) | 43,01 MB | 5,53 MB | 37,29 MB | 0,8–1,1 s |
