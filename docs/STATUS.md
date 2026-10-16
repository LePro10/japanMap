# Status

> Nur der **aktuelle** Stand — keine Geschichte (die steht in `git log`).
> Wird am Ende jeder Sitzung aktualisiert. Unter 80 Zeilen halten.

**Stand:** 2026-10-14 · **Phase 11 (Launch):** große Politur durch ([POLISH.md](POLISH.md) §5) · **jetzt bist du dran:**
anspielen (Desktop + Handy), dann hochladen

## Phase 11 — Launch

- [x] 1. QA-Durchgang → [QA.md](QA.md) · [x] 2a. Store-Material → [LAUNCH.md](LAUNCH.md) · [x] Name „Ameagari Drive“ (D41)
- [x] 3a–c. Drei Absprungstellen vorab (SDK-Sofortstart, Tastenkappen, Lotse) · [x] Midgame-Werbung an Pausen (D42)
- [x] 3d. **Erster Eindruck** nach deinen Handy-Bildern ([PLAYER.md](PLAYER.md) = Analyse CrazyGames-Spieler, D43):
  - **Intro „First Drive“ zurück** (war nie portiert): rollender Start, Titel, Nitro, Sprung über den Coast Kicker in
    Zeitlupe, Rolle per Doppeltipp, Drift, Heimweg, 3.000 Sparks. Nur beim ersten Besuch, überspringbar.
  - **Handy-Anzeigen** 1,3–3× zu groß → behoben (Pixelfaktor); CrazyGames-Rahmen 907×510 am Desktop galt als Handy → behoben.
  - **Kiste statt Auto / Schwarz** → Ladebildschirm deckt alles, bis Welt und Auto da sind.
  - **Menü** neu: Rennspiel-Pause statt Dashboard (Resume oben, große Auto-Zeile, zwei Karten, eine Formsprache).
  - **Ziel lesbar:** „<Rennen> · 620 m“ bleibt unter dem Pfeil; Pfeil größer.
- [x] 3e. **Politur** (2026-10-13/14, D44): nasse Straße + Tokyo-Spiegel + Probes, Neon/Bloom (auch in Fotos), Himmel mit
  Wolken, Moos-Fels, Reisfeld-Ufer, Kies-Bankett, Laternenlicht, Meer mit Wellen; UI mit echten Schriften, Pausenmenü mit
  Kamerafahrt, HUD-Animationen, Ergebnis mit Medaille, Garage mit Leistungsbalken + Live-Vorschau, Tuning auffindbar
  (Weltmarken, Kachel, Intro → Open Bay), Fotomodus mit Maus/Zoom, Tagesbonus + Tages-Challenge, KI mit Gummiband,
  Ladebildschirm; Autos vereinfacht, Startauto 2,3 → 1,1 MB.
- [ ] 2b. **Basic Launch** (du lädst hoch) · [ ] 2c. Zahlen nach 7 Tagen → H1–H5 prüfen (LAUNCH.md §7b)

**Gemessen (2026-10-14):** Build 85 MB · **19,62 MB bis gameplayStart** (vorher 20,6) · alle 59 Szenen in 18–20 s ·
Rauchprobe Hoch 143 fps, Niedrig 352–429 fps, 0 Fehler · Chromebook-Profil (CPU ÷4, Niedrig) 49 fps · Tokyo Draw Calls
Mittel 584–662 (vorher 948–1026), Niedrig ≈ 230 · EditMode 146/146 · PlayMode 207/214, 0 rot (7 auf Abruf) · Renn-Abnahme 2× 9/9.

## Offen / Gefunden

- Politur offen ([POLISH.md](POLISH.md)): Kabel zwischen Masten, Touch-Knöpfe mit Icons, Musik/Umgebungstöne (Clips fehlen),
  3D-Hebebühne in der Garage, Geist der Bestzeit, Feinregler Fahrhöhe/Sturz, Store-Videos aus dem neuen Look.

- **Start 20,6 MB** (Marke 20 MB): Rest ist das Startauto Hachi mit **176 000 Eckpunkten** → Asset-Sitzung (unten).
- Midgame-Werbung zeigt CrazyGames erst nach dem Full Launch; im QA-Tool als Demo prüfbar.
- Leistung: WebGPU später; Handy DXT→ASTC nur nach Messung (D37); Hoch-Budget (20/50 Blickpunkte > 3 M) nach deinem
  iGPU-Test. Niedrig-DC funaura-mole 504.
- Aus früher: Ride-Höhe „Dirt“, ASTRA §11-Messungen, Gegner-Motoren, Leuchtturm, Funaura-Angler, Musik/Welt-Töne;
  ASTRA E01/E08–E12/E15–E17 → Phase 12; Stadtplatte ohne Böschung, treppige Reisfeldränder, `commons-drive`-Kante. CI → Phase 12.

