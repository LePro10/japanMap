# Launch auf CrazyGames

> Was CrazyGames beim Hochladen verlangt, und alles, was dafür vorbereitet ist. **Du lädst hoch, nicht der Agent.**
> Quellen (Stand 2026-10-11): docs.crazygames.com/requirements/intro, …/technical, …/gameplay, …/ads,
> …/game-covers, …/quality. Prüfung jedes Punkts: [QA.md](QA.md).

## 1. Hochlade-Liste (in dieser Reihenfolge)

| # | Feld im Developer-Portal | Was eintragen / hochladen | Fertig? |
|---|---|---|---|
| 1 | **Spieldatei** | Den **Inhalt** von `Builds/Web` als ZIP (nicht den Ordner selbst): `node Tools/build-web.mjs`, dann im Finder alle Dateien in `Builds/Web` markieren → Rechtsklick → „Komprimieren“. `size-report.txt` nicht mitnehmen (stört nicht). | Build nach QA |
| 2 | **Name** | **Ameagari Drive** (D41) | ✅ |
| 3 | **Beschreibung** | §3 (Englisch), so einfügen | ✅ |
| 4 | **Steuerung (Controls)** | §4, so einfügen | ✅ |
| 5 | **Kategorie / Tags** | Kategorie **Driving** (Unterkategorie, falls gefragt: *Car*); Tags §5 | ✅ |
| 6 | **Ausrichtung** | **Querformat (Landscape)**; Hochformat: ja, unterstützt (das Spiel hat ein Hochkant-Layout) | ✅ |
| 7 | **Geräte** | Desktop ✅, Handy ✅ (Touch). iOS schaltet CrazyGames für Unity selbst erst später frei. | ✅ |
| 8 | **Cover** | 3 Bilder, nur der Spielname als Text: `Captures/launch/cover-1920x1080-title.png`, `cover-800x1200-title.png`, `cover-800x800-title.png` (Titel „Ameagari Drive“, D41) | ✅ |
| 9 | **Vorschau-Videos** | 2 Videos, 15,7 s, ohne Ton, erstes Bild = Cover: `Captures/launch/preview-landscape.mp4` (1920×1080, 28,7 MB), `preview-portrait.mp4` (1080×1620, 18,6 MB). Inhalt: Einsteigen, Drift in der Sakura-Schüssel, Neon-Avenue. Neu drehen: `node Tools/store-media.mjs --shoot --title "Name"` (Editor offen, ~10 min) | ✅ Entwurf |
| 10 | **SDK / Launch-Art** | **Basic Launch** zuerst (Werbung ist dort aus; das Spiel blendet die Werbe-Knöpfe dann selbst aus). Full Launch später, wenn CrazyGames das Spiel auswählt. | ✅ |
| 11 | **Alter** | PEGI 12 / 13+: keine Gewalt (Fußgänger werden nur weggeschubst und stehen wieder auf), kein Chat, keine Käufe | ✅ |
| 12 | **Sprache** | Englisch | ✅ |

Vor dem Hochladen: QA-Tool von CrazyGames (Portal → Spiel → „Preview/QA“) durchklicken: Werbung (Demo), Login,
Speichern im Rahmen, Mausfang, Esc im Vollbild (siehe QA.md, Punkte „nur im QA-Tool“).

## 2. Spielname: **Ameagari Drive** (entschieden 2026-10-11, D41)

Arbeitstitel „japanMap“ ist kein Spielname. CrazyGames verlangt einen eigenen, nicht verwechselbaren Namen
(„avoid names that resemble other games“). Vorschläge (alle frei geprüft per Suche: noch zu tun, sobald du wählst):

1. **Ameagari Drive** — „Ameagari“ = „nach dem Regen“ (unser Look „Blaue Stunde nach Regen“), „Drive“ sagt, was es ist.
2. **Blue Hour Japan** — die Stimmung als Name, englisch verständlich.
3. **Touge Hour** — Bergpass + blaue Stunde, klingt nach Drift.

Empfehlung: **Ameagari Drive** (eigen, suchbar, beschreibt das Spiel). Suche 2026-10-11: es gibt „Ameagari no Hanaby“
(2018, Jump'n'Run, PC) — anderes Genre, anderer Name; „Blue Hour Japan“/„Touge Hour“: kein Spiel gefunden.

**Autonamen (entschieden, D41):** Markenkürzel entfernt — Hachi H8, Kumo S22, Raiden R4, Suprema Z7, Rotor R7,
Hanami S26; Optik bleibt. Wache: `StoreNamesTests`.

