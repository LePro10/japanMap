# Status

> Nur der **aktuelle** Stand — keine Geschichte (die steht in `git log`).
> Wird am Ende jeder Sitzung aktualisiert. Unter 80 Zeilen halten.

**Stand:** 2026-10-10 · **Phase:** 8 abgeschlossen (deine Abnahme offen; PlayMode-Gesamtlauf + Blickpunktbilder des Tors stehen aus, s. u.) · **Phase 9 (UI, HUD, Ton) ist als Nächstes dran**

Phase 2 ✅ · 3 ✅ freigegeben · 4 ✅ (Optik-Abnahme offen) · 5–7 ✅ (Abnahme offen).

## Phase 8 — Progression und Speichern ✅ (D29–D32)

- [x] 1. Wirtschaft simuliert (`docs/ECONOMY.md`): Rennfahrer 3 297, gemischt 2 451, Drift geübt 2 206 Sparks/10 min (Ziel 2 400–3 600); Rennen zahlen nach Dauer, Drift 50:1
- [x] 2. Garage an der Open Bay (**E**): 10 Autos (ASTRA-Preise, Mame K 2 400), Tuning 4 × Street/Sport, Setups, Lack/Felgen/Kit; Prüfstand `docs/TUNING.md`
- [x] 3. Speichern: CrazyGames-SDK-Datenmodul + lokal; „Weiter“ im Auto an der letzten Parkstelle; kaputter Stand bricht nichts
- [x] 4. Rekorde (**Tab**) mit Rekordbildern, 15 Meilensteine, Fotomodus (**P**, Enter = PNG 2560 px), Ring-Ziel je Auto (210–283 s)

**Abnahme gemessen:** Tuning je Teil allein (Hachi): Motor Sport 0–100 −11 %, Spitze +4 %; Bremsen Sport −10,6 % Weg; Reifen Sport +8 % Grip;
Lenkung Sport −16 % Ansprache — kein Teil verschiebt fremde Zahlen. Neustart-Test: Sparks, Region, Fund, Bestzeit je Auto, Medaille, Auto, Parkstelle
zurück, nichts doppelt bezahlt. Browser (`save-web.mjs`): localhost über das SDK neu geladen → Stand da.
Tests: EditMode **112/112**; PlayMode zuletzt komplett **181/188** (6 auf Abruf, Touch-Test rot → zweiter Fix, danach 3× grün; Gesamtlauf nach dem Fix
**abgebrochen, weil im Editor Play gedrückt wurde**). Bench Sakura Hoch 1 422 / Niedrig 332 DC (Phase 7: 1 390 / 336).
Web **54,28 MB** (+0,31: SDK, Garage, Rekorde), Start 1,1 s, Browser Niedrig 356 fps, 0 Fehler.

## Phase 9 — UI, HUD, Ton (als Nächstes, PLAN.md)

- [ ] 1. Menü (ESC pausiert alles): Weiter, Garage, Karte, Foto, Rekorde, Einstellungen · [ ] 2. HUD + Minimap, Handy-Layout
- [ ] 3. Weltkarte, Teleport, Fotomodus fertig (Touch) · [ ] 4. Ton je Auto/Belag/Umgebung · [ ] 5. Touch erstklassig

## Offen / Gefunden

- **Tor-Rest:** PlayMode-Gesamtlauf nach dem zweiten Touch-Fix und Blickpunktbilder Hoch/Niedrig — beim nächsten Start zuerst nachholen.
- **Tests, die wackeln:** Touch-Test (Gerät aus + Layout nicht fertig, zwei Fixes); `Keyboard_Drives…` 1×/7 rot; `PedestrianTests.TenMinutes…`
  1× im Gesamtlauf rot (2 Fußgänger auf meiji-south bei t = 0 s), allein grün.
- **Gras** wächst durch den Boden der Open Bay und steht vereinzelt auf der Schanze Petal Hop (`Captures/p8-4/jump.png`).
- **Unity schrieb selbst um (nicht committet):** `Data/Nav/*.asset` (andere Größe), `ProjectSettings` (`InputSystem_Actions` als preloaded).
- **CrazyGames ungeprüft:** Mausfang, Foto-Download und Speichern im echten CrazyGames-Rahmen → Phase 10 mit dem QA-Tool. Headless-Chrome
  bekommt ohne SDK keine Tasten (`save-web` prüft auf 127.0.0.1 nur den Start-Stand). „Choose progress“ bei Konto-Konflikten fehlt.
- **Fehlt noch:** Probefahrt 90 s (ASTRA §6); zwei Car-Lab-Lackierungen je Auto (Texturen → Phase 10 Nachladen); Ride-Höhe +20 mm im Setup „Dirt“;
  Produkt-Messungen (ASTRA §11) → Phase 10/11; Fotomodus/Rekorde/Garage per Touch → Phase 9.
- **ASTRA-Katalog:** E01 Sakura Starter, E08–E12, E15–E17, Lieferfahrten brauchen ungebaute Straßen/Orte (Harbour Outer Road, Crosslight,
  Terrace Track, Breakyard, Market Hall) — Phase 12 oder eigener Karten-Schritt.