### Für die Asset-Sitzung (Maße stehen in den Daten)

- **Zuerst: Hachi (Startauto) auf ≤ 40 000 Eckpunkte** (`ArtSource/cars`, heute 176 000 = 2,3 MB im Startdownload);
  danach alle Autos ≤ 60 000. Ziel: Start ≤ 20 MB.
- **Töne** (CC0/eigen, `Assets/_Project/Art/Audio/<Name>.wav`, mono 44,1/48 kHz): Motor je Auto (`Engine_<auto>_idle`
  1,0 s; `_on0…3` 0,8 s / `_off0…3` 1,0 s bei 30/50/70/92 % Drehzahl; `Lift_<auto>` 0,9 s); Welt 3–6 s `Ambience_Workshop`,
  `_NeonHum`, `_Harbour`, `_Waterwheel`, `_PassWind`; Musik 2–4 Phrasen à 20–40 s; **Intro:** `Whoosh_SlowMo` 0,6 s.
- **Erledigt 2026-10-16 (Asset-Sprint 6, nur Blender → `ArtSource/exports/`, noch nicht in Unity):** 18 Figuren auf einem
  Humanoid-Skelett + 14 Clips + 15 Handprops, 14 Tiere, 10 Verkehrsautos, 19 Straßendetails, 9 Renn-, 8 Garagen-,
  14 Entdeckungs-Props ([ArtSource/STATUS.md](../ArtSource/STATUS.md) Aufgabe 6). **Nächster Schritt (Unity-Sitzung):**
  importieren, StandInFigure/Tier-/Verkehrs-Kisten ersetzen (Anleitung dort). Offen: Schanzen-Deko, Ladeninnere, Icons.
- Optional: neutrale Nummernschilder (`86-86`, `34-34`, `80-80` in `ArtSource/cars/blender/cars.py` → z. B. `21-07`).

## Für dich (Mensch)

0. **Neue Assets ansehen (5 Min.):** Bilder in `ArtSource/previews/`: `Sprint6_Street.png` (Gesamtbild), `Hito_People_1–3`,
   `Hito_Scene`, `Animals`, `Traffic`, `StreetDetails`, `RaceProps`, `GarageProps`, `DiscoveryProps`. Sag: Stil ok / was stört.
1. **Neue Version anspielen (10 Min.):** Terminal: `node Tools/serve-web.mjs --preview`, dann http://127.0.0.1:8092
   im privaten Fenster. Prüfe: Tokyo bei Regen-Spiegelung (Hoch), Pausenmenü (Esc) mit Kamerafahrt, Garage („Tune now“),
   Fotomodus (P, mit Maus ziehen, Mausrad), Rennen bis zum Ergebnis, Meer an der Küste. Handy: `--preview --public`.
   Sag je Punkt ok / was stört.
2. **Desktop genauso:** http://127.0.0.1:8092 (privates Fenster) — Tab halten überspringt das Intro.
3. **CrazyGames-QA-Tool** (developer.crazygames.com → ZIP vom **Inhalt** von `Builds/Web`): (a) Werbung im Ergebnis-
   Bildschirm, (b) AdBlocker an: Sofortstart, kein „Watch ad“, (c) Vollbild, dann Esc und MENU, (d) Login + Speichern,
   (e) Foto (P → Enter). Je Punkt ok / was falsch war.
4. **Hochladen = Basic Launch:** LAUNCH.md §1. Cover/Videos zeigen noch nicht das Intro — sag Bescheid, wenn ich neue
   aus dem Intro schneiden soll (`Tools/store-media.mjs`; der Sprung in Zeitlupe wäre ein starkes Vorschauvideo).
5. **Auszahlung** (Tipalti, Portal → Account → Billing) · **Geräte-Test** (Handy, Tablet, Laptop mit Intel/AMD-Grafik).
6. **Nach 7 Tagen und ≥ 500 Plays:** Zahlen aus LAUNCH.md §7 → ich prüfe H1–H5.
7. Noch offen von früher: Abnahmen Phase 4–10 (Fahrgefühl, Ton), alte Zweige `agent/*`. **Push** nur auf dein Wort.

## Web-Build

| Datum | Typ | Gesamt | Start bis gameplayStart | Boot (lokal) |
|---|---|---|---|---|
| 2026-10-11 | Release, Phase 11/2 (Name, Lotse, SDK-Sofortstart) | 82,2 MB in 96 Dateien | 18,45 MB | 0,5 s |
| 2026-10-11 | Release, Phase 11/3 (Intro, Handy-UI, Menü, Start mit Auto) | 82,2 MB in 97 Dateien | 20,6 MB (inkl. Startauto) | 0,8 s |