## 3. Beschreibung (Englisch, zum Einfügen)

> Drive a quiet, rain-washed Japan at blue hour — in one open world with no loading screens.
>
> Start on foot in Sakura Commons, jump into your first car and go wherever the road takes you: neon streets in
> Neo Tokyo, the harbour of Tideglass, the hairpins of Cinder Pass, rice terraces, temples and a hidden circuit.
>
> **What you can do**
> - Drive ten original cars, from the tiny Mame K to the Hanami S26 — each with its own weight, grip and sound.
> - Drift for Sparks: chain slides, build a multiplier up to ×5 and double it in drift zones.
> - Race seven events against AI drivers: Coast Loop, Neon Circuit, Tōge Descent and Climb, Ring Time Trial,
>   Tōge Drift Run and Needle Sprint.
> - Explore eight regions and find 24 discoveries, some with little puzzles.
> - Jump ramps, pull 360s, smash fences and lamp posts.
> - Buy, tune and paint cars in the garage; take photos in photo mode.
> - Get out and walk: shops, quays and side streets are open on foot.
>
> Your progress is saved automatically. Plays on desktop and phone.

Kurzfassung (falls ein Feld nur ~160 Zeichen nimmt):

> Open-world driving in a rain-washed Japan at blue hour: ten cars, drift chains, seven races, 24 discoveries — and you
> can get out and walk.

## 4. Steuerung (Controls, Englisch)

> **Car:** W / ↑ accelerate · S / ↓ brake and reverse · A D / ← → steer · Space handbrake (drift) · Shift boost ·
> R reset to the road · C camera · B look back · mouse wheel zoom
> **On foot:** WASD move · mouse look · Shift run · Space jump · C slide (while running)
> **Anywhere:** F get in / out · H call your car · E interact · M map · Tab records · P photo mode · Esc or the MENU button: menu
> **Gamepad** supported. **Touch:** on-screen pad and buttons (auto-throttle: touch the pad to drive).
> Keys can be changed in Settings → Controls.

## 5. Tags (Vorschlag)

`Driving`, `Car`, `Drift`, `Open World`, `Racing`, `3D`, `Exploration`, `Japan`, `Mouse`, `Keyboard`, `Mobile`.

## 6. Was die Plattform beim Basic Launch prüft (und wo es belegt ist)

| Regel (CrazyGames) | Beleg |
|---|---|
| Start ≤ 50 MB (≤ 20 MB für Handy-Startseite), gesamt ≤ 250 MB, ≤ 1 500 Dateien | QA.md §10 |
| Läuft in Chrome/Edge, Safari nicht kaputt, Chromebook 4 GB flüssig | QA.md §10 |
| Text lesbar bei DPR 1 in 907×510, 1216×684, 1280×720, 1920×1080, Handy 800×450, Tablet 1080×607 | QA.md §11 |
| Physik gleich bei 60/144/165 Hz | QA.md §11 |
| Kein eigener Vollbild-Knopf, keine fremden Links/Werbung, PEGI 12 | QA.md §11 |
| Basic Launch: Werbung aus, aber Werbe-Code darf nicht hängen, keine toten Rewarded-Knöpfe | QA.md §12 |
| Full Launch: SDK gameplayStart/Stop, Datenmodul, Nutzer-Modul, direkt ins Spiel, AdBlock spielbar | QA.md §10, §12 |

## 7. Nach dem Launch: Zahlen, die du mir gibst

CrazyGames zeigt im Developer-Portal (Spiel → Analytics) Zahlen je Tag. Bitte nach **7 Tagen** (und wieder nach 14)
als Bildschirmfoto oder abgetippt schicken:

| Zahl im Portal | Wofür |
|---|---|
| Gameplays / Plays je Tag, davon Handy/Desktop | Basis; Verteilung der Geräte |
| **Durchschnittliche Spielzeit** (avg. playtime) je Gerät | Hauptmaß für Einnahmen |
| **Retention** Tag 1 / Tag 7 | Wiederkehr |
| Anteil, der das Spiel überhaupt startet (Load → Gameplay; „conversion“ o. ä.) | Ladeabbruch (Startgröße, Zeit) |
| Bewertung (Daumen) und Kommentare | Was Spieler stört |
| Browser/Länder, falls angezeigt | Safari/Handy-Probleme |

