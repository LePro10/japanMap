# QA-Durchgang (Phase 11)

> Jede Zeile = eine Abnahme aus PLAN.md (Phasen 2–10) oder eine CrazyGames-Regel ([LAUNCH.md](LAUNCH.md) §6).
> **Nur mit Beleg abgehakt.** ✅ gemessen grün · ⚠️ gemessen, mit Einschränkung · 👤 nur du / echtes Gerät / QA-Tool.
> Wiederholen: dieselben Befehle. Rechner: MacBook (Apple M4), Unity 6000.6.4f1, Chrome headless (Playwright).
> Stand aller Zeilen: **2026-10-11**, Build `Builds/Web` von 11:08 (Release, Commit 78e1b67 + Werkzeuge).

## 0. Läufe, die alles tragen

| Lauf | Befehl | Ergebnis |
|---|---|---|
| EditMode | `node Tools/unity-test.mjs EditMode` | ✅ 136/136 |
| PlayMode gesamt | `node Tools/unity-test.mjs PlayMode` | ✅ 191/199 + 7 „nur auf Abruf“; 1 rot (Verkehr, Testfehler) → behoben, 3× grün; neu seitdem: Bildraten-Test, AdBlock-Test, Ton-Ort-Test (je grün) |
| Web-Build | `node Tools/build-web.mjs` | ✅ 82,2 MB in 96 Dateien, Start 18,46 MB |
| SDK + Nachladen + Bild | `node Tools/sdk-web.mjs --stream --probe` | ✅ 18,44 MB bis gameplayStart, 58 Szenen in 34 s, Bild 72 % hell |
| Rauchprobe Niedrig 3× | `node Tools/smoke.mjs --gpu --quality Low` | ✅ 396 / 358 / 355 fps, 0 Fehler |
| Rauchprobe Hoch 2× | `node Tools/smoke.mjs --gpu` | ✅ 108 / 109 fps (P10: 95), 0 Fehler |
| Speichern im Browser | `node Tools/save-web.mjs` | ✅ lokal („This device“) und SDK („CrazyGames“) überleben Neuladen |

## Phase 2 — Karte

| Abnahme | Beleg | |
|---|---|---|
| Checkpoints ≤ 0,1 m | `MapImportTests.Terrain_MatchesLegacyCheckpoints` | ✅ |
| Importer 2× → identisch | `MapImportTests.ImportAll_TwiceGivesIdenticalMap`, `TerrainImport_TwiceGivesIdenticalHeights` | ✅ |
| Straßen liegen auf dem Gelände, nichts sticht durch | `Roads_LieOnTheCarvedTerrain`, `Terrain_NeverPokesThroughARoad`, `Props_AllPlacedOnTheGround` | ✅ |
| Bilder 6 Blickpunkte neben dem Prototyp | Phase-2-Bilder (git), Lage seither durch Tests gesichert | ✅ (P2) |
| Web-Build Größe + FPS notiert | §0 | ✅ |

## Asset-Sprint

| Abnahme | Beleg | |
|---|---|---|
| Jedes Asset im Budget, mit LOD + Kollider | `LibraryTests.EveryApprovedAsset_HasAPrefabWithLodAndColliders`, `PlaceTests.EveryPlace_StaysInItsTriangleBudget` | ✅ |
| Exporte reproduzierbar | Asset-Sitzung (`ArtSource/`, nicht Teil dieser Sitzung) | 👤 Asset-Sitzung |

## Phase 3 — Fahren

| Abnahme | Beleg | |
|---|---|---|
| Prüfstände grün für alle 10 Autos | `VehicleBenchTests` (im PlayMode-Gesamtlauf) | ✅ |
| Ring-Runde + Pass-Abfahrt ohne Hängenbleiben | `AcceptanceDriveTests`, `RingDipTests` (0 Aufsetzer) | ✅ |
| Gleiches Fahren bei jeder Bildrate (CrazyGames 144/165 Hz) | **neu** `PlayerDriveTests.SameDrive_At30And144Fps`: 46,0 / 46,0 km/h, 17,7 / 17,5 m bei 91 / 195 Bildern in 3 s | ✅ |
| Fahrgefühl | — | 👤 offen seit Phase 3 |

## Phase 4 — Look

