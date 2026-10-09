# Status

> Nur der **aktuelle** Stand — keine Geschichte (die steht in `git log`).
> Wird am Ende jeder Sitzung aktualisiert. Unter 80 Zeilen halten.

**Stand:** 2026-10-09 · **Phase:** 7 abgeschlossen (deine Abnahme offen) · **Phase 8 (Progression und Speichern) ist als Nächstes dran**

Phase 2 ✅ · 3 ✅ freigegeben · 4 ✅ (Optik-Abnahme offen) · 5 ✅ (Abnahme offen) · 6 ✅ (Abnahme offen).

## Phase 7 — Spielinhalt ✅ (D26–D28)

- [x] 1. Drift-Wertung: Kette, ×2/×3/×4/×5 nach 6/18/42/90 s Drift, Crash bucht 50 %, Sakura Bowl + Rotor Court ×2 (`Captures/p7-1-*`)
- [x] 2. Regionen: 8 lückenlos, 1,5 s + 4 m → „… explored · n/8 · +200 Sparks“, alle 8 +800 (`Captures/p7-2-region.png`)
- [x] 3. Entdeckungen: 24 (3 je Region), Taste **E**, 6 Reihenfolge- + 2 Rhythmus-Rätsel, Lagen geprüft (`Captures/p7-3-*`)
- [x] 4. Schanzen: 6 Körper mit Fundament, Gelände darunter abgesenkt, Tempo-Hinweis, Landepfeile; Stunt-Wertung, STUNT-Marke (`Captures/p7-4-*`)
- [x] 5. Rennen: 8 Veranstaltungen, Karte am Leuchtpfeiler (E/E), Startaufstellung, Countdown hält alle, Kontrollpunkte, KI Mina/Joss/Ren,
  Ergebnis + Sparks (`Captures/p7-5-race.png`)

**Abnahme gemessen:** alle 8 Veranstaltungen KI gegen KI vom Start bis Ziel: **0 Rettungen, 0 Zurücksetzen**; Runden genau an der Linie
(Neon 1476/2952 m bei 1476 m Runde, Needle 2168,8/4337,6 m, Ring 5987 m). Alle 6 Schanzen beim empfohlenen Tempo: 8–33 m, Absprung an der Kante.
Tests: EditMode **99/99**, PlayMode **171/176** (4 Prüfstände auf Abruf; `TouchStick_Throttles` wackelt, s. u.).
Bench (`Captures/bench-p7-gate*`): Niedrig ≤ 390 DC / 578 k ✓ (Funaura 388 — Schanzen erst ab 400 m ausgeblendet), Hoch wie Phase 6
(sakura-hof 1 573 DC). Web **53,97 MB**, Browser Niedrig 235 / Hoch 55 fps (Vorschau lief vermutlich mit).

## Offen / Gefunden

- **ASTRA-Katalog:** E01 Sakura Starter, E08–E12, E15–E17 und die zwei Lieferfahrten brauchen Straßen/Orte, die nicht gebaut sind
  (Harbour Outer Road, Crosslight, Terrace Track, Breakyard, Market Hall). Die **Markthalle** gehört an die Harbour Outer Road (Start E02/E17)
  — erst mit dieser Straße sinnvoll (Phase 12 oder eigener Karten-Schritt).
- **Sakura `commons-drive`** beginnt als Asphaltkante in der Schale — nicht behoben (Straßen-Import).
- **Rennen vorläufig:** Karte/Ergebnis als Text (Phase 9: echtes UI, Kamerafahrt, Töne); Regionen-/Entdeckungsmeldungen erscheinen auch
  im Rennen (ASTRA: erst danach); Fortschritt (Sparks, Funde, Bestzeiten) wird noch **nicht gespeichert** (Phase 8).
- **Entdeckungen:** Hinweiskarte mit Postkarte und 80-m-Suchkreis fehlt (Phase 9, Karte). Ring-Zeitfahren: Bestzeit-Ziel gilt für den Kite
  (250 s); Tabelle je Auto kommt mit Phase 8.
- **Wackeliger Test:** `PlayerDriveTests.TouchStick_Throttles…` war 2× beim ersten Lauf nach Neuladen rot (Gas 0), danach 5× grün — Ursache offen.
- **Kartenpunkte:** Kuppen-Knicke alter Straßen, Stadtplatte ohne Böschung, treppige Reisfeldränder; Viadukt-Brüstungsmauer (Modell).
- **Hoch kostet viel** (Wald-Schatten, lodBias 2) → Phase 10. **Download 54 MB** (Desktop-Ziel 50, Handy 20) → Phase 10 (Addressables).
- Funaura: die sechs Angler fehlen. Tokyo-Kollider bleiben GameObjects (NavMesh).

### Für die Asset-Sitzung (Lagen stehen in den Daten, Import genügt)

- **Rennen:** Startpfeiler/Event-Tafel 6–8 m (leuchtend, je Art Farbe), Kontrollpunkt-Bogen (Straßenbreite + 2 m, zwei Säulen 6 m), Start-Ziel-
  Banner, Pokal (0,4 m) fürs Ergebnis. Needle: Tribüne, Boxen, Start-Ziel-Brücke. Je ≤ 2 k Dreiecke.
