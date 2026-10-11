# Status

> Nur der **aktuelle** Stand — keine Geschichte (die steht in `git log`).
> Wird am Ende jeder Sitzung aktualisiert. Unter 80 Zeilen halten.

**Stand:** 2026-10-11 · **Phase 11 (Launch):** Name gesetzt, 3 Absprungstellen vorab behoben · **jetzt bist du dran:** QA-Tool, Hochladen, Geräte, nach 7 Tagen Zahlen

## Phase 11 — Launch

- [x] 1. **QA-Durchgang** → [QA.md](QA.md): jede Abnahme der Phasen 2–10 + jede CrazyGames-Regel mit Beleg. Dabei
  behoben: AdBlock (kein toter Werbe-Knopf, D40), Menü ohne Esc (Desktop-Knopf MENU, Pause bei Mausfang-Verlust),
  Auto unter nachgeladener Straße, Fußgänger-NavMesh auf `meiji-south`, Karte auf Tablet hochkant, Ton-Ruckler (Smash
  2,35 → 1,2 ms), 3D-Töne sprangen, `UiPanel.Size`, Wackel-Tests. Langsames Netz (5 Mbit/s): Auto + Straßen zuerst.
- [x] 2a. **Store-Material** → [LAUNCH.md](LAUNCH.md): Texte (Englisch), Steuerung, Tags, Hochlade-Liste;
  Cover 3 Formate + 2 Videos (15,7 s) aus dem echten Spiel in `Captures/launch/` (`Tools/store-media.mjs`).
- [x] 2b-Vorbereitung: **Name „Ameagari Drive“** (Build, Menü, Ladebildschirm, Foto, Cover, Videos) und Autonamen ohne
  Markenkürzel (D41, Wache `StoreNamesTests`).
- [ ] 2b. **Basic Launch** (du lädst hoch) · [ ] 2c. Spielzeit/Wiederkehr nach 7 Tagen (Zahlen von dir, LAUNCH.md §7)
- [x] 3a–c. **Drei Absprungstellen vorab** (LAUNCH.md §7a, ohne deine Zahlen gemessen): gesperrtes SDK startet sofort
  (7,7 → 4,2 s, normal 4,4 s); Tastenkappen für neue Desktop-Spieler; Pfeil „Next: <Rennen>“ nach 25 s Fahrt.
- [x] 3d-Vorab (ohne deine Zahlen): H1 Handy-Start gemessen — 5 Mbit/s 33,6 s, 20 Mbit/s 11,4 s, reine Bytezahl; Gelände-
  Vorladen brachte 0 s (verworfen), Unity-Logo raus (−0,04 MB), Build-Bericht zeigt jetzt den Inhalt der Startdaten.
- [ ] 3d. Mit deinen Zahlen: Hypothesen H1–H5 prüfen (LAUNCH.md §7b), dann Full Launch (CrazyGames entscheidet).
- [ ] Geräte-Test (Handy, Tablet, Chromebook/iGPU) — Anleitung unten.

**Gemessen (2026-10-11, Teil 2):** EditMode 141/141 · PlayMode 201/208 + 7 auf Abruf, **0 rot** · Build 82,2 MB / 96 Dateien,
**Start 18,42 MB** bis gameplayStart (Teil 3) · Rauchprobe Niedrig 354–364 fps (3×), Hoch 106–110 fps (M4), 0 Fehler · Speichern
lokal + SDK grün · Streaming 58 Szenen grün · SDK gesperrt: 4,2 s (normal 4,4 s, gleiche Messart) · 5 Mbit/s + CPU ÷4:
34 s bis spielbar (H1) · 7 Prüfgrößen grün (`Captures/p11-sizes/`).
Budgets bei 1080p: Niedrig 3/50 Blickpunkte über 400 Draw-Calls (max 504 funaura-mole), Dreiecke alle < 800 k;
Hoch 20/50 über 3 M Dreiecke → Entscheidung nach deinem iGPU-/Handy-Test.

## Offen / Gefunden

- **Esc im CrazyGames-Vollbild:** abgesichert (MENU-Knopf), im QA-Tool gegenprüfen. **AdBlock mit echtem SDK** nur im
  QA-Tool prüfbar (lokal meldet das SDK nie einen AdBlocker).
- **Langsames Handy-Netz:** 34 s bis spielbar bei 5 Mbit/s (H1) — handeln, wenn deine Zahlen Handy-Abbrüche zeigen.
- **Midgame-Werbung** ist für Full Launch optional (CrazyGames-Doku); D35 hat sie bewusst weggelassen — Einnahmen-Frage für dich.
- Leistung: WebGPU später neu versuchen; Handy DXT→ASTC nur nach Messung (D37); Niedrig-DC funaura-mole 504.
- Aus früher: Ride-Höhe „Dirt“, ASTRA §11-Messungen, Gegner-Motoren, Foto ohne Mehrfach-Abtastung, Leuchtturm,
  Funaura-Angler, Musik/Welt-Töne, Midgame-Werbung bewusst weg (D35); ASTRA E01/E08–E12/E15–E17 → Phase 12;
  Stadtplatte ohne Böschung, treppige Reisfeldränder, `commons-drive`-Kante. CI (GameCI) → Phase 12.

