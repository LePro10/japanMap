# Sparks-Wirtschaft — simuliert

> **Erzeugt** von `EconomySim` (Menü „JapanMap/Economy/Write Table“). Nicht von Hand ändern: der Test
> `EconomyTests.Table_IsCurrent` schlägt fehl, sobald Daten und Tabelle auseinanderlaufen.
> Quellen: `Data/Gameplay/EconomySettings`, `RaceEvents` (gemessene Zeiten), `DriftSettings` (Kette), `Data/Vehicles/*` (Preise), `Tuning`.

Ziel (ASTRA §9): **2.400–3.600 Sparks** je gewöhnlicher 10-Minuten-Sitzung, ohne Einmal-Boni und Werbung; Preiseinheit 3.000.

## 10-Minuten-Sitzungen

| Spielweise | Sparks | einmalig dazu | im Ziel? | Annahme |
|---|---:|---:|---|---|
| Rennfahrer | 3.297 |  | ja | Veranstaltungen nacheinander, je 60 s Anfahrt + 15 s Karte + 10 s Ergebnis; gewöhnliches Ergebnis |
| Drift, geübt | 2.206 |  | nähert sich (Deckel) | Ketten 25 s mit 60 km/h, 35°, Seitenwechsel alle 3 s, jede 5. Kette ein Crash; in der Driftzone |
| Gemischt | 2.451 |  | ja | 5 min Veranstaltungen + 5 min gelegentlich driften |
| Drift, gelegentlich | 1.591 |  | — | Ketten 6 s mit 45 km/h, 22°, jede 4. Kette ein Crash; in der Driftzone — Einstieg, kein Ziel-Profil |
| Erste Sitzung | 1.878 | 2.850 | — | 3 Regionen + 2 Entdeckungen (4 min), 1 Veranstaltung (Coast Loop) mit erster Medaille, 2 Meilensteine, Rest gelegentlich driften |

## Veranstaltungen je Minute

Median 330 Sparks/min (mit Anfahrt). ASTRA §11: mehr als 1.5× Median = neu abstimmen.

| Veranstaltung | Ergebnis | Fahrzeit s | Zyklus s | Sparks | Sparks/min |
|---|---|---:|---:|---:|---:|
| Coast Loop | 2. | 238 | 323 | 1.772 | 330 |
| Tōge Descent | 2. | 187 | 272 | 1.490 | 329 |
| Neon Circuit | 2. | 123 | 208 | 1.146 | 330 |
| Tōge Climb | 2. | 206 | 291 | 1.603 | 330 |
| Ring Time Trial | ≤ 10 % über Ziel | 228 | 313 | 1.720 | 330 |
| Tōge Drift Run | Silber | 174 | 259 | 1.423 | 329 |
| Needle Sprint | 2. | 139 | 224 | 1.236 | 330 |
| Open Seat | ≤ 10 % über Ziel | 62 | 147 | 800 | 328 |

## Preise gegen Sitzungen

Reines Driften ist durch den Deckel (400 je 90 s) auf höchstens 2.667 je 10 min begrenzt — Absicht: Kreisen im Hof soll nie der schnellste Weg sein.

Gerechnet mit dem Mittel der Ziel-Profile: **2.874 Sparks/Sitzung**. Einmal-Geld im ganzen Spiel: 12.900.

| Kauf | Preis | Sitzungen |
|---|---:|---:|
| Hachi H8 | Start | — |
| Mame K | 2.400 | 0,8 |
| Mini Hauler | 3.600 | 1,3 |
| Yama Cruiser 250 | 9.000 | 3,1 |
| Kumo S22 | 15.000 | 5,2 |
| Kaze 35 Drift | 18.000 | 6,3 |
| Raiden R4 | 27.000 | 9,4 |
| Suprema Z7 | 30.000 | 10,4 |
| Rotor R7 | 42.000 | 14,6 |
| Hanami S26 | 54.000 | 18,8 |
| Street-Paket (4 Teile, ein Auto) | 3.000 | 1,0 |
| Volles Tuning (Street + Sport, ein Auto) | 12.000 | 4,2 |
| Lackfarbe | 120 | 0,04 |
| Alle Autos | 201.000 | 70 |

## Erster Kauf

Nach der ersten Sitzung: 4.728 Sparks → günstigstes Auto (Mame K, 2.400) **sofort** kaufbar.
Street-Paket für das Startauto (3.000) ebenfalls sofort.

## Karriere (einmalig, D50)

Kette aus `Data/Gameplay/Career.asset` (docs/CAREER.md). Zusammen **5.400 Sparks** (davon 1.000 für „Career complete“), in der ersten Sitzung 1.700. Überspringen zahlt 3.000. Kaufschritte füllen einmal auf, falls das Geld fehlt.

| # | Kapitel | Ziel | Sparks | Summe | ab Minute |
|---:|---|---|---:|---:|---:|
| 1 | First Drive | Finish the first drive | 0 | 0 | 0 |
| 2 | Open Bay | Drive into the Open Bay | 100 | 100 | 2 |
| 3 | Open Bay | Buy your first upgrade (Startgeld) | 300 | 400 | 2 |
| 4 | Open Bay | Give it a new colour (Startgeld) | 200 | 600 | 3 |
| 5 | Street Skills | Bank a 2,000 point drift | 200 | 800 | 3 |
| 6 | Street Skills | Pull a stunt | 200 | 1.000 | 4 |
| 7 | Street Skills | Fire a nitro burst | 200 | 1.200 | 4 |
| 8 | Street Skills | Hit 160 km/h | 200 | 1.400 | 5 |
| 9 | First Race | Open the map | 100 | 1.500 | 5 |
| 10 | First Race | Let the car drive you there | 200 | 1.700 | 6 |
| 11 | First Race | Get to the start | 0 | 1.700 | 6 |
| 12 | First Race | Finish your first race | 500 | 2.200 | 7 |
| 13 | Every Day | Check today's challenge | 100 | 2.300 | 11 |
| 14 | Every Day | Look at your records | 100 | 2.400 | 11 |
| 15 | Picture It | Take a photo | 200 | 2.600 | 12 |
| 16 | Go Places | Fast travel anywhere | 100 | 2.700 | 12 |
| 17 | Second Car | Test drive another car | 200 | 2.900 | 13 |
| 18 | Second Car | Buy your second car (Startgeld) | 500 | 3.400 | 14 |
| 19 | Make a Name | Finish 3 different events | 500 | 3.900 | 15 |
| 20 | Make a Name | Take silver or better | 500 | 4.400 | 23 |
| — | — | Career complete | 1.000 | 5.400 | 27 |