| Abnahme | Beleg | |
|---|---|---|
| Alle 50 Blickpunkte Hoch + Niedrig | `node Tools/bench.mjs p11-qa <alle>` → `Captures/bench-p11-qa-{High,Low}.txt` (jetzt immer bei 1920×1080) | ✅ |
| Niedrig: < 400 Draw-Calls | 47/50; über: funaura-mole 504, koedo-reis 451, funaura-kai 407 | ⚠️ |
| Niedrig: < 800 k Dreiecke | 50/50 (max koedo-reis 646 k) | ✅ |
| Hoch: < 1 500 Draw-Calls / < 3 M Dreiecke | DC 46/50; Dreiecke 30/50 (max koedo-reis 6,2 M) — Entscheidung nach Gerätemessung (iGPU-Laptop) | ⚠️ |
| FPS-Ziel Niedrig gehalten | Rauchprobe 355–396 fps (M4) | ✅ (auf diesem Rechner) |
| Konsole sauber | Rauchproben 0 Fehler; Editor: 0 eigene Warnungen außer 3 alten Unity-6.6-Veraltet-Hinweisen | ✅ |
| Optik | — | 👤 |

## Phase 5 — Orte

| Abnahme | Beleg | |
|---|---|---|
| Je Ort 2–3 Blickpunkte | 40 Orts-Blickpunkte in `bench-p11-qa` | ✅ |
| Dreiecks-Budget je Ort | `PlaceTests.EveryPlace_StaysInItsTriangleBudget` | ✅ |
| Häuser nicht auf Straßen, Start in Sakura | `PlaceTests.Buildings_DoNotStandOnRoads`, `Spawn_IsInSakuraCommons` | ✅ |

## Phase 6 — Zu Fuß und Leben

| Abnahme | Beleg | |
|---|---|---|
| 10 min Simulation, kein Fußgänger auf der Fahrbahn | `PedestrianTests.TenMinutes_…`: 42 028 Stichproben, Ø 40 aktiv, 0 auf der Fahrbahn (Gesamtlauf und einzeln) | ✅ |
| Zerstörung ≤ 2 ms | `SmashTests.Cost_…`: schlimmster Bruch 1,19–1,27 ms (vorher 2,1–2,35), Physik 0,6–0,7 ms bei 64 Teilen | ✅ |
| Verkehr hält vor Personen | `TrafficTests.TrafficCar_StopsForAPersonOnTheRoad` 3× grün | ✅ |

## Phase 7 — Spielinhalt

| Abnahme | Beleg | |
|---|---|---|
| Jede Veranstaltung KI gegen KI Start→Ziel | `RaceAcceptanceTests.Event_AiAgainstAi_StartToFinish_NoStuckCar` | ✅ |
| Rundenzählung an der Naht | `RaceProgressTests` (6 Fälle) | ✅ |
| 24 Entdeckungen, 8 Regionen, Schanzen | `DiscoveryTests`, `RegionTests`, `RampTests` | ✅ |

## Phase 8 — Fortschritt und Speichern

| Abnahme | Beleg | |
|---|---|---|
| Wirtschaft als Tabelle simuliert | `EconomyTests` | ✅ |
| Tuning ändert das echte Auto + Speicherstand | `GarageTests.Buy_Fit_DriveOut_…` | ✅ |
| Speichern übersteht Neustart, kaputter Stand bricht nichts | `SaveRestartTests`, `ProgressStoreTests`, Browser `save-web` | ✅ |

## Phase 9 — UI, HUD, Ton

| Abnahme | Beleg | |
|---|---|---|
| ESC pausiert alles, Menü per Klick | `MenuTests.Escape_PausesEverything_…` | ✅ |
| Touch-Menü, Touch-Fahren | `TouchMenuTests`, `PlayerDriveTests.Touch_…` (3× grün nach Behebung) | ✅ |
| Lesbar bei DPR 1 in 907×510, 1216×684, 1280×720, 1920×1080, 800×450, 1080×607 | **neu** `node Tools/sizes-web.mjs` → `Captures/p11-sizes/` (HUD + Menü je Größe), angesehen | ✅ |
| Ton: Motor folgt dem Getriebe, 3D-Töne bleiben an ihrem Ort | `AudioTests` (neu: `PositionedSounds_KeepTheirOwnPlace`) | ✅ |
| Bedienung Handy, Klang mit Kopfhörern | — | 👤 |

## Phase 10 — CrazyGames-Anforderungen

