# Status

> Nur der **aktuelle** Stand — keine Geschichte (die steht in `git log`).
> Wird am Ende jeder Sitzung aktualisiert. Unter 80 Zeilen halten.

**Stand:** 2026-10-16 · **Phase 11 (Launch):** Politur durch, **echte Figuren, Tiere und Verkehr im Spiel** (D45) ·
**jetzt bist du dran:** anspielen (Desktop + Handy), dann hochladen

## Phase 11 — Launch

- [x] 1. QA-Durchgang → [QA.md](QA.md) · [x] 2a. Store-Material → [LAUNCH.md](LAUNCH.md) · [x] Name „Ameagari Drive“ (D41)
- [x] 3a–c. Drei Absprungstellen vorab (SDK-Sofortstart, Tastenkappen, Lotse) · [x] Midgame-Werbung an Pausen (D42)
- [x] 3d. **Erster Eindruck** (D43): Intro „First Drive“, Handy-Anzeigen, Ladebildschirm, neues Pausenmenü, Ziel lesbar.
- [x] 3e. **Politur** (D44): nasse Straße, Tokyo-Spiegel, Neon, Himmel, Meer, neue UI, Garage, Fotomodus, Tagesbonus.
- [ ] 2b. **Basic Launch** (du lädst hoch) · [ ] 2c. Zahlen nach 7 Tagen → H1–H5 prüfen (LAUNCH.md §7b)
- [x] 3f. **Asset-Sprint 6 in Unity** (2026-10-16, D45): Spieler, 40 Passanten und 37 Ortsfiguren sind echte Figuren
  (18 Körper, Humanoid, 14 Clips, Schirme/Taschen/Angel/Besen in der Hand), Katzen/Hühner/Ziegen echte Modelle,
  Verkehr 10 Modelle im japanischen Farbmix; Details/Renn-/Garagen-/Entdeckungs-Props in Bibliothek + Showroom.
  Figuren/Verkehr laden **nach** gameplayStart nach; nur die Spielerfigur ist im Start. Bilder: `Captures/s6-me.png`,
  `s6-peds.png`, `s6-traffic-near.png`, `s6-poses.png`. Dazu: schwarzer Streifen am Stadtrand weg (Böschung statt Kante).

**Gemessen (2026-10-16):** Build 78 MB · **20,13–20,16 MB bis gameplayStart** (14.10.: 19,62; neue Figuren davon ~0,15 MB)
· Chromebook-Profil (CPU ÷4, Niedrig) 48 fps (vorher 49) · Rauchprobe Niedrig 440 fps, 0 Fehler · Tokyo-Straße Niedrig 241 DC
(vorher ≈ 230), Hoch 1013 · EditMode 148/148 · PlayMode 200/214 (7 auf Abruf; 7 Klick-/Touch-Tests rot direkt nach dem Bench, einzeln alle grün).

## Offen / Gefunden

- Politur offen ([POLISH.md](POLISH.md)): Kabel zwischen Masten, Touch-Knöpfe mit Icons, Musik/Umgebungstöne (Clips fehlen),
  3D-Hebebühne in der Garage, Geist der Bestzeit, Feinregler Fahrhöhe/Sturz, Store-Videos aus dem neuen Look.

- **Start 20,13 MB** (Marke 20 MB, 0,13 drüber): Rest ist das Startauto Hachi mit **176 000 Eckpunkten** → Asset-Sitzung (unten).
- Funaura: Passanten laufen im Hafenbecken (Kopf über Wasser) — NavMesh unter der Wasserfläche (war mit Kisten-Figuren auch so).
- `bench.mjs` vor einem PlayMode-Lauf lässt 7 Klick-/Touch-Tests rot werden (Game-Ansicht verstellt); einzeln grün.
- Krähen, Tauben, Shiba und Verkehrsposten (Wave) sind importiert, haben aber noch keinen Platz in der Welt (ActorSet kennt sie nicht).
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
- **Asset-Sprint 6 ist in Unity** (2026-10-16, Import: Menü „JapanMap/Art/Import Figures + Traffic“). Die Props
  (Straßendetails, Rennen, Garage, Entdeckungen) liegen als Prefabs bereit, sind aber noch nicht in der Welt platziert.
  Offen: Schanzen-Deko, Ladeninnere, Icons.
- Optional: neutrale Nummernschilder (`86-86`, `34-34`, `80-80` in `ArtSource/cars/blender/cars.py` → z. B. `21-07`).

## Für dich (Mensch)

0. **Neue Figuren im Spiel ansehen (5 Min.):** `Captures/s6-me.png` (du zu Fuß), `s6-peds.png` (Tokyo, Fischerdorf),
   `s6-poses.png`; im Spiel: aussteigen (F), durch Tokyo laufen. Sag: Stil/Bewegung ok / was stört. Auch: ist der
   schwarze Streifen am Stadtrand überall weg (`Captures/streak-final.png`)?
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
| 2026-10-16 | Release, Asset-Sprint 6 (Figuren, Tiere, Verkehr nachgeladen) | 78,2 MB in 102 Dateien | 20,13 MB | 1,1 s |
