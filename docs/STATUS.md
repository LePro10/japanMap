# Status

> Nur der **aktuelle** Stand — keine Geschichte (die steht in `git log`).
> Wird am Ende jeder Sitzung aktualisiert. Unter 80 Zeilen halten.

**Stand:** 2026-10-08 · **Phase:** 5 (Orte) abgeschlossen — deine Abnahme offen · **Phase 6 (Zu Fuß und Leben) ist als Nächstes dran**

Phase 2 ✅ · Phase 3 ✅ von dir freigegeben · Phase 4 ✅ (deine Optik-Abnahme offen).

## Phase 5 — Orte ✅

Weg (D19–D21): Layout-Daten des Prototyps → `node Tools/export-places.mjs` → `SourceData/legacy/places/*.json`
(reproduzierbar: Neu-Export bitgleich) → `Data/Places/<Ort>.asset` (Art → Bibliotheksmodell) → „JapanMap/Places/Import All".
Bilder: vorher `Captures/p5-before/`, nachher `Captures/p5-after/`, Niedrig `Captures/p5-low/alle.png`,
Vergleich je Ort `Captures/p5-<ort>-vorher-nachher.png`. Bench `Captures/bench-p5-*-High|Low.txt`, Gesamt `bench-p5-final-*`.

- [x] **Sakura Commons** — Start wieder hier (D19); Petal Motors + Kies-Ausstellungsfläche, Open Bay, Tafel, Laternen, Kirschring
- [x] **Tokyo** — 2 685 Häuser aus dem Prototyp-Generator, 3 321 Fassadenmodule instanziert, Hüllen mit Fensterraster (D20); 717 Straßenmöbel nach Straßenklasse, Automaten, Parks
- [x] **Funaura** — Kaiplatte, 11 Bootshäuser, Molen + 2 Feuer, Steg, Slip, Boote; eigene Zufahrt (D21)
- [x] **Koedo** — Kura-Straßen A + B, Brauerei, Toki no Kane, Kanal mit Wasser und Ishigaki-Ufern, Schrein
- [x] **Kiso-Juku** — 42 Häuser an der Passstraße, Honjin, Kido-Tore, Hangtreppe, Wasserrad
- [x] **Gassho & Stillwater** — 20 Strohdachhäuser, Mill Lane bis Funaura, Mühlhaus + Teich, Wasserräder, Hasa
- [x] **Bellwood-Schrein** — Honden, Pagode, Mauer, Komainu, Zedernallee am Sandō (Regel 15)
- [x] **Needle Circuit** — Boxenhof, Leitplanken an engen Kurven, Lichter an der Geraden
- [x] Dichte: Vegetation in allen Orten freigeräumt; Reisfeldwasser unter Ortsstraßen/Häusern trocken

**Abnahme (gemessen, Editor M4, 10 Blickpunkte):** Niedrig ≤ 347 Draw Calls / ≤ 572 k Dreiecke ✓ (Budget 400 / 800 k).
Hoch ≤ 1 289 Draw Calls ✓, Dreiecke 1,6–6,8 M ✗ an 6 von 10 Punkten (Budget 3 M) — Orte selbst +0,03…1,9 M, der Rest Wald und
Reisgras (an `start`/`pass`/`reisfeld` gleich wie Phase 4). Konsole 0 Fehler. Tests: EditMode 59/59, PlayMode 140/144 (4 auf Abruf).
Web: 0 Fehler, 47,69 MB; Browser-fps zuletzt Niedrig 178, Hoch 49 — **unter Last gemessen** (Blender lief, siehe unten).

## Phase 6 — Zu Fuß und Leben (als Nächstes)

- [x] 1. **Zu Fuß** (D22): Start in Sakura, Auto 4 m nördlich. WASD/Stick, Shift rennen, Leertaste springen, **C rutschen**,
  Maus (Klick fängt den Zeiger) / rechter Stick schaut; **F** ein/aus (aus nur < 5 km/h), **H** Auto rufen. Touch: Stick,
  Wischen = Blick, JUMP/SLIDE/CAR/CALL. Figur aus Grundformen (vorläufig). Bench Niedrig Sakura 290 DC (vorher 275).
  Werkzeug neu: `node Tools/play.mjs <ordner> "<skript>"` spielt das echte Spiel mit Tasten und macht Bilder.
- [ ] 2. Fußgänger auf NavMesh (Gehwege, Plätze, Commons-Hof), nie auf der Fahrbahn; Rückstoß
- [ ] 3. Wenig Verkehr in der Stadt
- [ ] 4. Zerstörbares: Pfosten, Zäune, Automaten, Bäume, Hütten zerfallen in Teile
- [ ] 5. Begehbare Läden, Arbeiter/Tiere im Fischerdorf

## Offen / Gefunden

