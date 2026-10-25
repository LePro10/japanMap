# Status

> Nur der **aktuelle** Stand — keine Geschichte (die steht in `git log`).
> Wird am Ende jeder Sitzung aktualisiert. Unter 80 Zeilen halten.

**Stand:** 2026-10-25 · **Phase 11 (Launch) · autonomer Verbesserungslauf** (Welle 1: 30 Fehler aus dem Audit, Welle 2:
Leistung/Größe, Welle 3: Tiere + Stromkabel, Welle 4: Geist, Touch-Symbole, Feinregler, Start ≤ 20 MB, UI hochkant; Details: git log) · UI „Night Meet": https://claude.ai/artifact/Um9YHs4PmbEL5AtV4s9aoS ·
**jetzt bist du dran:** Punkt U und V

## Phase 11 — Launch

- [x] 1. QA · 2a. Store-Material · Name (D41) · 3a–c Absprungstellen · Midgame-Werbung (D42) · 3d Erster Eindruck (D43) · 3e Politur (D44)
- [ ] 2b. **Basic Launch** (du lädst hoch) · [ ] 2c. Zahlen nach 7 Tagen → H1–H5 prüfen (LAUNCH.md §7b)
- [x] 3f. Asset-Sprint 6 (D45): echte Figuren, Tiere, Verkehr.
- [x] 3g./3h. Wunschliste + Rückmeldung 2026-10-17 (D46): Burst, Stunts, Menü, Ton, Navi-Band, Straßen, Cockpit (Details: git log).
- [x] 3i. Wunschliste 2026-10-17 (3), D47–D54: Schaden, Titel/Menü-Kacheln, Auto-Drive, Karriere, Cockpit, Reifen/Licht,
  Einmündungen (Details: git log). · [x] 3j. **UI-Neubau (D55/D56)**: alle Etappen umgesetzt (Agent B: Einstellungen,
  Ladeseite, Postkarten, Stempelbuch).

**Gemessen (2026-10-25):** voller PlayMode 237/248 (rot nur Zeitbudget Smash/Schaden unter Last, allein grün) · neue Tests
Straßen-Eckpunkte, Bank-Figur, REPAIR/Turn-Karte je Form, Tagesbonus grün (vorher rot gegengeprüft) · Web 75,72 MB in
106 Dateien, Start 18,88 MB, **19,94 MB bis gameplayStart** (SDK grün, Ziel ≤ 20 erreicht) · Rauchprobe 0 Fehler, Boot 2,6 s.
**Nicht gemessen:** voller PlayMode-Lauf nach Welle 2/3 · Chromebook/Handy-FPS · Gamepad im neuen Menü · Touch-Größen am echten Handy.

## Offen / Gefunden

- **UI:** Kino-/Cockpit-Ansichten nicht neu gestaltet · im Editor zeigen kleine
  Texte Striche (dynamischer Schrift-Atlas; Web-Build sauber).
- **Tests:** ein versehentlicher Gesamtlauf (Filter „Map“) hing nach 3418 s Spielzeit — welcher Test, ist ungeklärt
  (Werkzeug sperrt den Filter jetzt). AutoDriveTests gelegentlich wackelig. Zeitbudget-Tests Smash/VehicleDamage (2 ms)
  rot, wenn der Rechner ausgelastet ist. Verkehrstest zuletzt zweimal 100 % auf der Fahrbahn.
- Straßen: 8 Reststufen ≤ 0,5 m an Einmündungen (5 an der Ringstraße) — feinerer Mündungs-Querschnitt (D54).
- Schaden: Stoßstange reißt beim zweiten harten Treffer ab (2,2 ms); Türen/Haube noch nicht. Store-Videos ohne Auto-Drive-Kinofahrt. Modelle: Augpunkte/Rückfahrgläser fehlen.
- Politur offen ([POLISH.md](POLISH.md)): Musik/Umgebungstöne (Clips fehlen),
  3D-Hebebühne in der Garage, Store-Videos aus dem neuen Look.
- Neu in der Welt: 50 Tiere (Regeln `Data/Life/AnimalSpots.asset`; Vögel fliegen auf, Katzen/Hunde/Hühner springen vor schnellen Autos zur Seite — Sprung nur im Test belegt, kein Bild) und durchhängende Stromkabel an der
  Landleitung (26 Masten, 25 Felder, 5400 Dreiecke; Masten quer gedreht wie im Prototyp). Verkehrsposten noch ohne Platz.
  Aus früher: ASTRA §11, Gegner-Motoren, Leuchtturm, Angler, Musik; ASTRA E01/E08–E17, CI → Phase 12.
- Leistung: WebGPU später; Handy DXT→ASTC nur nach Messung (D37); Hoch-Budget nach deinem iGPU-Test.

### Für die Asset-Sitzung (Maße stehen in den Daten)

- **Töne** (heute aus `Tools/render-sounds.mjs`; echte Aufnahmen gleichen Namens ersetzen sie — CC0/eigen, `Assets/_Project/Art/Audio/<Name>.wav`, mono 44,1/48 kHz): Motor je Auto (`Engine_<auto>_idle`
  1,0 s; `_on0…3` 0,8 s / `_off0…3` 1,0 s bei 30/50/70/92 % Drehzahl; `Lift_<auto>` 0,9 s); Welt 3–6 s `Ambience_Workshop`,
  `_NeonHum`, `_Harbour`, `_Waterwheel`, `_PassWind`; Musik 2–4 Phrasen à 20–40 s; **Intro:** `Whoosh_SlowMo` 0,6 s.
- Asset-Sprint 6: Props (Straßendetails, Rennen, Garage, Entdeckungen) liegen als Prefabs bereit, noch nicht platziert.
  Offen: Schanzen-Deko, Ladeninnere, Icons.

## Für dich (Mensch)

U. **Neues UI anspielen (15 Min.):** http://127.0.0.1:8092 (läuft schon; sonst `node Tools/serve-web.mjs --preview`), privates
   Fenster. Bitte je Punkt „ok" oder was stört: Titel · Esc-Menü (Kacheln, Q/E) · Garage (Auto antippen, kaufen) · Karte (M,
   Punkt antippen) · Fahren (Tacho, Minikarte, Drift-Telop, Burst = Shift doppelt, K = alle Tasten) · ein Rennen bis zum
   Ergebnis · Einstellungen. Gesperrtes ist jetzt ausgeblendet (pinker Punkt = neu frei).
V. **Zwei Entscheidungen (je ein Wort):** (a) Medaillenstufen: ein Worker wollte „Silber“ für 10 % in „Bronze“ ändern
   (zurückgenommen, sieht wie Absicht aus) — so lassen? (b) `terrain.jmt` (unkomprimierte Ersatzdatei für alte Browser ohne
   DecompressionStream, z. B. Safari < 16.4) weglassen? Spart 18,9 MB im Gesamtpaket, nicht im Start.
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
| 2026-10-21 | Release, UI „Night Meet" komplett (D56) | 77,73 MB in 104 Dateien | 20,36 MB (SDK) | 2,6 s (Rauchprobe) |
| 2026-10-24 | Release, Welle 1+2 (Fehler, Medium-Stufe, Hafen-Modelle) | 77,40 MB in 106 Dateien | 20,44 MB (SDK) | Rauchprobe 0 Fehler |
| 2026-10-25 | Release, Welle 4 (Straßen verschweißt, Gelände JMT3 + gzip -9) | 75,72 MB in 106 Dateien | 19,94 MB (SDK) | 2,6 s (Rauchprobe) |
