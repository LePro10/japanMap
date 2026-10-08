# Status

> Nur der **aktuelle** Stand — keine Geschichte (die steht in `git log`).
> Wird am Ende jeder Sitzung aktualisiert. Unter 80 Zeilen halten.

**Stand:** 2026-10-08 · **Phase:** 5 (Orte) läuft · Phase 4 abgeschlossen (Optik-Abnahme durch dich offen)

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

## Phase 5 — Orte (läuft)

Weg (D19): Layout-Daten des Prototyps → `node Tools/export-places.mjs` → `SourceData/legacy/places/*.json`
→ je Ort `Data/Places/<Ort>.asset` (Art → Bibliotheksmodell) → Menü „JapanMap/Places/Import All".
Bilder vorher `Captures/p5-before/<ort>.png`, nachher `Captures/p5-after/<ort>.png`; Bench `Captures/bench-p5-<ort>-High|Low.txt`.

- [x] 1. Blockout: statt GLB die Layout-Daten selbst (Gebäude sind im Prototyp zu einem Mesh verschmolzen)
- [x] 2. Bausätze: Bibliothek (158 Prefabs) — fehlende Modelle unten unter „Für die Asset-Sitzung"
- [ ] 3. Orte bauen:
  - [x] **Sakura Commons** — Petal Motors (Kiso-Gasthaus als Stellvertreter) mit Kies-Ausstellungsfläche, Open Bay (Netzschuppen als Stellvertreter), Tafel, Laternen, Bänke, Kirschring (24), Start wieder hier (Blick Ost). Bench Hoch ≤ 1 159 DC / 3,77 M (davon Ort +39 DC / +63 k; Rest Wald, s. „Hoch kostet viel"), Niedrig ≤ 293 DC / 381 k ✓. Web Niedrig 392 fps, 0 Fehler
  - [x] **Tokyo** — 2 583 Stadthäuser + 102 Vorstadthäuser aus dem Prototyp-Generator, 3 321 Fassadenmodule instanziert (D20), Hüllen mit Fensterraster in der Ferne, 2 685 Kollider. Bench Niedrig ≤ 288 DC / 545 k ✓; **Hoch 3,1–3,7 M Dreiecke (Budget 3 M)** — Stadt +1,0–1,9 M, Rest Wald/Gelände (an `sakura` jetzt 4,8 M, weil die Stadt im Blick ist). Web Niedrig 377 fps, Hoch 134 fps, 0 Fehler
  - [x] **Funaura** — Kaiplatte (1,8 m), 21 Kaimauer-Stücke, 11 Bootshäuser, 40 Häuser, Fischhalle, Steg, 45 Molenstücke, rotes Feuer, 9 Boote, Kaikram, Ebisu-Schrein, 44 Kiefern (vorläufig als Zeder), Dorfstraße von Stillwater (D21). Bench Hoch ≤ 947 DC / 1,77 M ✓, Niedrig ≤ 309 DC / 356 k ✓. Web Niedrig 387 fps, 0 Fehler
  - [x] **Koedo** — 46 Kura/Machiya an Straße A und der neuen Straße B (verlängert die Dorfstraße, D21), Brauerei, Glockenturm (Shōrō als Stellvertreter), Platz, weiße Kura am Kanal, Speicher, Hikawa-Schrein, 22 Laternen, Weiden (vorläufig). Bench Niedrig ≤ 235 DC / 274 k ✓; Hoch bis 5,0 M (Reisfeld-Gras + Wald im Blick, Ort selbst ≈ 0,5 M). Web 378 fps, 0 Fehler
  - [x] **Kiso-Juku** — 42 Häuser beidseits der Passstraße (Hatago, Soba, Sake, Läden, Minka, Kura), Honjin, Treppe mit Kiesweg den Hang hinauf, Wasserrad, Glocke, Teehaus, Hokora, Kōsatsu, Hinterhäuser, 222 gesetzte Bäume (Ahorn, Zedern, vorläufig). Bench Hoch ≤ 935 DC / 3,5 M, Niedrig ≤ 290 DC / 559 k ✓. Web 378 fps, 0 Fehler
  - [x] **Gassho & Stillwater** — 20 Gassho-/Kayabuki-Häuser und Itakura (mit der Langseite zur Straße und auf die Prototyp-Grundfläche skaliert), Dorfstraße, Fußwege, Mill Lane vom Feldweg bis Funaura (Funauras Straße setzt sie fort), 3 Wasserräder, Mühlrad, 22 Hasa-Gestelle, Feuerhäuschen, Schrein, 135 Bäume. Reisfeldwasser unter Ortsstraßen und Häusern trocken (wie `gasshoDry`). Bench Niedrig ≤ 239 DC / 378 k ✓; **Hoch 5,0–6,7 M / bis 1 431 DC** — davon Ort nur +0,3 M / +240 DC, Rest Reisgras + Wald (Grundwert 5,9–6,4 M, in Phase 4 hier nicht gemessen; `start`/`pass`/`reisfeld` unverändert wie Phase 4). Web 393 fps, 0 Fehler
  - [x] **Bellwood-Schrein (Tempel)** — Kern aus `props.json` (Halle, Treppe, 9 Torii, Laternen, Brunnenhaus, Glocke) bleibt; neu (Regel 15, ASTRA §3): Honden, Komainu, Ema/Omikuji, Amulettstand, Laternengestelle, Pagode als Landmarke, Lehmmauer um den Hof, 3 Nobori, Zedernallee an den letzten 150 m des Sandō. Neuer Blickpunkt `tempel-hof`. Bench Hoch ≤ 625 DC / 3,7 M (Wald), Niedrig ≤ 148 DC / 333 k ✓. Web 384 fps, 0 Fehler
  - [ ] Needle Circuit
- [ ] 4. Dichte: keine leeren Flächen; Vegetation in den Orten freiräumen (geschieht je Ort beim Import)

### Für die Asset-Sitzung (fehlende Modelle, aus dem Import-Bericht)

- **Sakura Commons:** Autohaus „Petal Motors" (22 × 14 m, offene Front, innen 10 Stellplätze), Werkstatt „Open Bay" (18 × 14 m, Einfahrt), Veranstaltungstafel (4 m), einzelne Nobori-Fahne (6×), Leute (6, Phase 6).
- **Tokyo:** Hochhäuser über 40 m (41 Türme bis 154 m, Hotel/Kino-Familie; jetzt 35-m-Modelle), Kino-/Hotel-/Markthallen-Fronten (Familien 4, 5, 7 nutzen Stellvertreter), Holz-Izakaya für die Yokochō-Gassen (jetzt Koedo/Kiso-Läden).
- **Funaura:** weißes Molenfeuer, Kei-Truck (3×), Slipanlage, Kiefer (Kuromatsu) als Baumart.
- **Koedo:** Kanal (Wasser, Mauern, Bogen- und Plattenbrücke — kommt mit „Dichte" aus Bibliotheksteilen), Toki-no-Kane-Glockenturm (16 m Holzturm), 6 moderne Wohnhäuser (2–3 Geschosse), Brauhalle mit Schornstein.
- **Kiso-Juku:** Kido-Tore an beiden Ortsenden, Friedhof (Steine), Kaki-/Momiji-/Niwaki-Bäume als Arten.
- **Gassho & Stillwater:** Jizō-Figur, Mühlteich (22 × 14 m Wasser) samt Mühlhaus, Rinne zum Rad.
  **Ausstellungsautos:** die Fahrzeugmodelle haben 120 k Dreiecke und ~120 Teil-Meshes je Auto (10 Autos = 1,23 M / 1 212 Draw Calls) → für die Ausstellung eine leichte Stufe (≤ 8 k, 1–2 Materialien).

## Offene Probleme / Gefunden

- **Download 47,3 MB** (Ziel Handy 20 MB; Phase 5 bisher +4,3 MB). Unkomprimiert: Autos 71 MB (alle zehn im Build), Gelände 15, Straßen 10,5, Modell-Atlanten 8 + 6 neue Stile, Baumdaten 2 → nur gewähltes Auto laden (Addressables), Atlanten ohne Leuchten ohne Emission-Karte, Phase 10.
- **Hoch kostet viel** (105 fps auf M4 gegen 244 auf Mittel: 4 Schatten-Kaskaden über Wald, MSAA, doppelte LOD-Weite) — auf iGPU-Laptops vermutlich unter 60 → Standardstufe in Phase 10 kalibrieren. Seit Tokyo an Stadt-Blickpunkten 3,1–4,8 M Dreiecke (Budget 3 M); Hebel: Wald-Schatten (Instanzen werden nicht je Kaskade aussortiert), lodBias 2. **Reisfeld-Täler (Gassho) schon ohne Ort 6,4 M** — Reis-/Grasdichte auf Hoch.
- **Löcher in Gebäuden:** Unity verwirft 395 sich selbst schneidende Polygone in 29 Meshes (Tokyo-Mansion 114, Gassho-Häuser je ~20, Kiso/Koedo 3–20) → Asset-Sitzung: vor dem Export triangulieren. Liste: Import-Bericht „JapanMap/Art/Import Library".
- **Fahrtests nur im Batchmodus rot** (`PlayerDriveTests`, Gas bleibt 0): schon vor Phase 4 so, im Editor grün. Ursache offen (nicht der Fensterfokus allein).
- **Niedrig:** Laternen beleuchten das Gelände kaum (Forward, 4 Lichter je Objekt; das Gelände ist ein Objekt) — bewusster Kompromiss.
- Vegetation wächst noch dort, wo Phase 5 Orte baut (Gassho-Tal, Funaura) → beim Bau der Orte freiräumen.
- `Game.unity` 7,1 MB: 2 685 Tokyo-Kollider als GameObjects → später zur Laufzeit aus `PlaceInstanceData` erzeugen (Szene klein, gleiches Verhalten).
- Sakura Commons: die Zufahrt `commons-drive` beginnt als Asphaltkante mitten in der Schale (Startbild) — mit Tokyo/Stadtrand glätten.
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
