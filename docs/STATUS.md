# Status

> Nur der **aktuelle** Stand — keine Geschichte (die steht in `git log`).
> Wird am Ende jeder Sitzung aktualisiert. Unter 80 Zeilen halten.

**Stand:** 2026-10-11 abends · **Phase 11 (Launch):** erster Eindruck neu gebaut (Intro, Handy, Menü) · **jetzt bist du dran:**
Handy-Link testen, dann hochladen

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
- [ ] 2b. **Basic Launch** (du lädst hoch) · [ ] 2c. Zahlen nach 7 Tagen → H1–H5 prüfen (LAUNCH.md §7b)

**Gemessen (2026-10-11 abends):** Build 82,2 MB · **20,6 MB bis gameplayStart** (18,4 Spiel + 2,4 Startauto, ehrlich
gezählt; vorher 18,4 + Kiste) · 5,8 s lokal · Handy-Netz 5 Mbit/s ≈ 34 s, 20 Mbit/s ≈ 11 s (H1: nur Bytes zählen) ·
Rauchprobe Niedrig 390–402 fps (3×) · Speichern lokal + SDK grün · SDK gesperrt grün · Streaming 58 Szenen grün ·
**sizes-web grün: 7 Desktop-Größen + Android (2,625) + iPhone (3) + hochkant, 0 Überlappungen** · EditMode 143/143 · PlayMode 204/211, 0 rot (7 auf Abruf).

## Offen / Gefunden

- **Politur-Plan 2026-10-13 → [POLISH.md](POLISH.md)** (Analyse: Spiegelungen, Tokyo, Straßenränder, Reisfelder, UI, Tuning, Fotomodus, Wiederkommen). Wartet auf dein Go.

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
- **Garage** (Werkbank 2,0×0,8×0,9 m, Reifenregal 1,8×0,5×2,0, Lacktafel 1,2×0,05×0,9, Motor auf Bock 0,9×0,6×1,0,
  Schild 2,5×0,6; je ≤ 1,5 k) · **Rennen** (Pfeiler 6–8 m, Kontrollbogen, Banner, Pokal 0,4 m; ≤ 2 k) · **Schanzen**
  (`Ramps.asset`, neu: Coast Kicker 22×12×4,2 m) · **20 Entdeckungs-Props** · Spielfigur, Passanten, Verkehrsautos,
  Ladeninnere, Kanalbrücken · **Icons** 22 SVG 24×24 + Menü-Symbol (☰).
- Optional: neutrale Nummernschilder (`86-86`, `34-34`, `80-80` in `ArtSource/cars/blender/cars.py` → z. B. `21-07`).

## Für dich (Mensch)

1. **Handy-Test jetzt (5 Min.):** https://commissioner-wow-south-berkeley.trycloudflare.com/ — läuft, solange dein Mac
   an ist und der Server läuft (neu starten: `node Tools/serve-web.mjs --preview --public`, dann gibt es eine neue
   Adresse). **Privater Tab** = neuer Spieler → Intro. Quer halten. Prüfe: Ladebalken bis zum Bild (kein Schwarz, keine
   Kiste)? Intro verständlich, Sprung + Zeitlupe, „Tap STUNT“ in der Luft, SKIP? Danach Menü (MENU-Knopf) — gefällt es?
   Schreib mir je Punkt ok / was stört.
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
