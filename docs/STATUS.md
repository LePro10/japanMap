# Status

> Nur der **aktuelle** Stand — keine Geschichte (die steht in `git log`).
> Wird am Ende jeder Sitzung aktualisiert. Unter 80 Zeilen halten.

**Stand:** 2026-10-08 · **Phase:** 3 abgeschlossen, Fahrgefühl von dir freigegeben, **Phase 4 (Look und Asset-Pipeline) ist als Nächstes dran**

Phase 2 (Karte) ✅ von dir geprüft, FPS im Browser 144 (Monitor-Deckel).

## Phase 3 — Fahren ✅

- [x] 1. Rigidbody + Raycast-Federung + portiertes Arcade-Modell (D15; gegen WheelCollider gemessen) · Modelle ↔ Fahrwerte (D16)
- [x] 2. Hachi 86 fahrbar: Gas, Bremse/Rückwärts, Lenkung, Handbremsdrift, Stunt-Doppeltipp, Nitro, Respawn
- [x] 3. Eingabe: Tastatur, Gamepad, Touch (Stick + DRIFT/NITRO, zwei Finger getestet)
- [x] 4. Kameras: Verfolger (Cinemachine) + Cockpit, Zoom, Blick zurück
- [x] 5. Prüfstände als PlayMode-Tests: 134 Tests, alle zehn Autos auf ~1 % an den Prototyp-Zahlen
- [x] 6. Zehn Autos als Datensätze (`Data/Vehicles/*.asset`, Menü `JapanMap/Vehicles/Seed Fleet From Legacy`)
- [x] 7. Optik: Räder, Karosserie-Neigung, Bremslicht, Reifenspuren, Rauch/Staub

**Abnahme:** Ring 5 987 m Ø 89 km/h, max. 0,9 m neben der Mitte, kein Hängenbleiben; Bergpass-Abfahrt
3 501 m Ø 66 km/h (`AcceptanceDriveTests`). Tests EditMode 43/43, PlayMode 140/140 (+4 auf Abruf).
Bilder: `Captures/p3-drift.png`, `p3-touch-1.png`, `gate-p3.png`. Web: 289 fps (M4, Headless-GPU), 0 Fehler.

## Phase 4 — Look und Asset-Pipeline (als Nächstes)

- [ ] 1. Art Direction festschreiben (ART-DIRECTION.md)
- [ ] 2. Licht und Atmosphäre „Blaue Stunde nach Regen"
- [ ] 3. Vegetation (Zeder, Ahorn, Kirsche, Bambus, Gras/Reis)
- [ ] 4. Asset-Pipeline Blender → Unity (Skill `blender-asset`)
- [ ] 5. Bibliothek aus dem Asset-Sprint importieren (Platzhalter ersetzen)

## Web-Build

| Datum | Typ | Gesamt | wasm | data | Boot (lokal) |
|---|---|---|---|---|---|
| 2026-10-07 | Release, ganze Karte | 25,81 MB | 5,28 MB | 20,34 MB | 1,6 s |
| 2026-10-08 | Release, Karte + 10 Autos | 34,56 MB | 5,54 MB | 28,84 MB | 1,0 s |

## Offene Probleme / Gefunden

- **Download 34,6 MB** (Ziel Handy 20 MB): +8,5 MB durch die zehn Autos (alle im Build, inkl. Tuning-Teile, Hachi 137 k Dreiecke) → nur gewähltes Auto laden (Addressables), Texturen/LOD (Phase 4/10).
- **Straßendaten:** Höhenstufen an Kreuzungen (0,1–2,5 m) und 460 scharfe Kuppen-Knicke (+7 %→−7 % auf 2 m) → Phase 5.
- **Barrieren/Leitplanken zerbrechen noch nicht** (Prototyp: Smashables) → Phase 7. Bis dahin kann ein frontaler Treffer abrupt stoppen.
- Wassertiefe wird nicht gemessen (Wasser ohne Collider) → kein Aquaplaning/Spritzwasser bis Phase 4.
- `PathFollower` setzt nicht zurück, wenn er ansteht → für KI-Gegner (Phase 7) nachrüsten.
- `Placeholders/torii.prefab` bekommt bei jedem EditMode-Lauf neue fileIDs → nicht committen; Ursache im PropImporter.
- Draw Calls über Budget durch 977 Platzhalter-Props (~1 800) → echte Modelle mit Instancing (Phase 4).
- Terrain bis 1,4 M Dreiecke (Niedrig 800 k) → `pixelError` je Stufe (Phase 10).
- Hochstraße ohne Brüstungen, Stadtplatte ohne Böschung → Phase 5. Reisfeldränder treppig, kein Triplanar am Fels → Phase 4.
- Ungeprüft im Batchmode (Editor war offen): Sperrklinke in `verify.mjs`, `capture.mjs --viewpoint`.
- Web-Seite ist noch Unitys Standardvorlage → Phase 9/10. Zwölf alte Zweige `agent/*`: Löschen entscheidest du.

## Für dich (Mensch)

1. **Fahrgefühl testen (die wichtigste Abnahme, ~15 Min.).** Unity-Editor offen lassen, oben
   auf ▶ (Play) drücken — die Szene `Boot` muss geöffnet sein (Datei → Boot.unity). Du startest
   im **Hachi 86** auf einer breiten Stadtstraße. Tasten: **W/S** Gas/Bremse (S im Stand =
   rückwärts), **A/D** lenken, **Leertaste** Handbremse, **Leertaste 2× schnell** = Stunt-Modus,
   **Shift** Nitro, **C** Kamera (Cockpit), **B** halten = nach hinten schauen, **Mausrad** Zoom,
   **R** zurück auf die Straße. Gamepad geht auch (Trigger, linker Stick, A = Handbremse).
   Bitte darauf achten und kurz notieren:
   - **Drift:** Bei ~80 km/h D + Leertaste kurz → kommt das Heck? Kannst du den Drift mit
     Gas und Gegenlenken halten und wieder fangen? Zu leicht / zu schwer?
   - **Lenkung:** direkt genug? Schaukelt das Auto auf der Geraden?
   - **Offroad:** von der Straße in die Wiese → zu „klebrig" (Sumpf) oder ok?
   - **Kamera:** angenehm, zu nah/fern, zu träge?
   Gern auch den **Kaze 35 Drift** (sehr loses Heck) und den **Yama Cruiser** (schwer, Offroad):
   im Inspector am Objekt `Player` → `PlayerCarSpawner` → `Car Id` = `kaze` bzw. `yama`, dann Play.
   Deine Antworten übersetze ich in Zahlen und messe nach.
2. **Handy (optional, 5 Min.):** `node Tools/serve-web.mjs --lan` starten, angezeigte Adresse am
   Handy öffnen (gleiches WLAN), Bildschirm berühren → Stick links, DRIFT/NITRO rechts.
3. **Optik-Frage zum Hachi:** Von hinten sieht man durch die Heckscheibe in den Innenraum (Bild
   `Captures/web-smoke.png`). Wirkt das richtig oder fehlt dort ein Dach?
4. Commits liegen lokal; **Push** nur, wenn du es sagst.