| Regel | Beleg | |
|---|---|---|
| Start ≤ 20 MB bis gameplayStart | 18,44 MB (`sdk-web`) | ✅ |
| Gesamt ≤ 250 MB / ≤ 1 500 Dateien | 82,2 MB / 96 | ✅ |
| Laden ≤ 20 s | lokal 1,5–4,4 s; Chromebook-Profil (CPU ÷4) 4,0 s; **5 Mbit/s: 30,9 s** (18,4 MB brauchen dort physikalisch 29,5 s) | ⚠️ langsames Netz |
| Nachladen bei langsamem Netz | **neu** `sdk-web --net 5 --stream`: alle 58 Szenen in 70 s; eigenes Auto nach 14,6 s (vorher 20,9), Straßen direkt danach (vorher erst nach Tokyo) | ✅ |
| Chrome/Edge | Chromium headless, alle Läufe | ✅ |
| Safari | `sdk-web --browser webkit --probe`: läuft, Bild 72 % | ✅ (WebKit; echtes iPhone 👤) |
| Chromebook 4 GB | Speicher Niedrig 411 MiB kurz nach Start (P10 nach allem Nachladen 493 MiB), CPU ÷4: 4,0 s bis Spiel | ✅ Profil · 👤 Gerät |
| SDK: gameplayStart/Stop, Datenmodul, Nutzer | `sdk-web` (Menü stop/start), `save-web` (CrazyGames-Speicher), `PlatformTests` | ✅ |
| Direkt ins Spiel (Full Launch) | Spiel startet zu Fuß in Sakura Commons, kein Titelmenü | ✅ |
| Kein eigener Vollbild-Knopf, keine fremden Links | Code durchsucht: kein Fullscreen, keine Links | ✅ |
| Relative Pfade, Sitelock, kein Markieren, Safe Area | P10 (Template unverändert) | ✅ |
| **AdBlock:** spielbar ohne Werbung | `sdk-web --adblock sdk`: SDK gesperrt → Start nach 7,4 s (6 s SDK-Wartezeit), Spiel läuft, Bild da, Speichern lokal | ✅ |
| **AdBlock:** keine toten Rewarded-Knöpfe, Hinweis statt Popup | `PlatformTests.AdBlocker_NoDeadAdButton_…` (D40) | ✅ |
| AdBlock mit echtem SDK (Werbe-Server gesperrt) | lokal meldet das SDK immer „kein AdBlocker“ und spielt Demo-Werbung | 👤 QA-Tool mit AdBlocker |
| Werbung (Demo), Login, Speichern im Rahmen, Mausfang, Foto-Download | nur im CrazyGames-QA-Tool | 👤 |
| **Esc im Vollbild / bei gefangener Maus** | CrazyGames: „Escape beendet den Vollbildmodus“; bei gefangener Maus gibt Esc nur die Maus frei. **Neu:** Desktop-Knopf „MENU · Esc“ oben rechts + Menü öffnet, wenn der Browser die Maus freigibt — `MenuTests.DesktopMenuButton_AndFreedMouse_OpenTheMenu`, Bild `Captures/p11-deskmenu/corner.png` | ✅ · 👤 im QA-Tool gegenprüfen |
| Handy: Touch, Speicher (DXT→ASTC nur bei Bedarf, D37) | — | 👤 Gerät |
| Physik gleich bei 60/144/165 Hz | §3 | ✅ |

## Gefunden und behoben in diesem Durchgang

- `UiPanel.Size` blieb bei geklemmtem Maßstab alt (Größenwechsel der Spielansicht) → `UiPanel.Apply`, `UiPanelTests`.
- Erster Abspielvorgang jedes Tons entpackte den Clip (1–1,5 ms Ruckler) → alle Töne vorgeladen.
- Alle 3D-Töne hingen an einem Objekt: ein neuer Ton verschob alle laufenden → je Stimme ein Objekt.
- Werbe-Knopf mit AdBlocker tat nichts → ausgeblendet + Hinweis (D40).
- Esc erreichte das Spiel im Vollbild/bei gefangener Maus nicht → Desktop-Knopf MENU + Pause bei freigegebener Maus.
- Langsames Netz: Tokyo lud vor Straßen und eigenem Auto → Reihenfolge geändert.
- Werkzeuge: `bench` maß bei zufälliger Fenstergröße (4K → 2–3× Dreiecke) → immer 1920×1080; `sdk-web` nahm die
  schwarze Ladebild-Probe → Probe nach gameplayStart; neue Schalter `--adblock [sdk]`, `--net <Mbit/s>`;
  neue Werkzeuge `sizes-web.mjs`, `editor-restart.mjs`.
