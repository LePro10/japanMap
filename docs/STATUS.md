# Status

> Nur der **aktuelle** Stand — keine Geschichte (die steht in `git log`).
> Wird am Ende jeder Sitzung aktualisiert. Unter 80 Zeilen halten.

**Stand:** 2026-10-21 · **Phase 11 (Launch) · UI-Neubau (D55):** Etappe 1 fertig (9 Fehler), neue Karte im Spiel ·
Richtung „Night Meet": https://claude.ai/artifact/Um9YHs4PmbEL5AtV4s9aoS · **jetzt bist du dran:** Punkt U

## Phase 11 — Launch

- [x] 1. QA · 2a. Store-Material · Name (D41) · 3a–c Absprungstellen · Midgame-Werbung (D42) · 3d Erster Eindruck (D43) · 3e Politur (D44)
- [ ] 2b. **Basic Launch** (du lädst hoch) · [ ] 2c. Zahlen nach 7 Tagen → H1–H5 prüfen (LAUNCH.md §7b)
- [x] 3f. Asset-Sprint 6 (D45): echte Figuren, Tiere, Verkehr.
- [x] 3g./3h. Wunschliste + Rückmeldung 2026-10-17 (D46): Burst, Stunts, Menü, Ton, Navi-Band, Straßen, Cockpit (Details: git log).
- [x] 3i. Wunschliste 2026-10-17 (3), D47–D54: Schaden, Titel/Menü-Kacheln, Auto-Drive, Karriere, Cockpit, Reifen/Licht,
  Einmündungen (Details: git log). · [ ] 3j. **UI-Neubau (D55)**: Etappe 1 ✔, Karten-Render ✔, Etappen 2–6 offen.

**Gemessen (2026-10-21, UI Etappe 1):** EditMode-Gruppen 45/45 (Gesamtlauf nur in der Projektkopie, LESSONS) · PlayMode
UI/Meldungen/Rennen/Karte 48/48 · Web 76,96 MB, Start 19,18 MB · Rest wie 2026-10-18 (EditMode 227, PlayMode 231/244).
**Nicht gemessen:** Chromebook-/Handy-FPS mit Scheinwerfern + Cockpit, Gamepad-Vibration im Browser, SDK-Lauf nach D55.

## Offen / Gefunden

- **UI-Neubau (D55):** Etappe 1 erledigt (Titel/Einstellungen, Garage-Klick, gesperrte Knöpfe, Meldungen, Countdown,
  Repair im Intro, Hochkant-Spalte, Seiten oben, Schrift-Test). Karte: Offline-Render nachgeladen (0,57 MB), Markierungen
  und Kartenseite noch im alten Stil. **Als Nächstes:** Etappe 2 Fundament „Night Meet" (Schriften Archivo + Dela Gothic
  One, Farben, Bausteine, HUD-Zonen) → Karte fertig (Markierungen, Ticket, Legende) → HUD → Menü/Garage → Titel/Ergebnis.
  Gefunden: Hochkant-Knopfreihe (LIGHT/CAM/RESET/MENU) zu eng, Beschriftungen überlappen sich.
- Neu (2026-10-18): Gesamtlauf PlayMode hat 3 reihenfolge-abhängige Rote (einzeln grün): `TouchMenuTests`,
  `PlayerDriveTests.Touch_AutoThrottle`, `AcceptanceDriveTests.RingLap` (6,8 m neben der Mitte bei (482, −751)) →
  Ursache suchen (welcher Test vorher Zustand hinterlässt). Verkehrstest knapp (93–99 % auf der Fahrbahn, Soll 95 %).
- HUD: vor „Saved on this device“ fehlt ein Zeichen (Kästchen statt Symbol, `Captures/web-smoke.png`).
- Straßen: 8 Reststufen ≤ 0,5 m an Einmündungen (5 an der Ringstraße) — feinerer Mündungs-Querschnitt (D54).
- Schaden: Türen/Haube fallen nicht ab; Figur auf zerbrochener Bank schwebt. Kino-Kamera: „Straßenrand“ zeigt das Auto
  manchmal zu klein. Store-Videos ohne Auto-Drive-Kinofahrt. Modelle: Augpunkte/Rückfahrgläser fehlen.
- Politur offen ([POLISH.md](POLISH.md)): Kabel zwischen Masten, Touch-Knöpfe mit Icons, Musik/Umgebungstöne (Clips fehlen),
  3D-Hebebühne in der Garage, Geist der Bestzeit, Feinregler Fahrhöhe/Sturz, Store-Videos aus dem neuen Look.

- Krähen, Tauben, Shiba und Verkehrsposten (Wave) sind importiert, haben aber noch keinen Platz in der Welt (ActorSet kennt sie nicht).
- Leistung: WebGPU später; Handy DXT→ASTC nur nach Messung (D37); Hoch-Budget (20/50 Blickpunkte > 3 M) nach deinem
  iGPU-Test. Niedrig-DC funaura-mole 504.
