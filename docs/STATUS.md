# Status

> Nur der **aktuelle** Stand — keine Geschichte (die steht in `git log`).
> Wird am Ende jeder Sitzung aktualisiert. Unter 80 Zeilen halten.

**Stand:** 2026-10-17 · **Phase 11 (Launch):** deine Wunschliste umgesetzt (D46): Nitro-Burst, Stunts, Zerbrechen, Menü,
Ton, Tempo-Effekte, Navi am Boden, Straßen/Reisfelder, Cockpit · **jetzt bist du dran:** anspielen (Liste „Für dich" Punkt 0)

## Phase 11 — Launch

- [x] 1. QA · 2a. Store-Material · Name (D41) · 3a–c Absprungstellen · Midgame-Werbung (D42) · 3d Erster Eindruck (D43) · 3e Politur (D44)
- [ ] 2b. **Basic Launch** (du lädst hoch) · [ ] 2c. Zahlen nach 7 Tagen → H1–H5 prüfen (LAUNCH.md §7b)
- [x] 3f. Asset-Sprint 6 (D45): echte Figuren, Tiere, Verkehr.
- [x] 3g. **Wunschliste 2026-10-17** (D46): Shift ×2 = Nitro-Burst (Flammen, Druckwelle, Kamera-Stoß, Schlieren) ·
  Stunts landen gerade, neu Kickflip/Backflip/180 · Bäume kippen, Dinge fallen als sie selbst · Menü neu (Leiste oben,
  Auto rechts frei, Autofotos aus der Garage) · Ton neu gerendert · Speed-Effekte · Navi-Band am Boden + Route auf
  Karte · schwarze Bänder mit Schein weg · Einmündungen/Kiesrand/Reisufer · Cockpit mit Lenkrad, Tacho, Head-up.

- [x] 3h. **Rückmeldung 2026-10-17 (2):** Straßen überall ruhiger (keine Querbänder, weniger/weichere Pfützen, Kiesrand
  blendet ins Gelände, Kreuzungen ohne Linien, Einmündungen nahtlos), schwarze Leitplanken-Dreiecke + Lichtlinie am
  Horizont weg · Cockpit: Kamera nach Autowechsel richtig, Arme/Handschuhe am Lenkrad, Rennwagen-Display am Lenkrad ·
  Lufttricks Frontflip/Helikopter/Korkenzieher + Combo, Kickflip landet geradeaus · Burst ∝ Tank² · Nitro langsamer, im Rennen gedämpft.

**Gemessen (2026-10-17):** Build 78,2 MB · **20,25 MB bis gameplayStart** (16.10.: 20,13) · Rauchprobe 0 Fehler, Niedrig
340 fps (M4) · EditMode 151/151 · PlayMode 207/214 (7 auf Abruf, 0 rot) · schlimmster Bruch 1,44 ms · Route: Graph 33 ms,
Suche 5 ms. **Nicht gemessen:** Chromebook-Profil-FPS mit den neuen Effekten (Speed-Volume ist nur Uber-Pass + Blur auf Hoch).

## Offen / Gefunden

- Neu (2026-10-17): Cockpit-Anzeigen nur am Hachi geprüft (Position aus `eye`/`steering_wheel` der Modelle) — andere Autos
  ansehen. Seitenstraßen enden an schrägen Einmündungen noch rechteckig (Überlappung statt Kreuzungsfläche).
  Wackelig im Gesamtlauf (einzeln grün): `AcceptanceDriveTests.RingLap`, `SmashTests.Tree_FallsAt50`.
- Politur offen ([POLISH.md](POLISH.md)): Kabel zwischen Masten, Touch-Knöpfe mit Icons, Musik/Umgebungstöne (Clips fehlen),
  3D-Hebebühne in der Garage, Geist der Bestzeit, Feinregler Fahrhöhe/Sturz, Store-Videos aus dem neuen Look.

- **Start 20,25 MB** (Marke 20 MB): Rest ist das Startauto Hachi mit **176 000 Eckpunkten** → Asset-Sitzung (unten).
- Funaura: Passanten laufen im Hafenbecken (Kopf über Wasser) — NavMesh unter der Wasserfläche (war mit Kisten-Figuren auch so).
- Krähen, Tauben, Shiba und Verkehrsposten (Wave) sind importiert, haben aber noch keinen Platz in der Welt (ActorSet kennt sie nicht).
- Leistung: WebGPU später; Handy DXT→ASTC nur nach Messung (D37); Hoch-Budget (20/50 Blickpunkte > 3 M) nach deinem
  iGPU-Test. Niedrig-DC funaura-mole 504.
- Aus früher: Ride-Höhe „Dirt“, ASTRA §11, Gegner-Motoren, Leuchtturm, Angler, Musik; ASTRA E01/E08–E17 → Phase 12; CI → Phase 12.

### Für die Asset-Sitzung (Maße stehen in den Daten)

- **Zuerst: Hachi (Startauto) auf ≤ 40 000 Eckpunkte** (`ArtSource/cars`, heute 176 000 = 2,3 MB im Startdownload);
  danach alle Autos ≤ 60 000. Ziel: Start ≤ 20 MB.
- **Töne** (heute aus `Tools/render-sounds.mjs`; echte Aufnahmen gleichen Namens ersetzen sie — CC0/eigen, `Assets/_Project/Art/Audio/<Name>.wav`, mono 44,1/48 kHz): Motor je Auto (`Engine_<auto>_idle`
  1,0 s; `_on0…3` 0,8 s / `_off0…3` 1,0 s bei 30/50/70/92 % Drehzahl; `Lift_<auto>` 0,9 s); Welt 3–6 s `Ambience_Workshop`,
  `_NeonHum`, `_Harbour`, `_Waterwheel`, `_PassWind`; Musik 2–4 Phrasen à 20–40 s; **Intro:** `Whoosh_SlowMo` 0,6 s.
- **Asset-Sprint 6 ist in Unity** (2026-10-16, Import: Menü „JapanMap/Art/Import Figures + Traffic“). Die Props
  (Straßendetails, Rennen, Garage, Entdeckungen) liegen als Prefabs bereit, sind aber noch nicht in der Welt platziert.
  Offen: Schanzen-Deko, Ladeninnere, Icons.

## Für dich (Mensch)

0. **Die neue Fassung anspielen (15 Min.):** `node Tools/serve-web.mjs --preview`, http://127.0.0.1:8092 (privates Fenster).
   Bitte je Punkt „ok" oder was stört: (a) **Shift zweimal schnell** = Nitro-Burst (vor einer Schanze), (b) **Stunts**:
   Leertaste doppelt — geradeaus = Kickflip, mit Lenken = 360, Lenken+S = 180, in der Luft = Rolle, S+doppelt = Backflip,
   (c) Baum/Laterne umfahren, (d) **Esc-Menü** (Auto rechts sichtbar? Autos-Seite mit Fotos), (e) **Ton mit Kopfhörern**
   (Motor, Reifen, Burst-Wumms), (f) ab ~100 km/h Schlieren/Unschärfe — zu viel/zu wenig?, (g) Karte (M) → Punkt antippen →
   „Set waypoint here": Band auf der Straße + Linie auf der Karte, (h) Straßen außerhalb Tokyos + Reisfelder,
   (i) **C** = Cockpit (auch nach Autowechsel), Hände am Lenkrad, (j) Lufttricks: Leertaste doppelt + A/D Rolle, + S Backflip,
   + W Frontflip, ohne Taste Helikopter, A/D+S Korkenzieher; zwei in einem Sprung = Combo; (k) Burst mit vollem Tank. Bilder vorab: `Captures/cockpit/c1.png`,
   `Captures/menu/play.png`, `Captures/nav/m.png`, `Captures/roads/k2.png`, `Captures/smash/t.png`.
1. **Handy:** dieselbe Liste mit `--preview --public` (Touch: BOOST doppelt = Burst, STUNT-Knopf).
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
| 2026-10-16 | Release, Asset-Sprint 6 (Figuren, Tiere, Verkehr nachgeladen) | 78,2 MB in 102 Dateien | 20,13 MB | 1,1 s |
| 2026-10-17 | Release, Wunschliste (Burst, Menü, Navi, Cockpit, Straßen) | 78,2 MB in 102 Dateien | 20,25 MB | 0,8 s |