Auswertung (Phase 11/3): Absprungstellen sind dort, wo die Zeit endet — (1) **vor dem Spiel** (Startanteil niedrig →
Ladezeit/Größe), (2) **in der ersten Minute** (Spielzeit < 2 min → Einstieg: zu Fuß starten, Auto finden, Steuerung),
(3) **nach dem ersten Ziel** (Spielzeit 2–8 min, Tag-1-Wiederkehr < 10 % → was danach fehlt: Rennen, Sparks, Garage).
Für jede der drei größten Stellen: Ursache messen, beheben, wieder messen. Dann Full Launch (CrazyGames wählt aus; das
SDK und die Werbung sind schon fertig).

**CrazyGames-Maßstäbe** (docs.crazygames.com/resources/basic-launch-metrics, 2026-10-11): *Conversion* = Anteil, der
**≥ 1 min** spielt (Top-Spiele 80 %+); Laden < 10 s; Build < 20 MB; Ø Spielzeit 10+ min; Tag-1-Wiederkehr 10–15 %.
Basic Launch endet nach ≥ 7 Tagen **und** ≥ 500 Plays (sonst nach 21 Tagen); CrazyGames entscheidet über Full Launch.

### 7a. Vor deinen Zahlen schon behoben (gemessen, 2026-10-11)

| Stelle | Ursache (gemessen) | Behoben | Nachher |
|---|---|---|---|
| 1 vor dem Spiel | SDK vom AdBlocker gesperrt → Warten aufs 6-s-Timeout (7,7 s statt 4,4 s bis spielbar, gleiche Messart) | Seite merkt den Skriptfehler, Spiel startet sofort (`sdk-web --adblock sdk` wird rot bei Warten) | 4,2 s gesperrt / 4,4 s normal (je 2× abwechselnd) |
| 2 erste Minute | Desktop: keine Tastenerklärung im Spiel (nur „F Get in“); CrazyGames verlangt „keyboard overlay“ | Tastenkappen je Modus bis 4 min Spielzeit (`MenuTests.KeyHints_…`) | Bild `Captures/p11-keys/crops2.png` |
| 3 nach dem ersten Ziel | Ziele nur im Pausenmenü; beim Fahren zeigte nichts zum nächsten Rennen | Lotse: nach 25 s Fahrt Pfeil + „Next: <Rennen>“ bis 2 Rennen beendet (`NextGoalTests`) | Bild `Captures/p11-goal/flash.png` |

### 7b. Hypothesen, die nur deine Zahlen prüfen können

| # | Wenn die Zahl so aussieht … | … vermute ich | Prüfplan (ich messe dann) | Mögliche Abhilfe |
|---|---|---|---|---|
| H1 | Conversion Handy deutlich < Desktop | Start 18,4 MB bei langsamem Netz: 5 Mbit/s + CPU ÷4 = **34 s** bis spielbar, 20 Mbit/s + CPU ÷4 = **11,4 s** (2026-10-11 Teil 3: reine Bytezahl — Gelände parallel vorladen brachte 0 s; Unity-Logo raus, −0,04 MB; Code 6,7 MB ohne entbehrliche Module) | `sdk-web --net 5 --cpu 4` je Datei; Länder/Browser aus dem Portal | Nur noch große Schritte: Gelände in Kacheln (3,4 MB → ~1 MB um den Start), Straßen-Daten nachladen (2,8 MB roh) — erst, wenn deine Zahlen Handy-Abbrüche zeigen |
| H2 | Conversion gesamt < 70 % | Start zu Fuß: Spieler findet Auto/„F“ nicht oder versteht das Ziel nicht | Kommentare; Spielzeit-Verteilung < 1 min; play.mjs Erstbild Handy hochkant | Start direkt im Auto (Regeländerung → nur mit deinem Wort, D-Eintrag) |
| H3 | Ø Spielzeit 2–8 min, Tag 1 < 10 % | nach dem ersten Auto fehlt ein nächstes Ziel (Mame K 2.400, dann Mini Hauler 3.600) | ECONOMY.md „Sitzungen bis Kauf“, Records-Zahlen im Spielstand | Lotse auch auf Autokauf zeigen; Tagesziel; Preise (nur mit Zustimmung) |
| H4 | Handy-Spielzeit ≪ Desktop | Ruckeln/Hitze auf echten Geräten (iGPU-/Handy-Test fehlt) | dein Geräte-Test + `smoke --gpu --quality Low` | Niedrig-Stufe enger, DXT→ASTC (D37) |
| H5 | Viele Abbrüche in Safari | iOS/WebKit-Speicher | Portal-Browserzahlen; `sdk-web --browser webkit` | ASTC, kleinere Texturen |