- Aus früher: Ride-Höhe „Dirt“, ASTRA §11, Gegner-Motoren, Leuchtturm, Angler, Musik; ASTRA E01/E08–E17 → Phase 12; CI → Phase 12.

### Für die Asset-Sitzung (Maße stehen in den Daten)

- Hachi hat gemessen 44 000 Eckpunkte (nicht 176 000); Autos zusammen 14,0 MB nach Entdoppeln der Räder (D52).
  Ziel Start ≤ 20 MB bleibt.
- **Töne** (heute aus `Tools/render-sounds.mjs`; echte Aufnahmen gleichen Namens ersetzen sie — CC0/eigen, `Assets/_Project/Art/Audio/<Name>.wav`, mono 44,1/48 kHz): Motor je Auto (`Engine_<auto>_idle`
  1,0 s; `_on0…3` 0,8 s / `_off0…3` 1,0 s bei 30/50/70/92 % Drehzahl; `Lift_<auto>` 0,9 s); Welt 3–6 s `Ambience_Workshop`,
  `_NeonHum`, `_Harbour`, `_Waterwheel`, `_PassWind`; Musik 2–4 Phrasen à 20–40 s; **Intro:** `Whoosh_SlowMo` 0,6 s.
- **Asset-Sprint 6 ist in Unity** (2026-10-16, Import: Menü „JapanMap/Art/Import Figures + Traffic“). Die Props
  (Straßendetails, Rennen, Garage, Entdeckungen) liegen als Prefabs bereit, sind aber noch nicht in der Welt platziert.
  Offen: Schanzen-Deko, Ladeninnere, Icons.

## Für dich (Mensch)

U. **UI-Neubau** (Seite oben, unten „Noch zu entscheiden"): (1) passt „Night Meet" (Farben, Schrift, sechs Elemente)?
   (2) Gesperrtes verstecken + pinker „NEW"-Punkt statt Schloss (ändert D48/D50)? (3) Handy hochkant nur Menü, Fahren quer?
   Meine Empfehlung: ja · verstecken · nur quer. Kurz anspielen (`node Tools/serve-web.mjs --preview`, :8092): Titel →
   Settings → Back; Esc → Cars → ein Auto antippen; M = neue Karte.
0. **Anspielen (20 Min.)** — Spiel-Teile (UI kommt neu, das brauchst du nicht bewerten): `node Tools/serve-web.mjs --preview`,
   http://127.0.0.1:8092: (c) **Crash** mit 100 km/h, dann **T**, (d) **Auto-Drive** (M → Punkt → „Auto-drive", G halten, C),
   (e) **Cockpit** (C) in Hachi/Kaze/Hanami/Hauler, (f) **Licht** (L, 2× L), (g) Reifen. Je Punkt „ok" oder was stört.
   **Handy:** dasselbe mit `--preview --public` (BOOST doppelt = Burst, STUNT-Knopf).
3. **CrazyGames-QA-Tool** (developer.crazygames.com → ZIP vom **Inhalt** von `Builds/Web`): (a) Werbung im Ergebnis-
   Bildschirm, (b) AdBlocker an: Sofortstart, kein „Watch ad“, (c) Vollbild, dann Esc und MENU, (d) Login + Speichern,
   (e) Foto (P → Enter). Je Punkt ok / was falsch war.
4. **Hochladen = Basic Launch:** LAUNCH.md §1. Cover/Videos zeigen noch nicht das Intro — sag Bescheid, wenn ich neue
   aus dem Intro schneiden soll (`Tools/store-media.mjs`; der Sprung in Zeitlupe wäre ein starkes Vorschauvideo).
5. **Auszahlung** (Tipalti, Portal → Account → Billing) · **Geräte-Test** · **nach 7 Tagen/≥ 500 Plays:** LAUNCH.md §7 → H1–H5.
7. Noch offen von früher: Abnahmen Phase 4–10 (Fahrgefühl, Ton), alte Zweige `agent/*`. **Push** nur auf dein Wort.

## Web-Build

| Datum | Typ | Gesamt | Start bis gameplayStart | Boot (lokal) |
|---|---|---|---|---|
| 2026-10-18 | Release, Runden 1–4 (Schaden, Titel, Auto-Drive, Karriere, Cockpit, Licht, Einmündungen) | 76,4 MB in 102 Dateien | 20,28 MB | 3,7 s (Rauchprobe) |
| 2026-10-21 | Release, UI Etappe 1 + Karten-Render (nachgeladen) | 76,96 MB in 103 Dateien | 19,18 MB (Bericht „start") | — |