### Für die Asset-Sitzung (unverändert, Lagen stehen in den Daten)

- **Töne** (CC0/eigen, `Assets/_Project/Art/Audio/<Name>.wav`, mono 44,1/48 kHz): Motor je Auto (`Engine_<auto>_idle`
  1,0 s; `_on0…3` 0,8 s / `_off0…3` 1,0 s bei 30/50/70/92 % Drehzahl; `Lift_<auto>` 0,9 s); Welt 3–6 s `Ambience_Workshop`,
  `_NeonHum`, `_Harbour`, `_Waterwheel`, `_PassWind`; Musik 2–4 Phrasen à 20–40 s.
- **Garage** (Werkbank 2,0×0,8×0,9 m, Reifenregal 1,8×0,5×2,0, Lacktafel 1,2×0,05×0,9, Motor auf Bock 0,9×0,6×1,0,
  Schild 2,5×0,6; je ≤ 1,5 k) · **Rennen** (Pfeiler 6–8 m, Kontrollbogen, Banner, Pokal 0,4 m; ≤ 2 k) · **Schanzen**
  (`Ramps.asset`) · **20 Entdeckungs-Props** (`Discoveries.asset`) · Spielfigur, Passanten, Verkehrsautos, Ladeninnere,
  Kanalbrücken · **Icons** 22 SVG 24×24 (`Icon`-Enum) — neu: ein **Menü-Symbol** (☰, 24×24) für den Desktop-Knopf.
- Optional: Nummernschilder spielen auf Modelle an (`86-86`, `34-34`, `80-80` in `ArtSource/cars/blender/cars.py`) — neutrale
  Nummern wählen (z. B. `21-07`), Autos neu exportieren.

## Für dich (Mensch)

1. **Ausprobieren (~5 Min.):** `node Tools/serve-web.mjs --preview` → http://127.0.0.1:8092 (am besten im privaten Fenster =
   neuer Spieler). Neu: Ladebildschirm „AMEAGARI DRIVE“, unten Tastenkappen, nach ~25 s Fahrt „Next: … follow the arrow“.
   Stört dich etwas davon? Sag es — ich schreibe es fest.
2. **CrazyGames-QA-Tool** (developer.crazygames.com → Spiel anlegen → ZIP vom **Inhalt** von `Builds/Web`): prüfen
   (a) Werbung im Ergebnis-Bildschirm (Demo), (b) **AdBlocker an** (uBlock Origin): Spiel startet ohne Warten, kein
   „Watch ad“-Knopf, (c) **Vollbild-Knopf**, dann Esc und MENU, (d) Login + Speichern, neu laden → Fortschritt da, (e) Foto
   (P → Enter → Datei heißt `Ameagari-Drive_…png`). Schreib mir je Punkt ok / was falsch war.
3. **Hochladen = Basic Launch:** Liste LAUNCH.md §1 (Name, Texte, Cover/Videos in `Captures/launch/` — alle mit neuem Titel).
4. **Auszahlung einrichten** (für Full Launch nötig, sobald Geld fließt): Portal → Account → **Billing** → Tipalti-Assistent
   (Name/Firma, Adresse, Land, Steuerformular wählt der Assistent; Auszahlung ab 100 € per Überweisung/PayPal).
5. **Geräte-Test** (je 5 Min.): `node Tools/serve-web.mjs --lan`, Zeile „phone (use this)“ öffnen — Handy quer + hochkant,
   Tablet hochkant (Karte), Laptop mit Intel/AMD-Grafik (Settings → Graphics: welche Stufe, ruckelt es?). Je Gerät: Modell,
   flüssig/ruckelt, was störte. Danach entscheide ich Hoch-Budget und DXT→ASTC.
6. **Nach 7 Tagen und ≥ 500 Plays** (sonst nach 21 Tagen): Zahlen aus LAUNCH.md §7 (Plays Handy/Desktop, Ø Spielzeit,
   Conversion ≥ 1 min, Tag 1/7, Bewertung, Kommentare, Browser) → ich prüfe H1–H5.
7. **Midgame-Werbung?** Für Full Launch nicht Pflicht; bringt aber Einnahmen (max. 1 je 3 min, SDK regelt). Ja/nein genügt.
8. Noch offen von früher: Abnahmen Phase 4–10 (Fahrgefühl, Ton mit Kopfhörern), alte Zweige `agent/*`. **Push** nur auf dein Wort.

## Web-Build

| Datum | Typ | Gesamt | Start bis gameplayStart | Boot (lokal) |
|---|---|---|---|---|
| 2026-10-10 | Release, Phase 10 (Streaming, gzip-Gelände, Shader) | 82,2 MB in 96 Dateien | 18,4 MB | 0,5–0,8 s |
| 2026-10-11 | Release, Phase 11 (QA-Fixes) | 82,2 MB in 96 Dateien | 18,45 MB | 0,5 s |
| 2026-10-11 | Release, Phase 11/2 (Name, Lotse, SDK-Sofortstart) | 82,2 MB in 96 Dateien | 18,45 MB | 0,5 s |
