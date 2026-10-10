# Status

> Nur der **aktuelle** Stand — keine Geschichte (die steht in `git log`).
> Wird am Ende jeder Sitzung aktualisiert. Unter 80 Zeilen halten.

**Stand:** 2026-10-10 · **Phase:** 9 abgeschlossen (deine Abnahme offen: Handy, Klang mit Kopfhörern) · **Phase 10 (Plattform und Leistung) ist als Nächstes dran**

Phase 2 ✅ · 3 ✅ freigegeben · 4 ✅ (Optik-Abnahme offen) · 5–8 ✅ (Abnahme offen).
## Phase 9 — UI, HUD, Ton ✅ (D33, D34)

- [x] 1. **Menü** (Esc pausiert Zeit, Physik, Ton): Play, Cars (Autohaus, Kaufen-Blatt, Tune, Lack, Probefahrt 90 s), Map, Records,
  Photo, Settings (Tasten neu belegen, 5 Tonregler, Grafik, UI-Größe, km/h–mph). Desktop-Leiste, Handy hochkant Reiter unten, quer schmale Leiste.
- [x] 2. **HUD** nach ASTRA-Maßen: Minikarte (Vektor-Straßen, 480/160/700 m), Instrument mit Gang aus dem Getriebe (ASTRA-§6-Tabelle),
  Nitro-Bogen, Sparks nur 2 s, Checkpoint-/Wegpunkt-Pfeil, Rennkarte/Ergebnis mit Knöpfen, Meldungen erst nach dem Rennen.
- [x] 3. **Weltkarte** (ziehen, zoomen, Filter, Reisen nach Erkundung, Hinweis mit live gerenderter Postkarte + 80-m-Kreis), **Fotomodus** fertig.
- [x] 4. **Ton:** Motor je Auto am Getriebe (Last/Schub, Schaltpause, Begrenzer, Tuning als Ebene), Reifen je Belag, Aufprall, Glocken,
  Tempelglocke; Stellvertreter aus dem Prototyp-Synthesizer (Klang ungeprüft). Es gab vorher keinen AudioListener.
- [x] 5. **Touch erstklassig:** ASTRA-Layout, Auto-Gas, Rutschen Boost→Drift, Linkshänder, 100–140 %; jeder Bildschirm per Finger getestet.

**Abnahme gemessen:** EditMode **121/121**, PlayMode **187/194** (7 auf Abruf, 0 rot). Tests neu: Menü, HUD, Getriebe (4), Karte, Ton (4),
Touch-Fahrt, Touch-Menü/Foto, Gras-Freihaltung, Anzeige ohne globalen Zufall. Bench Hoch Sakura 1 393 / Niedrig 339 DC, 552 k Dreiecke
(P8: 1 422 / 332). Web **55,91 MB** (+1,63: Ton 1,42), Start 0,8–1,1 s, Niedrig 299–354 fps, Hoch 56 fps, 0 Fehler, Speichern grün.
Blickpunkte `Captures/p9-gate-HL.png` (gleich wie P8); Handy-Bilder `Captures/p9-1…p9-5`.

## Phase 10 — Plattform und Leistung (als Nächstes, PLAN.md)

- [ ] 1. CrazyGames-SDK komplett · [ ] 2. Start ≤ 20 MB (Addressables) · [ ] 3. Speicher/Chromebook/iOS · [ ] 4. Auto-Qualität, WebGPU · [ ] 5. Profiling · [ ] 6. CI

## Offen / Gefunden

- **Wackeln:** `Keyboard_Drives…` 1×/7 rot; `PedestrianTests.TenMinutes…` 1× im Gesamtlauf rot, allein grün. Ring-Senke bei (508, −738):
  Karosserie setzt bei ~110 km/h auf, Abnahmefahrt knapp (2,4–5,5 m von 6) → Straßenprofil glätten (Phase 10/12).
- **Unity schreibt selbst um (nicht committet):** `Data/Nav/*.asset`, `ProjectSettings`. **CrazyGames ungeprüft:** Mausfang, Foto-Download,
  Speichern im echten Rahmen, „Choose progress“ → Phase 10 mit dem QA-Tool.
- **Fehlt:** Car-Lab-Lackierungen (Nachladen, P10); Ride-Höhe +20 mm „Dirt“; Produkt-Messungen (ASTRA §11); Gegner-Motoren hörbar;
  Foto „Capture High“ ohne Mehrfach-Abtastung; Leuchtturm-Reiseziel (keine Longshore-Straße); Funaura-Angler; Musik/Welt-Töne (Asset-Sitzung).
- **ASTRA-Katalog:** E01, E08–E12, E15–E17, Lieferfahrten brauchen ungebaute Straßen/Orte → Phase 12. **Karte:** Kuppen-Knicke,
  Stadtplatte ohne Böschung, treppige Reisfeldränder, `commons-drive` beginnt als Asphaltkante.
- **Hoch kostet viel** (Wald-Schatten, lodBias 2; Browser Hoch 56 fps) und **Download 56 MB** (Desktop 50, Handy 20) → Phase 10
  (Addressables; die neun nicht gefahrenen Motorbänke nachladen ≈ −1,3 MB).

### Für die Asset-Sitzung (Lagen stehen in den Daten, Import genügt)

