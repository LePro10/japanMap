# Status

> Nur der **aktuelle** Stand — keine Geschichte (die steht in `git log`).
> Wird am Ende jeder Sitzung aktualisiert. Unter 80 Zeilen halten.

**Stand:** 2026-10-21 · **Phase 11 (Launch):** **UI-Neubau geplant** (Befund + Entwürfe: https://claude.ai/artifact/Um9YHs4PmbEL5AtV4s9aoS,
Bilder `Captures/ui-audit/`) · **jetzt bist du dran:** 4 Entscheidungen (Für dich, Punkt U) · danach Etappe 1 = 9 UI-Fehler

## Phase 11 — Launch

- [x] 1. QA · 2a. Store-Material · Name (D41) · 3a–c Absprungstellen · Midgame-Werbung (D42) · 3d Erster Eindruck (D43) · 3e Politur (D44)
- [ ] 2b. **Basic Launch** (du lädst hoch) · [ ] 2c. Zahlen nach 7 Tagen → H1–H5 prüfen (LAUNCH.md §7b)
- [x] 3f. Asset-Sprint 6 (D45): echte Figuren, Tiere, Verkehr.
- [x] 3g./3h. Wunschliste + Rückmeldung 2026-10-17 (D46): Burst, Stunts, Menü, Ton, Navi-Band, Straßen, Cockpit (Details: git log).
- [x] 3i. **Wunschliste 2026-10-17 (3)** (je Runde ein Agent im Editor + einer in der Projektkopie `../japanMap-cli`):
  Schaden mit Dellen am Treffpunkt, Räder fallen ab, Bäume brechen (D47) · Ladeseite mit Bewegung, Titel mit START/
  CONTINUE, Menü als Kacheln mit Sperren (D48) · Auto-Drive zum Wegpunkt (G halten) mit Kino-Kamera (D49) · Karriere:
  20 Schritte/9 Kapitel, überspringbar (D50) · Cockpit je Auto, F1 tief mit F1-Lenkrad, Kopf schaut in den Drift,
  Vibration (D51) · Reifen nicht mehr von innen, Scheinwerfer an (L) (D52) · Feinschliff Frontscheibe/HUD/Licht im
  Cockpit (D53) · Einmündungen ohne Kanten (47 → 8 Stufen ≤ 0,5 m), Startauto in Fahrtrichtung, Funaura-NavMesh (D54).

**Gemessen (2026-10-18, nach Runde 4):** EditMode 227/227 · PlayMode 231/244 (10 auf Abruf, 3 rot nur im Gesamtlauf,
einzeln grün: TouchMenu, Touch_AutoThrottle, RingLap) · Build 76,4 MB · **20,28 MB bis gameplayStart** (9,9 s, SDK grün) · Rauchprobe 0 Fehler (meldet „page loader stayed“: Signal `[Page] loaded` fehlt, im Bild aber keine Ladeseite).
**Nicht gemessen:** Chromebook-/Handy-FPS mit Scheinwerfern + Cockpit, Gamepad-Vibration im Browser.

## Offen / Gefunden

- **UI-Befund 2026-10-21 (9 Fehler, Etappe 1):** Einstellungen vom Titel liegen unter dem Titel (Ebene 30 > 20, unbedienbar) ·
  Autos: Liste unter dem Bildrand, Klick baut die Seite neu, „Drive" oben · gesperrter Textknopf bricht senkrecht um
  („Appearance · Unlocks…") · Titel-Tastenleiste über „Skip tutorial" · Kapitel-Banner über Sparks, zwei Toasts übereinander ·
  Countdown unter Toast, „F Get out" im Countdown · Handy hochkant: Knöpfe über Minikarte/Tacho · „Repair (T)" über Intro-Leiste ·
  Records-Zeile unter Kopfleiste, Notice rechts abgeschnitten. Ungeprüft: Mausrad scrollt das Menü im Browser nicht.
  Ursache der Klasse: keine festen HUD-Zonen, jede UI-Ebene setzt sich selbst; Menü ruft bei fast jedem Klick `Rebuild()`.
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

U. **UI-Neubau entscheiden** (Seite oben, ganz unten „Was du entscheiden musst"): (1) Look A Nachtglas oder B Straßenschild,
   (2) Gesperrtes verstecken + „New"-Punkt oder Schloss lassen (Regeländerung D48/D50), (3) Handy hochkant nur Menü, Fahren quer?,
   (4) Etappe 1 (die 9 Fehler) sofort starten? Meine Empfehlung: A · verstecken · nur quer · ja.
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