- **Schanzen (Stellvertreter: Betonkeil + Kies-Landefläche + weiße Pfeile):** Absprung als Erdwall/Holzrampe je Ort (8–12 m breit, 0,9–3 m
  hoch, 12–24 m lang, Maße in `Data/Gameplay/Ramps.asset`); Tempo-Schild 1,2 m; Lande-Chevron-Tafel; orange Absperrung. ≤ 1,5 k.
- **Entdeckungen (Stellvertreter: bernsteinfarbene Raute + weiße Pfosten):** „Sparks-Laterne“ 0,4 m; Gründerplakette; Lichttafel + 3 Reifenstapel;
  Getränkeregal; Fernrohr-Rahmen; Start-Tafel mit 3 Feldern; Zuschauer-Treppchen; Spielzeug-Schuppen; Reisschale; Schleuse mit 3 Schiebern;
  Karten-Tafel; Grat-Tafel; rote Thermoskanne; Laternen-Plakette; Netzhaus-Seile; Gezeitentafel; Bank mit Hafenkarte; Lampen-Tafel;
  Treibholz-Marke; Rettungsring-Schild. Je ≤ 1,5 k.
- **Aus Phase 6 noch offen:** Spielfigur (1,72 m, Animationen), Passanten/Tiere, Verkehrsautos, vorzerlegte Laterne/Automat/Zaun/Schuppen/
  Baum, Ladeninnere, leichte Ausstellungsautos, Koedo-Kanalbrücken; `Tokyo_Tower_Mixed_Tile_70` Fernstufe.

## Für dich (Mensch)

1. **Phase 7 ausprobieren (~20 Min.):** `Boot` → ▶ Play. Du stehst zu Fuß in Sakura.
   - **Entdeckungen:** 12 m links vom Start leuchtet eine bernsteinfarbene Raute → hingehen, **E**. An der Open Bay (rechts): Tafel mit **E**
     lesen, dann die drei Pfosten in der Reihenfolge **2 → 1 → 3** (je hingehen + E). Die Rauten zeigen sich im Umkreis von 160 m.
   - **Drift:** **F** ins Auto, in der Kirsch-Schale **Leertaste + lenken**. Oben erscheinen Punkte, ×-Stufe und „SPOT BONUS ×2“. 3 s ohne Drift
     = gutgeschrieben (Sparks oben rechts); eine Wand halbiert die Kette.
   - **Schanze Petal Hop:** von Sakura nach Südosten über die Ringstraße; unten erscheint „Petal Hop · 55–75 km/h“. Mit Vollgas (**Shift** = Nitro)
     drüber → „Jump 15 m +147“. **Doppelt Leertaste** = Stunt-Modus (orange STUNT oben links): Dreher 180/360 im Gras oder in der Luft.
   - **Rennen:** leuchtende Säulen am Straßenrand (blau = Rennen, gold = Zeitfahren, rosa = Drift). Daneben unter 15 km/h anhalten, **E** =
     Karte, **E** = Start. Am nächsten: **Neon Circuit** in Tokyo, **Coast Loop** am Ring westlich von Koedo, **Needle Sprint/Open Seat**
     am Rundkurs im Südwesten, **Tōge Descent/Drift Run** oben am Pass, **Tōge Climb** an seinem Fuß. **R** im Rennen = zurück auf die
     Strecke (+3 s). Aussteigen bricht ab.
   - Fühlt sich der Drift-Multiplikator richtig an (×2 nach 6 s, ×5 erst nach 90 s)? Sind die Gegner zu leicht/zu schwer?
2. **Selbst im Browser spielen, ohne die Agenten zu stören:** im Projektordner `Vorschau.command` doppelklicken (öffnet
   http://127.0.0.1:8092/, letzter Build). Fenster schließen = Ende. Nicht, während Tests/Bilder laufen (zwei Spiele rendern).
   **Deine alte Vorschau läuft noch auf Port 8091** — Terminal-Fenster schließen; neu ist 8092.
3. **Browser-Probe bei ruhigem Rechner** (Blender und Vorschau zu): `node Tools/smoke.mjs --gpu`.
4. Noch offen aus früher: Abnahme Phase 5/6, Optik Phase 4, Hachi-Heckscheibe, alte Zweige `agent/*`.
5. Commits liegen lokal; **Push** nur, wenn du es sagst.

## Web-Build

| Datum | Typ | Gesamt | wasm | data | Boot (lokal) |
|---|---|---|---|---|---|
| 2026-10-09 | Release, Phase 6 (zu Fuß, NavMesh, Leben) | 49,34 MB | 5,73 MB | 43,40 MB | 0,8 s |
| 2026-10-09 | Release, + Assets 5b/5c/Flora/Scatter (248 Modelle) | 53,91 MB | 5,74 MB | 47,97 MB | 0,8–0,9 s |
| 2026-10-09 | Release, Phase 7 (Spielinhalt) | 53,97 MB | 5,76 MB | 48,02 MB | 0,8–1,1 s |
