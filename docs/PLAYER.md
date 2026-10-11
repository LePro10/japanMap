# Der CrazyGames-Spieler — und wie wir ihn halten

> Stand 2026-10-11 · Grundlage: CrazyGames-Doku (Basic-Launch-Kennzahlen, Qualitätsleitfaden), die Top-Autospiele
> der Plattform, deine Handy-Bilder vom 2026-10-11 und Messungen im Spiel. Was hier „gemessen“ heißt, steht im
> Abschnitt 4 mit Werkzeug. Alles andere ist Annahme und wird mit deinen Launch-Zahlen (LAUNCH.md §7) geprüft.

## 1. Wer kommt da?

- **Jung, ungeduldig, viele Spiele zur Wahl.** Ein Klick auf ein Vorschaubild, kein Kauf, kein Download. Das nächste
  Spiel ist einen Klick entfernt — es gibt keinen Grund, ein langweiliges Spiel zu Ende zu laden.
- **Gerät:** überwiegend Desktop/Chromebook (Schule, Pause), ein wachsender Teil Handy. Chromebooks = schwache
  Intel-Grafik; Handys = kleiner Bildschirm, Daumen, oft hochkant.
- **Er hat das Vorschauvideo gesehen** (Sprünge, Drift, Nacht-Neon). Was er dort sah, will er in den ersten
  Sekunden selbst tun. Ein Spiel, das anders beginnt als sein Video, verliert ihn.
- **Er liest nicht.** Text über einem Satz wird übersprungen. Er drückt, was blinkt, und probiert Tasten.

## 2. Die vier Klippen (wo er geht)

| Klippe | Zeitpunkt | Was ihn hält | CrazyGames-Maß |
|---|---|---|---|
| 1. Laden | 0–10 s | Fortschritt sichtbar, kein Schwarz, Name des Spiels | Laden < 10 s |
| 2. Erster Eindruck | 10–60 s | **Sofort Action**, die zum Video passt; nichts Kaputtes | *Conversion* = spielt ≥ 1 min (Top: 80 %+) |
| 3. Erste Schleife | 1–10 min | Belohnung im Sekundentakt, ein klares nächstes Ziel, erster Kauf | Ø Spielzeit 10+ min |
| 4. Wiederkommen | Tag 1 | Gespeicherter Fortschritt, offenes Ziel, Sammlung | Tag-1-Wiederkehr 10–15 % |

**Klippe 2 ist die teuerste:** Wer dort geht, sieht nie, was das Spiel kann. Deine Bilder zeigen genau dort vier
Fehler auf einmal: schwarzer Bildschirm, eine Kiste statt Auto, Anzeigen übereinander, kein Intro.

## 3. Was die Besten auf CrazyGames gemeinsam haben (Autospiele)

- **In 3 Sekunden im fahrenden Auto.** Kein Aussteigen, kein Menü vor dem ersten Gas (Madalin Stunt Cars, Drift
  Hunters, Drive Mad).
- **Eine Schanze in Sichtweite.** Spektakel vor Erklärung.
- **Zahlen fliegen.** Drift-Punkte, Sprungweite, Geld — jede Aktion zählt sichtbar.
- **Erster Kauf in wenigen Minuten** (neues Auto/Teil) — danach „nur noch eins“.
- **Ruhige, große Bedienung.** Wenige Knöpfe, klare Form, nichts verdeckt die Straße.

## 4. Unser Spiel gegen diese Liste (Befund 2026-10-11)

| # | Befund | Beleg | Schwere |
|---|---|---|---|
| B1 | Handy: Anzeigen 1,3–3× zu groß, Tacho über Knöpfen, Knöpfe übereinander, Menü abgeschnitten | Deine Bilder; Ursache: Oberfläche rechnet mit dem Pixelfaktor des Handys (2,6/3), das Bild mit dem gedeckelten (2/1) | **kaputt** |
| B2 | Kiste statt Auto in den ersten Sekunden | Startauto wird erst nach dem Start geladen (2,3 MB, 176 000 Eckpunkte) | **kaputt** |
| B3 | Schwarz nach dem Ladebalken | Ladebalken verschwindet, sobald Unity läuft — das Gelände (3,4 MB) lädt danach noch | schlecht |
| B4 | **Kein Intro**: Das „First Drive“ des Prototyps (fahrender Start, Schanze, Zeitlupe, Rolle, Drift, Belohnung) wurde nie portiert | Kein Code, kein Plan-Eintrag | **größte Lücke** |
| B5 | Neuer Spieler startet zu Fuß / im stehenden Auto, „Tap OUT to get out“ als erster Satz | Bild 1 | schlecht |
| B6 | Menü wirkt billig („AI-Slop“): flache Kästen, gemischte Größen, ein großer gelber „Continue“ mitten in der Liste | Bild 2 | schlecht |
| B7 | Zu viele Knöpfe auf dem Handy (OUT, CAM, RESET, MENU, STUNT, BOOST, DRIFT, BRAKE + Lenkfeld) | Bild 1 | mittel |
| B8 | Größen-Prüfung war grün, obwohl alles übereinanderlag (nur Pixelfaktor 1, nur „startet es?“) | `sizes-web` | Werkzeug-Lücke |

## 5. Der Plan (Reihenfolge = Wirkung)

1. **B1 + B8:** Pixelfaktor aus dem Bild selbst lesen; `sizes-web` mit echten Handys (Android 2,625, iPhone 3,
   Touch) und einer Überlappungs-Prüfung im Spiel (`?uicheck=1`) — rot, sobald etwas übereinanderliegt.
2. **B2 + B3:** Ladebildschirm bleibt, bis Welt **und** Auto da sind (mit Fortschritt). Startauto auf ~40 000
   Eckpunkte → Asset-Sitzung.
3. **B4 + B5: „First Drive“ portieren.** Erster Start = man sitzt in einem Auto mit 95 km/h auf der Küstenstraße,
   Titelkarte „AMEAGARI DRIVE“, eine Taste je Hinweis (Gas → Nitro → Sprung in Zeitlupe → Rolle → Drift),
   +3 000 Sparks unterwegs — genug für den ersten Kauf. Überspringbar, nur beim ersten Mal. Danach Lotse zum
   nächsten Rennen (schon da).
4. **B6 + B7:** Menü und Handy-HUD neu gestalten (eine Linie, eine Schrift, klare Hierarchie, weniger Knöpfe).
5. **Messen:** `sizes-web`, Handy-Link, deine Zahlen nach dem Launch (Conversion, Spielzeit Handy/Desktop).

## 6. Grundsätze für alles Weitere

- **Die erste Minute ist ein Film, den der Spieler steuert** — nie ein Formular.
- **Eine Aktion je Hinweis**, und jeder Hinweis geht nach einer Frist auch ohne Eingabe weiter.
- **Belohnung sofort und sichtbar**; der erste Kauf spätestens nach 5 Minuten.
- **Nichts Kaputtes in den ersten 60 s** — jede Prüfung (Werkzeug) muss diese 60 s auf Handy und Desktop abdecken.
