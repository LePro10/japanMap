---
name: phase-gate
description: Close a phase of docs/PLAN.md properly - acceptance, checks, web build, images, hygiene, retro, human checklist. Use when all tasks of a phase are done, before starting the next phase.
---

# Phasen-Tor

Eine Phase ist erst abgeschlossen, wenn alle Punkte erfüllt **und gemessen**
sind. Was nicht erfüllbar ist, steht offen in STATUS.md — nicht abgehakt.

1. **Abnahme** der Phase (docs/PLAN.md) Punkt für Punkt prüfen, Ergebnis mit
   Zahl oder Bildpfad in STATUS.md.
2. **Prüfschleife** (Skill `unity-verify`): kompiliert, 0 Konsolenfehler,
   alle Tests grün.
3. **Web-Build** (Skill `web-build`): Größe, Zeit bis spielbar, Rauchprobe.
4. **Bilder** von den festen Blickpunkten (ab Phase 2), auf Hoch und Niedrig,
   angesehen und kurz bewertet.
5. **Hygiene:**
   - STATUS.md: Phase abgeschlossen, nächste Phase mit Aufgabenliste angelegt.
   - Doku gegen Code: Stimmen Befehle in CLAUDE.md, Pfade, Skills?
   - `CLAUDE.md` ≤ 150 Zeilen, `docs/LESSONS.md` ≤ 60 Zeilen.
   - Tote Dateien, Test-Szenen, auskommentierter Code entfernt.
6. **Retro** (Skill `retro`) über die ganze Phase.
7. **Für den Menschen:** Was nur ein Mensch prüfen kann (Fahrgefühl, Optik,
   Ton, Handy), als kurze Anleitung in STATUS.md „Für dich".
8. **Commit** „Phase N abgeschlossen". Push nur nach Zustimmung.
9. Dem Menschen in einfachen Worten berichten: was jetzt geht, was gemessen
   wurde, was offen ist, was er tun soll.