- **Töne (nur CC0 oder eigene Aufnahmen; Name = Ersatz, Datei nach `Assets/_Project/Art/Audio/<Name>.wav`, mono, 44,1/48 kHz):**
  Motor je Auto (`Engine_<auto>_idle` 1,0 s; `_on0…3` 0,8 s Last und `_off0…3` 1,0 s Schub bei 30/50/70/92 % der Drehzahlgrenze;
  `Lift_<auto>` 0,9 s), nahtlose Schleifen, 1024 Samples Stille vorn. Welt-Schleifen 3–6 s: `Ambience_Workshop` (Werkzeuge,
  Commons), `Ambience_NeonHum` (Trafos, Gespräche, Tokyo), `Ambience_Harbour` (Netze, Taue, Boote), `Ambience_Waterwheel`
  (Wasserrad, Bewässerung, Hühner), `Ambience_PassWind` (Wind, Vögel). Musik: 2–4 ruhige Instrumental-Phrasen à 20–40 s.
  Stellvertreter (`StandIn/SFX_STANDIN_*`) sind synthetisch aus dem Prototyp — Klang ungeprüft.

- **Garage (Open Bay):** Werkbank 2,0 × 0,8 × 0,9 m; Reifenregal 1,8 × 0,5 × 2,0 m; Lacktafel 1,2 × 0,05 × 0,9 m (12 Felder); Motor auf Bock
  0,9 × 0,6 × 1,0 m; Schild „GARAGE · E“ 2,5 × 0,6 m. Je ≤ 1,5 k. **Entdeckungen** (Stellvertreter Raute): 20 Props, Liste `Discoveries.asset`.
- **Rennen:** Event-Pfeiler 6–8 m, Kontrollpunkt-Bogen, Start-Ziel-Banner, Pokal 0,4 m; Needle: Tribüne, Boxen, Brücke. ≤ 2 k. **Schanzen**
  (Stellvertreter Betonkeil): Erdwall/Holzrampe je Ort (Maße `Data/Gameplay/Ramps.asset`), Tempo-Schild, Lande-Tafel, Absperrung. ≤ 1,5 k.
- **Aus Phase 6 offen:** Spielfigur, Passanten/Tiere, Verkehrsautos, vorzerlegte Props + Baum, Ladeninnere, Ausstellungsautos, Kanalbrücken, Turm-Fernstufe.
- **Icons (Stellvertreter: gezeichnete Formen in `UiIcon`):** 22 SVG-Symbole 24 × 24 px, eine Strichstärke (Liste `Icon`-Enum).

## Für dich (Mensch)

1. **Phase 9 ausprobieren (~20 Min., Kopfhörer!):** `Boot` → ▶ Play.
   - **Menü:** **Esc** = alles pausiert (auch Ton). Links Play / Cars / Map / Records / Photo / Settings; **Esc** oder Continue = weiter.
   - **Cars:** Showroom → ein Auto antippen → **Test drive · 90 s** (oben links läuft die Zeit; Play → „End test drive").
   - **Map** (**M** oder Minikarte anklicken): ziehen, Mausrad; Flagge = Rennen („Go to the start"), Kreis-Symbol = Reiseziel;
     nach einer Runde durch Sakura erscheinen **?** = Hinweise mit Postkarte und 80-m-Kreis. Leeres Land antippen → Wegpunkt (Pfeil im HUD).
   - **HUD:** unten links Minikarte, unten rechts Drehzahl/Gang/Tempo/Nitro (blau). Rennen: Fahne an einem Ereignis-Pfeiler → **E**, Karte mit Start/Back.
   - **Ton:** Gas geben, durch die Gänge, Gas weg, an eine Wand fahren (Aufprall), Drift. Settings → Audio: 5 Regler.
     Klingen die Motoren nach Auto unterschiedlich? Stört die Wiederholung der Schleifen? (Mitschnitt: `Captures/p9-4/hachi-drive.wav`)
   - **Foto:** **P**, Enter → Ergebnis mit Download / Retake / Return.
2. **Handy** (wichtig für diese Phase): `node Tools/serve-web.mjs --lan` → die Zeile **„phone (use this)"** öffnen. Quer und hochkant:
   Pad links berühren = losfahren, rechts Bremse/Drift/Boost (vom Boost auf Drift rutschen), MENU oben rechts, Fotomodus mit Pad.
   Überlappt etwas? Sind Knöpfe zu klein (Settings → Controls → Touch buttons bis 140 %)?
3. **Selbst im Browser:** `Vorschau.command` (Port 8092, letzter Build). **4.** Noch offen aus früher: Abnahmen Phase 4–8, Hachi-Heckscheibe, alte Zweige `agent/*`. Commits liegen lokal; **Push** nur, wenn du es sagst.

## Web-Build

| Datum | Typ | Gesamt | wasm | data | Boot (lokal) |
|---|---|---|---|---|---|
| 2026-10-09 | Release, Phase 7 (Spielinhalt) | 53,97 MB | 5,76 MB | 48,02 MB | 0,8–1,1 s |
| 2026-10-10 | Release, Phase 8 (CrazyGames-SDK, Garage, Speichern, Rekorde) | 54,28 MB | 5,99 MB | 48,10 MB | 1,1 s |
| 2026-10-10 | Release, Phase 9 (Menü, HUD, Karte, Ton, Touch) | 55,91 MB | 6,07 MB | 49,64 MB | 0,8–1,1 s |
