# Launch auf CrazyGames

> Was CrazyGames beim Hochladen verlangt, und alles, was dafür vorbereitet ist. **Du lädst hoch, nicht der Agent.**
> Quellen (Stand 2026-10-11): docs.crazygames.com/requirements/intro, …/technical, …/gameplay, …/ads,
> …/game-covers, …/quality. Prüfung jedes Punkts: [QA.md](QA.md).

## 1. Hochlade-Liste (in dieser Reihenfolge)

| # | Feld im Developer-Portal | Was eintragen / hochladen | Fertig? |
|---|---|---|---|
| 1 | **Spieldatei** | Den **Inhalt** von `Builds/Web` als ZIP (nicht den Ordner selbst): `node Tools/build-web.mjs`, dann im Finder alle Dateien in `Builds/Web` markieren → Rechtsklick → „Komprimieren“. `size-report.txt` nicht mitnehmen (stört nicht). | Build nach QA |
| 2 | **Name** | Entscheidung offen (D-Offen „Spielname“) — Vorschläge unten §2 | **du** |
| 3 | **Beschreibung** | §3 (Englisch), so einfügen | ✅ |
| 4 | **Steuerung (Controls)** | §4, so einfügen | ✅ |
| 5 | **Kategorie / Tags** | Kategorie **Driving** (Unterkategorie, falls gefragt: *Car*); Tags §5 | ✅ |
| 6 | **Ausrichtung** | **Querformat (Landscape)**; Hochformat: ja, unterstützt (das Spiel hat ein Hochkant-Layout) | ✅ |
| 7 | **Geräte** | Desktop ✅, Handy ✅ (Touch). iOS schaltet CrazyGames für Unity selbst erst später frei. | ✅ |
| 8 | **Cover** | 3 Bilder, nur der Spielname als Text: `Captures/launch/cover-1920x1080.png`, `cover-800x1200.png`, `cover-800x800.png` (Titel setzt du oder ich, sobald der Name feststeht) | Bilder ✅, Titel offen |
| 9 | **Vorschau-Videos** | 2 Videos, je 15–20 s, **ohne Ton**, erstes Bild = Cover: quer 1920×1080, hochkant 1080×1620 — `Captures/launch/preview-landscape.mp4`, `preview-portrait.mp4` | siehe STATUS |
| 10 | **SDK / Launch-Art** | **Basic Launch** zuerst (Werbung ist dort aus; das Spiel blendet die Werbe-Knöpfe dann selbst aus). Full Launch später, wenn CrazyGames das Spiel auswählt. | ✅ |
| 11 | **Alter** | PEGI 12 / 13+: keine Gewalt (Fußgänger werden nur weggeschubst und stehen wieder auf), kein Chat, keine Käufe | ✅ |
| 12 | **Sprache** | Englisch | ✅ |

Vor dem Hochladen: QA-Tool von CrazyGames (Portal → Spiel → „Preview/QA“) durchklicken: Werbung (Demo), Login,
Speichern im Rahmen, Mausfang, Esc im Vollbild (siehe QA.md, Punkte „nur im QA-Tool“).

## 2. Spielname (du entscheidest)

Arbeitstitel „japanMap“ ist kein Spielname. CrazyGames verlangt einen eigenen, nicht verwechselbaren Namen
(„avoid names that resemble other games“). Vorschläge (alle frei geprüft per Suche: noch zu tun, sobald du wählst):

1. **Ameagari Drive** — „Ameagari“ = „nach dem Regen“ (unser Look „Blaue Stunde nach Regen“), „Drive“ sagt, was es ist.
2. **Blue Hour Japan** — die Stimmung als Name, englisch verständlich.
3. **Touge Hour** — Bergpass + blaue Stunde, klingt nach Drift.

Empfehlung: **Ameagari Drive** (eigen, suchbar, beschreibt das Spiel).

## 3. Beschreibung (Englisch, zum Einfügen)

> Drive a quiet, rain-washed Japan at blue hour — in one open world with no loading screens.
>
> Start on foot in Sakura Commons, jump into your first car and go wherever the road takes you: neon streets in
> Neo Tokyo, the harbour of Tideglass, the hairpins of Cinder Pass, rice terraces, temples and a hidden circuit.
>
> **What you can do**
> - Drive ten original cars, from the tiny Mame K to the Hanami SF-26 — each with its own weight, grip and sound.
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
