# Karriere — der lange Einstieg (D50)

> Wie ein neuer Spieler vom ersten Sprung bis „Career complete" geführt wird. Die Kette steht als Daten in
> `Data/Gameplay/Career.asset` (`CareerSettings`); diese Tabelle beschreibt sie. Code: `Scripts/Gameplay/Career/`.
> Prüft: `CareerTests` (EditMode: Kette, Sackgassen, Wirtschaft), `CareerPlayTests` (PlayMode: echte Wege).

## Recherche — was die Vorbilder tun

| Spiel | Was wir übernehmen |
|---|---|
| **Forza Horizon 4/5/6** | Die erste Minute ist ein *Showcase* (Sprung, Zeitlupe, Wechsel der Kulisse), erst danach Menüs. Danach eine „snackbare" Kette kurzer Ziele (Accolades/Kapitel), die Festival-Bereiche nacheinander öffnet; eine Stimme (Anna) sagt immer genau **ein** nächstes Ziel; der Wegpunkt ist schon gesetzt. Kritik an FH5: alles zu schnell frei, nichts fühlt sich verdient an → bei uns schaltet jeder Schritt **etwas Sichtbares** frei. |
| **Need for Speed (Heat, Unbound)** | Prolog mit Action, dann Garage: Geld → erstes Teil → Auto sieht/fährt anders. Das erste Upgrade kommt sehr früh. |
| **Mario Kart Tour / Handy-Rennspiele** | Alle 30–90 s eine Belohnung (Geschenk, Stern), sichtbarer Fortschrittsbalken, Tagesziel ab Tag 1. |
| **CrazyGames-Richtlinien** | Neue Spieler müssen sofort im Spiel sein (höchstens ein Klick); Einstieg im Spiel selbst, Kernmechanik zuerst, **überspringbar**, mehr Bild als Text. Gemessen wird Spielzeit, Konversion zum Spiel und **D1-Retention**. |

