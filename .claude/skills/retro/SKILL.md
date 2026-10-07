---
name: retro
description: Turn a mistake, dead end or slow step into a lasting safeguard. Use at the end of every session, after any bug was found or fixed, after three failed attempts at something, and whenever a manual step was repeated.
---

# Retro — aus Fehlern Vorkehrungen machen

Ziel: Derselbe Fehler, dieselbe Sackgasse, derselbe langsame Handgriff passiert
kein zweites Mal. Eine Lehre ohne Vorkehrung zählt nicht.

## Ablauf (2–5 Minuten, nicht mehr)

1. **Sammeln:** Was hat in dieser Sitzung Zeit gekostet oder war falsch?
   (Fehlversuche, falsche Annahmen, Bugs, wiederholte Handgriffe, Werkzeuge,
   die fehlten, Doku, die nicht stimmte.)
2. **Ursache als Klasse benennen** — nicht „Laterne schwebte", sondern
   „Props wurden ohne Höhenabfrage gesetzt". Gleich im Projekt suchen, ob
   dieselbe Klasse woanders steckt (CLAUDE.md Regel 7).
3. **Stärkste mögliche Vorkehrung wählen:**
   1. **Test / Validierung** — EditMode/PlayMode-Test, Prüfung im Importer,
      `OnValidate`, Editor-Check, der rot wird.
   2. **Werkzeug** — Skript oder Editor-Menü, das den Schritt übernimmt.
   3. **Skill** — Ablauf in `.claude/skills/*/SKILL.md` ergänzen oder neuen
      Skill anlegen (wenn ein Ablauf zum dritten Mal von Hand gemacht wurde).
   4. **Regel in CLAUDE.md** — nur wenn sie überall gilt. Budget 150 Zeilen:
      lieber eine bestehende Regel schärfen als eine neue anhängen.
4. **Umsetzen** — die Vorkehrung wird jetzt gebaut, nicht notiert.
5. **Eintragen:** eine Zeile oben in `docs/LESSONS.md`
   (Datum · Phase · was passiert ist · Vorkehrung mit Pfad · Art).
6. **Doku-Hygiene:** Stimmt etwas in STATUS.md, PLAN.md oder einem Skill nicht
   mehr? Im selben Commit korrigieren.

## Auch Gutes festhalten

Hat ein Weg besonders gut funktioniert (schneller Befehl, guter Prüfablauf),
gehört er in den passenden Skill oder in CLAUDE.md „Befehle" — damit der
nächste Agent ihn findet, statt ihn neu zu erfinden.

## Nicht tun

- Keine Geschichten in CLAUDE.md oder Skills. Eine Zeile in LESSONS.md reicht;
  der Rest steht im Commit.
- Keine Vorkehrung „auf Vorrat" für Fehler, die nicht passiert sind.
- LESSONS.md über 60 Zeilen → ähnliche Einträge zusammenfassen.
