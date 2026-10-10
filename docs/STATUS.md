# Status

> Nur der **aktuelle** Stand — keine Geschichte (die steht in `git log`).
> Wird am Ende jeder Sitzung aktualisiert. Unter 80 Zeilen halten.

**Stand:** 2026-10-10 · **Phase:** 10 abgeschlossen · **Phase 11 (Launch) ist als Nächstes dran** · deine Abnahmen offen: Phase 4–10

## Phase 10 — Plattform und Leistung ✅ (D35–D39)

- [x] 1. **CrazyGames-SDK komplett** (D35): gameplayStart/Stop aus Welt + UI-Stapel + Werbung (≥ 1 s Abstand), muteAudio, Login,
  „Choose progress“ + Wiederherstellungskopie, Rewarded nach ASTRA §12 (+300 / Leihwagen 10 min oder 600 Sparks), „No ad available“.
- [x] 2. **Start 18,4 MB** bis gameplayStart (vorher 58,6; D36): Orte, Straßenkacheln, Props, NavMeshes, Vegetation, Autos per
  Addressables nach dem Start; Gelände als gzip-Datei (verlustfrei), Gras danach; Crunch; Shader-Varianten; eigenes Web-Template.
- [x] 3. **Speicher** (D37): WASM-Heap Hoch 591 MiB, Niedrig 493 MiB; Chromebook-Profil (CPU ÷4) 4,2 s bis Spiel; Safari/WebKit läuft.
- [x] 4. **Qualität automatisch** (D38) + Recalibrate; **WebGPU zeichnet schwarz** → WebGL2; „Hoch 56 fps“ war der 60-Hz-Takt.
- [x] 5. **Ring-Senke behoben** (D39, 0 statt 8 Aufsetzer); **Profiling 50 Blickpunkte** (`Captures/bench-p10-gate-*.txt`), Gras-Sichtweite Hoch 70 m.
- [ ] 6. CI (GameCI) — optional, braucht deine Unity-Lizenz als GitHub-Secret → Phase 12.

**Abnahme (CrazyGames-Anforderungen, CONTEXT.md):** Start ≤ 20 MB ✅ 18,4 · gesamt ≤ 250 MB / 1 500 Dateien ✅ 82 MB / 96 · Laden ≤ 20 s ✅
0,5–2 s lokal · Chrome/Edge ✅ · Safari ✅ (WebKit) · DPR 1 iOS/≤ 4 GB ✅ · SDK Werbung/Spielereignisse/Nutzer/Daten ✅ (Käufe: nicht genutzt) ·
relative Pfade, Seitensperre, kein Markieren, Safe Area ✅. **Offen bis QA-Tool/Gerät:** Werbung + Login im echten Rahmen, Mausfang, Foto-
Download, 4-GB-Chromebook-GPU, Handy (Touch, Speicher; DXT → ASTC erst nach Messung, D37).
**Gemessen:** EditMode 132/132 · PlayMode Editor 189/198 (7 auf Abruf; Fußgänger-10-min und Smash-Kosten nur nach anderen Tests rot,
einzeln je 2× grün) · Browser: SDK, Speichern, Nachladen, Bildprobe grün; Rauchprobe Niedrig 372–391 fps, Hoch 95 fps, 0 Fehler ·
Bilder `Captures/p10-gate-HL.png` (Hoch wie P9; Niedrig zeigt im Luftbild die Stadt erst ab 450 m — war immer so, Edit-Bilder zeigten es nicht).
Budgets: Hoch 18/50 Blickpunkte über 3 M Dreiecke (ländlich, max 5,9 M), Niedrig 2/50 knapp über 400 DC (max 432).

## Phase 11 — Launch (PLAN.md)

- [ ] 1. QA-Durchgang (Checkliste aus allen Abnahmen), AdBlock-Test, Geräte-Test · [ ] 2. Basic Launch, Spielzeit/Wiederkehr messen ·
  [ ] 3. drei größte Absprungstellen beheben, dann Full Launch

## Offen / Gefunden

- **Klick/Touch-Tests in langen Editor-Läufen:** `UiPanel.Size` veraltet, wenn die Spielansicht ihre Größe ändert (Panel 1 839×914 ×1,25
  bei Bildschirm 1 469×684 → Tipp ins Leere); einzeln grün; im Batchmode immer rot (zeichnet nicht). Behebung: Größe je Bild neu lesen.
- **Wackeln:** Fußgänger bei t = 0 auf der Kreuzung meiji-south/lantern-south (nur nach anderen Tests); Smash 2,1–2,3 ms (Grenze 2);
  `Keyboard_Drives…`, `TrafficCar_StopsForAPerson`, `DiscoveryPlayTests` je 1× im Gesamtlauf. **Unity stürzte 2× ab** (UI-Skia; PhysX beim
  CharacterController während asynchronen Nachladens im Test) — Editor lädt Streaming-Szenen seitdem synchron, nicht wieder gesehen.