Quellen: gtplanet.net (FH5 „snackable campaign", Accolades), purexbox.com (FH6 Wristbands), forums.forza.net
(Kritik Fortschritt), docs.crazygames.com/requirements/gameplay und …/quality, docs.crazygames.com/resources/basic-launch-metrics.

## Prinzipien (gelten für jeden Schritt)

1. **Ein Ziel zur Zeit**, oben links als Karte: Kapitel, Ziel, Tasten (bzw. Touch-Knopf), Fortschrittsbalken.
2. **Alle 30–90 s etwas Neues** — eine Freischaltung, Sparks oder ein neues Kapitel.
3. **Zeigen statt erklären:** Wegpunkt automatisch, Ziel nennt die Taste, Live-Zähler (Drift 1.240 / 2.000).
4. **Echte Ereignisse haken ab** (Drift-Kette gebankt, Stunt gewertet, Kauf, Rennen beendet) — nie Zeit allein.
5. **Keine Sackgasse:** Kaufschritte füllen fehlende Sparks einmal auf („starter fund"); fehlt Auto-Drive, wird der
   Schritt übersprungen; wer etwas schon vorher getan hat, bekommt den Schritt sofort.
6. **Pausen-sicher:** jeder fertige Schritt ist ein Claim im Spielstand und wird sofort gespeichert.
7. **Sichtbar gesperrt:** Menü-Kacheln zeigen „Unlocks: <Ziel>" (D48), nichts verschwindet.
8. **Überspringbar:** Titel „SKIP TUTORIAL" und Play-Seite (mit Bestätigung) → alles frei + 3.000 Sparks Startgeld.
9. **Handy:** jeder Schritt hat einen Touch-Hinweis (BOOST, STUNT, DRIFT, MAP …), keine Tastennamen.

## Die Kette

Belohnungen in Sparks (zusätzlich zu dem, was die Tätigkeit selbst zahlt). Dauer = grobe Schätzung für einen
Erstspieler. ⭐ = Wow-Moment.

| # | Kapitel | Ziel (Spieltext) | haken ab durch | Sparks | schaltet frei | ~Dauer |
|---|---|---|---|---:|---|---|
| 1 | First Drive | Finish the first drive | Intro fertig (`FirstDrive`) — ⭐ Sprung in Zeitlupe, Rolle | (Intro 3.000) | **Garage, Tuning** | 1:30 |
| 2 | Open Bay | Drive into the Open Bay | Garage offen (Wegpunkt dorthin) | 100 | — | 0:20 |
| 3 | Open Bay | Buy your first upgrade | Tuning-Kauf | 300 | **Paint** | 0:40 |
| 4 | Open Bay | Give it a new colour | Lack-Kauf | 200 | — | 0:30 |
| 5 | Street Skills | Bank a 2,000 point drift | Drift-Kette gebankt ≥ 2.000 | 200 | — | 0:45 |
| 6 | Street Skills | Pull a stunt | Stunt gewertet (Leertaste ×2 / STUNT) | 200 | — | 0:30 |
| 7 | Street Skills | Fire a nitro burst | Burst (Shift ×2 / BOOST ×2) — ⭐ Flammen, Druckwelle | 200 | — | 0:20 |
| 8 | Street Skills | Hit 160 km/h | Tempo ≥ 160 für 0,3 s | 200 | **Map, Waypoints, Races** | 0:40 |
| 9 | First Race | Open the map | Karte offen (M / MAP) → Wegpunkt zum nächsten Rennen wird gesetzt | 100 | **Auto-Drive** | 0:20 |
| 10 | First Race | Let the car drive you there | Auto-Drive an (fehlt es: übersprungen) — ⭐ Kino-Kamera | 200 | — | 0:30 |
| 11 | First Race | Get to the start | ≤ 30 m am Startpunkt oder Karte offen | 0 | — | 1:00 |
| 12 | First Race | Finish your first race | Veranstaltung beendet (jede Platzierung) — ⭐ Start gegen Rivalen | 500 | **Daily, Records** | 4:00 |
| 13 | Every Day | Check today's challenge | Play-Seite im Menü offen | 100 | — | 0:15 |
| 14 | Every Day | Look at your records | Records-Seite offen (Tab) | 100 | **Photo** | 0:15 |
| 15 | Picture It | Take a photo | Foto gemacht (P → Enter) | 200 | **Fast travel** | 0:45 |
| 16 | Go Places | Fast travel anywhere | Schnellreise | 100 | **Test drive, Car shop** | 0:30 |
| 17 | Second Car | Test drive another car | Probefahrt gestartet | 200 | — | 1:30 |
| 18 | Second Car | Buy your second car | 2 Autos im Besitz (Startgeld füllt bis zum günstigsten auf) — ⭐ neues Auto | 500 | — | 1:00 |
| 19 | Make a Name | Finish three different events | 3 verschiedene Veranstaltungen beendet (Wegpunkt je zum nächsten) | 500 | — | 8:00 |
| 20 | Make a Name | Take a silver medal or better | beste Stufe ≥ Silber in einer Veranstaltung | 500 | — | 4:00 |
| — | **Career complete** | Banner, Ton, nächste Ziele | — | 1.000 | alles | |

**Gesamt:** ~28 min, 20 Schritte (Mittel 1:24 je Schritt; in den ersten 10 min alle 30–60 s), Karriere-Sparks
**5.400** einmalig + Intro 3.000. Nitro und Stunts sind von Anfang an offen — das Intro bringt sie in Minute 1 bei.

### Wow-Momente (wo sie liegen)

- **0:20** Sprung in Zeitlupe mit Rolle (Intro) — der Grund, Minute 2 zu spielen.
- **3:30** Erster Nitro-Burst mit Flammen und Druckwelle.
- **5:30** Auto-Drive mit Kino-Kamera zum ersten Rennen (Agent A, Runde 2).
- **7:00** Erstes Rennen: Startaufstellung, Countdown, Rivalen.
- **~18:00** Zweites Auto — der Moment, ab dem die Garage „meine" ist.

### Wirtschaft

Die Karriere zahlt einmalig 5.400 Sparks (EconomySim, `docs/ECONOMY.md` Abschnitt „Karriere"), etwa zwei
gewöhnliche Sitzungen. Absicht: der Anfang ist großzügig (FH-Muster), die Preise danach bleiben unberührt — das
nächste Auto (Mini Hauler 3.600, Yama Cruiser 9.000) ist das erste echte Sparziel. `CareerTests` prüft, dass jeder
Kaufschritt mit dem bis dahin Verdienten (schlechtester Fall: Intro übersprungen) bezahlbar ist — sonst füllt das
Startgeld auf.

## Danach (Ziele nach „Career complete")

Banner nennt drei Ziele: das günstigste noch nicht gekaufte Auto, Gold in allen Veranstaltungen, eigene Bestzeiten
(Records). Die Play-Seite zeigt sie weiter als Kacheln; das Tagesziel bringt den Spieler am nächsten Tag zurück.

## Regeln für Spielstände

- Neuer Spielstand (Spielzeit < 60 s, kein Intro gesehen): Karriere läuft (`career:on`).
- Alter Spielstand ohne Karriere-Claim: gilt als fertig (`career:done`) — es gibt noch keine echten Spieler.
- Überspringen: `career:done` + Startgeld; im Spiel bleibt nichts gesperrt.
- URL `?career=off` / `?career=on` (nur zum Testen); `?unlock=all` zählt als fertig. Im Editor und in Tests läuft
  die Karriere nur mit `CareerSystem.RunInEditor` (wie das Intro), sonst bleibt alles frei.