- **Rennen vorläufig:** Karte/Ergebnis als Text (Phase 9); Regions-/Fundmeldungen auch im Rennen (ASTRA: erst danach).
- **Entdeckungen:** Hinweiskarte mit Postkarte und 80-m-Suchkreis fehlt (Phase 9, Karte). Funaura: die sechs Angler fehlen.
- **Karte:** Kuppen-Knicke, Stadtplatte ohne Böschung, treppige Reisfeldränder, `commons-drive` beginnt als Asphaltkante.
- **Hoch kostet viel** (Wald-Schatten, lodBias 2) → Phase 10. **Download 54 MB** (Desktop 50, Handy 20) → Phase 10 (Addressables).

### Für die Asset-Sitzung (Lagen stehen in den Daten, Import genügt)

- **Garage (Open Bay, Sakura; Stellvertreter: Hallenmodell):** Werkbank 2,0 × 0,8 × 0,9 m; Reifenregal mit Felgen 1,8 × 0,5 × 2,0 m;
  Lackmuster-Tafel 1,2 × 0,05 × 0,9 m (12 Felder); Motor auf Montagebock 0,9 × 0,6 × 1,0 m; Schild „GARAGE · E“ 2,5 × 0,6 m über dem Tor. Je ≤ 1,5 k.
- **Rennen:** Event-Pfeiler 6–8 m, Kontrollpunkt-Bogen, Start-Ziel-Banner, Pokal 0,4 m; Needle: Tribüne, Boxen, Brücke. ≤ 2 k.
- **Schanzen (Stellvertreter: Betonkeil):** Erdwall/Holzrampe je Ort (Maße in `Data/Gameplay/Ramps.asset`), Tempo-Schild, Lande-Tafel, Absperrung. ≤ 1,5 k.
- **Entdeckungen (Stellvertreter: Raute + Pfosten):** 20 kleine Props, Liste in `Data/Gameplay/Discoveries.asset` (je Karte `title`). Je ≤ 1,5 k.
- **Aus Phase 6 offen:** Spielfigur, Passanten/Tiere, Verkehrsautos, vorzerlegte Props + Baum, Ladeninnere, Ausstellungsautos, Kanalbrücken, Turm-Fernstufe.

## Für dich (Mensch)

1. **Phase 8 ausprobieren (~20 Min.):** `Boot` → ▶ Play. Du stehst zu Fuß in Sakura.
   - **Sparks verdienen:** ein paar Schritte = Region (+200); Rauten mit **E** (+100); im Auto (**F**) in der Kirsch-Schale **Leertaste + lenken** (Drift).
   - **Garage:** zum Tor der **Open Bay** (die Halle mit dem blauen Hebebühnen-Rahmen, rechts vom Start) gehen oder langsam fahren → **E**.
     Links Autos (Mame K kostet 2 400), rechts Teile, Setup, Lack, Felgen, Kit. **E** oder **Esc** = hinausfahren. Spürst du Motor Sport / Reifen?
   - **Rekorde:** **Tab** (Tempo, Flugzeit, Sprung, Drift, Strecke mit Bild; Meilensteine; Bestzeiten je Auto). Sprung: Schanze **Petal Hop**
     südöstlich über die Ringstraße mit Vollgas.
   - **Foto:** **P** = Pause + freie Kamera (WASD, Q/E, rechte Maustaste, Mausrad), **Enter** = Foto → `Captures/Photos/`. **P** = zurück.
   - **Speichern:** Play beenden, wieder starten → du sitzt im Auto an der letzten Parkstelle, alles ist noch da.
   - Fühlt sich das Tempo richtig an (erstes Auto nach ~1 Sitzung, schnellstes nach ~19)?
2. **Handy im WLAN** (ab jetzt diese Adresse): `node Tools/serve-web.mjs --lan` → die Zeile **„phone (use this): http://….local:8090/“** öffnen.
   Eine nackte IP friert das Spiel ein (Seitensperre von CrazyGames).
3. **Selbst im Browser spielen:** `Vorschau.command` (Port 8092, letzter Build). Nicht, während Tests/Bilder laufen.
4. Noch offen aus früher: Abnahmen Phase 4–7, Hachi-Heckscheibe, alte Zweige `agent/*`. Commits liegen lokal; **Push** nur, wenn du es sagst.

## Web-Build

| Datum | Typ | Gesamt | wasm | data | Boot (lokal) |
|---|---|---|---|---|---|
| 2026-10-09 | Release, + Assets 5b/5c/Flora/Scatter (248 Modelle) | 53,91 MB | 5,74 MB | 47,97 MB | 0,8–0,9 s |
| 2026-10-09 | Release, Phase 7 (Spielinhalt) | 53,97 MB | 5,76 MB | 48,02 MB | 0,8–1,1 s |
| 2026-10-10 | Release, Phase 8 (CrazyGames-SDK, Garage, Speichern, Rekorde) | 54,28 MB | 5,99 MB | 48,10 MB | 1,1 s |
