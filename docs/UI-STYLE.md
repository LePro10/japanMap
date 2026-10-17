# UI-Stil — Laden, Titel, Menü

> Maßstab für alles, was der Spieler vor und neben dem Fahren sieht (D48). Kurz halten; Werte stehen in
> `Data/UI/Menu.uss`, `Data/UI/Title.uss`, `Data/UI/Game.uss` und `IntroSettings` (Titel-Kamera).
> Vorbilder: Forza Horizon 5/6, Need for Speed Unbound, Gran Turismo 7, The Crew Motorfest, gute Browser-Rennspiele
> auf CrazyGames (Drift Hunters u. ä.). Recherche 2026-10-17 — Quellen unten.

## Die 9 Muster

1. **Echte Welt statt Standbild.** Hinter dem Titel läuft das Spiel: blaue Stunde, Verkehr, Regenreste, die Kamera
   kreist langsam (2,5 °/s) und atmet (11 → 8 m in 40 s) ums eigene Auto. Kein gerendertes Bild, kein Download.
   *(FH: „Press Start" über lebender Szene.)*
2. **Ein großer Knopf, sofort.** Neuer Spieler: **START GAME** → Wischblende → direkt ins Intro auf der Straße.
   Wiederkehrer: **CONTINUE** mit Auto · Sparks · Spielzeit → Kamera fliegt in 1,4 s zum Auto, das Auto ist sofort
   fahrbar. Keine künstlichen Wartezeiten (CrazyGames-Qualitätsregel). Der erste Klick schaltet im Browser auch den Ton frei.
3. **Laden ist Stimmung, aber ehrlich.** Ladeseite = CSS-Bewegung (nasse Straße läuft auf den Spieler zu,
   Lichtspuren, Name Buchstabe für Buchstabe) + **echter** Fortschritt in Worten: *Downloading → Waking the city →
   Bringing your car → Ready*, dazu ein Tipp. Sie geht weich (0,5 s) in den Titel über, sobald er steht.
4. **Eine Stimme führt.** Je Seite eine Kopfzeile (Kicker + große Schrift) und **eine Hero-Kachel** (das Nächste,
   was zu tun ist), darunter halbe Kacheln. Nicht alles gleich laut (Kritik an FH5: „everything competes").
5. **Das Auto ist der Held.** Desktop/Querformat: Seite links (≤ 40 %, max. 760 px), rechts dreht das Auto,
   der Verlauf ist dort **ganz** klar (Freigabe 2026-10-17). Hochformat: Auto im oberen Fenster, Seite darunter.
6. **Bewegung kurz und gerichtet.** Fokus 140 ms (Kachel ×1,025, Cyan-Kante, CTA-Pfeil +6 px); Seiten gleiten
   240 ms von der Seite ihres Tabs (Q links, E rechts); Kacheln steigen 40 ms versetzt (letzte ≤ 0,5 s);
   Tab-Markierung gleitet 220 ms. Eingaben werden nie blockiert. *Reduced motion* / Niedrig: keine Streifen, kein
   Versatz, Kamera ruhig.
7. **Jedes Gerät, ein Fokus.** Pfeile / Steuerkreuz / Stick bewegen den Fokus nach Lage (nicht Baumreihenfolge),
   Enter / A wählt, Q/E bzw. Schultertasten wechseln Tabs, Esc / Start zurück. Maus-Hover setzt denselben Fokus.
   Touch: ganze Kachel ist das Ziel (≥ 48 px). Unten links eine Tasten-Legende (Desktop).
8. **Gesperrt heißt sichtbar.** Was die Karriere noch nicht freigibt, bleibt da: gedimmt, Schloss,
   „Unlocks: …" — ein Klick schüttelt nur kurz und sagt den Grund (`Core/Unlocks`, `MenuTiles.Gate`).
   Nie verstecken: der Spieler sieht, was kommt.
9. **Ton als Bestätigung.** Fokuswechsel = leiser Klick (0,3), Wählen = voller Klick, Gesperrt = dumpfer Klick
   (0,45) + Schütteln, Start = Klick + `Whoosh_Up`. Nur vorhandene Sounds; UI-Töne laufen auch im Pausenmenü.

## Farben, Schrift, Maße

| Was | Wert |
|---|---|
| Grund / Glas | Tinte `#06141a`, Kachel `rgba(7,17,28,.86)`, Hero `rgba(8,28,44,.9)` |
| Akzent | Cyan `#5ed6f5` / hell `#8fe6ff` (Fokus, Auswahl) — **Gold `#ffd166` nur für Sparks** |
| Text | Papier `#f6efe4`, gedämpft `#b7c4c8`; Kicker in Cyan, gesperrt 60 % Deckkraft |
| Schrift | Saira Condensed Bold für Titel, Tabs, Zahlen, Kicker (Versalien, Sperrung 3–7 px); Barlow für Fließtext |
| Größen Desktop (1080p) | Titelname 136, Seitenkopf 58, Hero 34, Kachel 26, Text 15–18, Tasten 15 |
| Größen Handy | Titelname 52–62, Seitenkopf 32, Kachel 19, Text ≥ 12, Ziele ≥ 48 px |
| Abstände | Kacheln 14 px (Handy 10), Innenrand 18–22 px, Ecken 12 px (Titel-Knöpfe 6 px) |

## Prüfen

- `node Tools/ui-shots.mjs` → `Captures/ui/` (Titel + Menü, Desktop / Hochformat / Querformat, gesperrte Kacheln)
  mit `UiLayoutProbe`-Urteil je Bild; `node Tools/loader-preview.mjs` → `Captures/loader/` (Ladeseite ohne Build).
- Tests: `TitleTests` (Titel hält gameplayStart, START per Klick, Enter ins Intro, Settings über dem Titel,
  gesperrter Tab, Pfeile zwischen Kacheln), `MenuUiTests` (Verlauf klar über dem Auto, Sperren).

## Quellen (Recherche 2026-10-17)

CrazyGames technische und Qualitäts-Anforderungen (docs.crazygames.com/requirements/technical, …/quality);
GTPlanet zu FH5-Menü und FH6-Test; GTPlanet/VGC zu GT7; Push Square zu The Crew Motorfest; Xbox Accessibility
Guidelines 101 (Textgrößen); Material-3-Bewegung (Dauer 200–500 ms). Zahlen zu Fokus/Übergängen sind eigene
Festlegungen im üblichen Bereich, nicht von den Studios veröffentlicht.