- **Leistung:** WebGPU (Unity 6.6) Validierungsfehler im Lit-Shader → später neu versuchen (`WebBuild.BatchWebGpu`). Straßenkachel noch nicht
  geladen = Fahrt auf Gelände darunter (lokal 2 s; mit gedrosseltem Netz prüfen).
- **Fehlt:** Ride-Höhe +20 mm „Dirt“; Produkt-Messungen (ASTRA §11); Gegner-Motoren hörbar; Foto „Capture High“ ohne Mehrfach-Abtastung;
  Leuchtturm-Reiseziel; Funaura-Angler; Musik/Welt-Töne; Midgame-Werbung bewusst weggelassen (D35).
- **ASTRA-Katalog:** E01, E08–E12, E15–E17, Lieferfahrten brauchen ungebaute Straßen/Orte → Phase 12. **Karte:** Stadtplatte ohne Böschung
  (dunkler Streifen am Horizont von Sakura), treppige Reisfeldränder, `commons-drive` beginnt als Asphaltkante.

### Für die Asset-Sitzung (Lagen stehen in den Daten, Import genügt)

- **Töne** (CC0 oder eigene; `Assets/_Project/Art/Audio/<Name>.wav`, mono, 44,1/48 kHz): Motor je Auto (`Engine_<auto>_idle` 1,0 s; `_on0…3`
  0,8 s / `_off0…3` 1,0 s bei 30/50/70/92 % Drehzahl; `Lift_<auto>` 0,9 s; Schleifen mit 1024 Samples Stille vorn); Welt 3–6 s:
  `Ambience_Workshop`, `_NeonHum`, `_Harbour`, `_Waterwheel`, `_PassWind`; Musik 2–4 Phrasen à 20–40 s.
- **Garage:** Werkbank 2,0×0,8×0,9 m, Reifenregal 1,8×0,5×2,0, Lacktafel 1,2×0,05×0,9, Motor auf Bock 0,9×0,6×1,0, Schild 2,5×0,6 (je ≤ 1,5 k);
  **Rennen:** Pfeiler 6–8 m, Kontrollbogen, Banner, Pokal 0,4 m, Needle-Tribüne/Boxen/Brücke (≤ 2 k); **Schanzen** je Ort (`Ramps.asset`);
  **Entdeckungen** 20 Props (`Discoveries.asset`); **aus Phase 6:** Spielfigur, Passanten, Verkehrsautos, Ladeninnere, Kanalbrücken;
  **Icons** 22 SVG 24×24 (`Icon`-Enum). Neue Inhalte außerhalb Sakura kommen automatisch in die Nachlade-Bündel (`StreamingSetup`).

## Für dich (Mensch)

1. **Phase 10 ausprobieren (~15 Min.):** `node Tools/serve-web.mjs --preview` → http://127.0.0.1:8092 (Build von heute).
   - **Laden:** Ladebalken, dann Spiel nach ~1–2 s; Orte und Autos kommen im Hintergrund dazu (Tokyo, Hafen ein paar Sekunden später).
   - **Settings → Graphics:** „Auto“ zeigt die gewählte Stufe (nach ~10 s Fahrt gemessen), **Recalibrate**, Hand-Wahl Hoch/Mittel/Niedrig.
   - **Settings → Progress:** Speicherort; „Choose progress“ erscheint nur bei zwei verschiedenen Spielständen (Konto/Gerät).
   - **Werbung (nur mit SDK):** Rennen ≥ 45 s fahren (z. B. Needle Sprint) nach 5 min Spielzeit → Ergebnis „Watch ad · +300 Sparks“;
     ein Auto im Showroom probefahren → dann „Watch ad · borrow for 10 minutes“ / „Borrow · 600 Sparks“.
   - **Ring** bei hohem Tempo Richtung Süden (bei Sakura vorbei): setzt das Auto noch auf? Fühlt sich die Senke natürlich an?
   - **Niedrig-Optik:** Luftblicke zeigen die ferne Stadt erst ab 450 m — stört dich das?
2. **CrazyGames-QA-Tool** (developer.crazygames.com → Spiel hochladen: Inhalt von `Builds/Web`): Werbung (Demo), Login, Speichern im
   Rahmen, Mausfang (in die Leinwand klicken), Foto-Download (P → Enter → Download). Was rot ist, mir in Phase 11 sagen.
3. **Handy** (`node Tools/serve-web.mjs --lan`, Zeile „phone (use this)“) und wenn möglich ein Chromebook/iGPU-Laptop: läuft es flüssig?
4. Noch offen aus früher: Abnahmen Phase 4–9 (Fahrgefühl, Ton mit Kopfhörern, Handy-Bedienung), alte Zweige `agent/*`. **Push** nur auf dein Wort.

## Web-Build

| Datum | Typ | Gesamt | Start bis gameplayStart | Boot (lokal) |
|---|---|---|---|---|
| 2026-10-10 | Release, Phase 9 | 58,6 MB (Bericht sagte 55,9 MiB) | 58,6 MB | 0,8–1,1 s |
| 2026-10-10 | Release, Phase 10 (Streaming, gzip-Gelände, Shader) | 82,2 MB in 96 Dateien | **18,4 MB** | 0,5–0,8 s |
