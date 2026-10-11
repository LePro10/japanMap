# Status

> Nur der **aktuelle** Stand — keine Geschichte (die steht in `git log`).
> Wird am Ende jeder Sitzung aktualisiert. Unter 80 Zeilen halten.

**Stand:** 2026-10-11 · **Phase 11 (Launch):** Agenten-Teil fertig · **jetzt bist du dran:** Name, Hochladen, Geräte-Test

## Phase 11 — Launch

- [x] 1. **QA-Durchgang** → [QA.md](QA.md): jede Abnahme der Phasen 2–10 + jede CrazyGames-Regel mit Beleg. Dabei
  behoben: AdBlock (kein toter Werbe-Knopf, D40), Menü ohne Esc (Desktop-Knopf MENU, Pause bei Mausfang-Verlust),
  Auto unter nachgeladener Straße, Fußgänger-NavMesh auf `meiji-south`, Karte auf Tablet hochkant, Ton-Ruckler (Smash
  2,35 → 1,2 ms), 3D-Töne sprangen, `UiPanel.Size`, Wackel-Tests. Langsames Netz (5 Mbit/s): Auto + Straßen zuerst.
- [x] 2a. **Store-Material** → [LAUNCH.md](LAUNCH.md): Texte (Englisch), Steuerung, Tags, Hochlade-Liste;
  Cover 3 Formate + 2 Videos (15,7 s) aus dem echten Spiel in `Captures/launch/` (`Tools/store-media.mjs`).
- [ ] 2b. **Basic Launch** (du lädst hoch) · [ ] 2c. Spielzeit/Wiederkehr nach 7 Tagen (Zahlen von dir, LAUNCH.md §7)
- [ ] 3. Die drei größten Absprungstellen beheben, dann Full Launch.
- [ ] Geräte-Test (Handy, Tablet, Chromebook/iGPU) — Anleitung unten.

**Gemessen (2026-10-11, Gate):** EditMode 137/137 · PlayMode 196/203 + 7 auf Abruf, **0 rot** (Fußgänger 0 auf der Fahrbahn, Smash 0,99 ms) · Build 82,2 MB / 96 Dateien, **Start 18,4 MB**
bis gameplayStart · Rauchprobe Niedrig 355–368 fps, Hoch 116 fps (M4), 0 Fehler · Speichern lokal + SDK grün ·
SDK gesperrt (AdBlock): startet nach 7,4 s, spielbar · 6 + 1 Prüfgrößen bei DPR 1 lesbar (`Captures/p11-sizes/`).
Budgets bei 1080p: Niedrig 3/50 Blickpunkte über 400 Draw-Calls (max 504 funaura-mole), Dreiecke alle < 800 k;
Hoch 20/50 über 3 M Dreiecke → Entscheidung nach deinem iGPU-/Handy-Test.

## Offen / Gefunden

- **Esc im CrazyGames-Vollbild:** abgesichert (MENU-Knopf), im QA-Tool gegenprüfen. **AdBlock mit echtem SDK** nur im
  QA-Tool prüfbar (lokal meldet das SDK nie einen AdBlocker).
- **Autonamen** nah an echten Marken (GT-R34, STi, …) — Vorschlag LAUNCH.md §2, nur mit deinem Wort.
- Mit gesperrtem SDK 6 s schwarzer Start (Wartezeit aufs SDK) — innerhalb der 20 s; kürzen, falls Zahlen es zeigen.
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

## Für dich (Mensch)

1. **Spielnamen wählen** (LAUNCH.md §2; Vorschlag „Ameagari Drive“). Schreib mir den Namen — ich setze ihn in Cover
   und Videos ein (10 s) und in den Build (`productName`).
2. **Ausprobieren (~10 Min.):** `node Tools/serve-web.mjs --preview` → http://127.0.0.1:8092. Neu: oben rechts
   „MENU · Esc“; beim Gehen (Maus gefangen) Esc → Menü geht auf; Karte (M) auf einem hochkant gehaltenen Tablet.
3. **CrazyGames-QA-Tool** (developer.crazygames.com → Spiel anlegen → Datei hochladen: ZIP vom **Inhalt** von
   `Builds/Web`): prüfen (a) Werbung im Ergebnis-Bildschirm (Demo), (b) mit **AdBlocker an** (uBlock Origin):
   Spiel läuft, kein „Watch ad“-Knopf, auf der Autoseite steht der Hinweis, (c) **Vollbild-Knopf** von CrazyGames,
   dann Esc und den MENU-Knopf, (d) Login + Speichern, Neu laden → Fortschritt da, (e) Foto (P → Enter → Download).
4. **Hochladen = Basic Launch:** Liste LAUNCH.md §1 (Texte zum Einfügen, Cover/Videos in `Captures/launch/`).
5. **Geräte-Test** (wenn möglich je 5 Min.): `node Tools/serve-web.mjs --lan`, Zeile „phone (use this)“ öffnen.
   - **Handy** quer und hochkant: läuft es flüssig? Knöpfe treffbar? Ton nach App-Wechsel wieder da?
   - **Tablet** hochkant: Karte (MAP) — Ortskarte unter der Karte, „Travel“ drückbar?
   - **Laptop mit Intel/AMD-Grafik** oder Chromebook: Settings → Graphics zeigt die Auto-Stufe — welche, ruckelt es?
   Schreib mir je Gerät: Modell, „flüssig/ruckelt“, was störte.
6. **Nach 7 Tagen:** die Zahlen aus LAUNCH.md §7 schicken → ich finde die drei größten Absprungstellen (Phase 11/3).
7. Noch offen von früher: Abnahmen Phase 4–10 (Fahrgefühl, Ton mit Kopfhörern), alte Zweige `agent/*`. **Push** nur auf dein Wort.

## Web-Build

| Datum | Typ | Gesamt | Start bis gameplayStart | Boot (lokal) |
|---|---|---|---|---|
| 2026-10-10 | Release, Phase 10 (Streaming, gzip-Gelände, Shader) | 82,2 MB in 96 Dateien | 18,4 MB | 0,5–0,8 s |
| 2026-10-11 | Release, Phase 11 (QA-Fixes) | 82,2 MB in 96 Dateien | 18,45 MB | 0,5 s |