- **Deine Kartenpunkte:** Höhen an Einmündungen ✓ für alle neuen Ortsstraßen. **Nicht erledigt:** Kuppen-Knicke und Höhenstufen der alten Straßen, Stadtplatte ohne Böschung (Felskante neben der Platte, `Captures/look-viadukt.png`), treppige Reisfeldränder. Hochstraße: Leitplanken sind auf allen 204 Viadukt-Rändern schon da, eine geschlossene Brüstungsmauer fehlt (kein Modell).
- **Browser-fps** zuletzt Hoch 49 statt 134, Niedrig 178 statt ~380 — gemessen, während Blender lief; Editor-Bench am selben Punkt unverändert. Ursache ungeprüft → bei ruhigem Rechner `node Tools/smoke.mjs --gpu` wiederholen; bleibt es, gegen einen Build von `9500ab6` messen.
- **Hoch kostet viel:** Wald-Schatten (Instanzen werden nicht je Kaskade aussortiert), lodBias 2, Reisgras (Gassho-Tal ohne Ort 6,4 M) → Phase 10.
- **Download 47,7 MB** (Ziel Handy 20 MB; Phase 5 +4,7 MB). Autos 71 MB unkomprimiert → Addressables, Phase 10.
- `Game.unity` 7,1 MB durch 2 685 Tokyo-Kollider → zur Laufzeit aus `PlaceInstanceData` erzeugen.
- Sakura Commons: `commons-drive` beginnt als Asphaltkante in der Schale (Startbild).
- Fahrtests nur im Batchmodus rot (`PlayerDriveTests`, seit Phase 3; im Editor grün). Löcher in Gebäude-FBX (Asset-Sitzung). Rest aus Phase 3/4: Leitplanken zerbrechen nicht, Fels ohne Triplanar, Wasser ohne Tiefe → Phase 7/10.

### Für die Asset-Sitzung (fehlende Modelle; Lagen stehen in den Daten, Import genügt)

- Sakura: Autohaus Petal Motors (22 × 14 m), Werkstatt Open Bay (18 × 14 m), **leichte Ausstellungsautos** (≤ 8 k Dreiecke; die Fahrmodelle haben 120 k).
- Tokyo: Hochhäuser 40–154 m (41 Stück), Kino-/Hotel-/Markthallen-Fronten, Holz-Izakaya für Yokochō. Koedo: 2 Kanalbrücken, 6 moderne Wohnhäuser, Brauhalle.
- Funaura: Kei-Truck. Needle: Tribüne, Boxengebäude, Start-Ziel-Brücke, Reifenstapel. Viadukt: Brüstungsmauer.
- **Spielfigur** (Phase 6): 1,72 m, Fahrerin/Fahrer der späten 80er (Jacke, Hose), ≤ 6 k Dreiecke, Ursprung zwischen den Füßen,
  +Z vorn; Animationen Stehen, Gehen (4,4 m/s), Rennen (7,5 m/s), Sprung, Rutschen (Hocke, Hüfte ~0,4 m). Bis dahin `StandInFigure`.

## Für dich (Mensch)

1. **Dein laufendes Spiel:** Ich habe aus Versehen neu kompiliert, während Play lief → das Auto wirft Fehler. Bitte **Play stoppen und aus `Boot` neu starten**. (Ist behoben: Werkzeuge kompilieren nie mehr im Play-Modus.)
2. **Abnahme Phase 5 (~15 Min.):** `Boot` → ▶ Play. Du startest jetzt in **Sakura Commons** (wie im Prototyp), Blick nach Osten.
   - Links die Holzhalle „Petal Motors" mit Kieshof, die Tafel, Laternen, Kirschring. Fahr Richtung Westen/Norden → **Tokyo**: Neon-Straßen, Laternen, Bäume auf Boulevards. Würde ich hier fahren wollen?
   - Schneller per Bild: `Captures/p5-<ort>-vorher-nachher.png` für sakura, tokyo, funaura, koedo, kiso, gassho, tempel, needle; Handy-Stufe `Captures/p5-low/alle.png`.
   - Wichtigste Fragen: Wirken **Funaura** (Bootshäuser am Wasser) und **Gassho** (Strohdächer zwischen Reisfeldern) wie im Prototyp, nur schöner? Stören die **Stellvertreter** (Autohaus = Gasthaus, Garagen = Blechhallen)?
3. **Freigabe Asset-Stile „Scatter" und „Flora"** (`ArtSource/STATUS.md`): Tafel, Nobori, Jizō, Gräber, Tetrapoden, Leitpfosten, Gewächshäuser, Mauern — und die **echten Bäume**. Sag „freigegeben", dann trage ich sie ein und importiere.
4. **Browser-Probe bei ruhigem Rechner** (Blender zu): `node Tools/smoke.mjs --gpu` — ich brauche die fps-Zahl.
5. Noch offen aus früher: Optik-Abnahme Phase 4; Hachi-Heckscheibe (Phase 3); zwölf alte Zweige `agent/*`.
6. Commits liegen lokal; **Push** nur, wenn du es sagst.

## Web-Build

| Datum | Typ | Gesamt | wasm | data | Boot (lokal) |
|---|---|---|---|---|---|
| 2026-10-08 | Release, Phase 4 (Look, Vegetation, 158 Modelle) | 43,01 MB | 5,53 MB | 37,29 MB | 0,8–1,1 s |
| 2026-10-08 | Release, Phase 5 (8 Orte, 164 Modelle) | 47,69 MB | 5,53 MB | 41,96 MB | 1,2–1,3 s |
