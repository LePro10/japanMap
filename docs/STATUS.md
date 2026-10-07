# Status

> Nur der **aktuelle** Stand — keine Geschichte (die steht in `git log`).
> Wird am Ende jeder Sitzung aktualisiert. Unter 80 Zeilen halten.

**Stand:** 2026-10-07 · **Phase:** 0 abgeschlossen, **Phase 1 ist als Nächstes dran**

## Phase 1 — Fundament

- [ ] 1. Umgebung prüfen
- [ ] 2. Projekt im Repo-Wurzelordner anlegen
- [ ] 3. Projekteinstellungen
- [ ] 4. Pakete
- [ ] 5. Ordnerstruktur und Assemblies
- [ ] 6. Werkzeuge für Agenten (verify, capture, build-web, serve-web + Rauchprobe)
- [ ] 7. Debug-Overlay
- [ ] 8. Boot-Szene + Spielszene
- [ ] 9. Qualitätsstufen
- [ ] 10. Schleife messen

## Messwerte der Arbeitsschleife

| Schritt | Dauer |
|---|---|
| Kompilieren nach Skriptänderung | — |
| Play Mode betreten | — |
| Tests (EditMode / PlayMode) | — |
| Web-Build | — |

## Offene Probleme

- Zwölf alte Agent-Zweige `agent/*` (Worktrees unter `../japanMap.worktrees/`)
  gehören zum Prototyp und passen nicht mehr zur neuen Struktur. Nicht mergen.
  Löschen entscheidet der Mensch.
- Achsen-Umrechnung der Props-Drehung (`SourceData/legacy/README.md`) ist
  gerechnet, nicht im Bild geprüft → Phase 2, Aufgabe 5.

## Für dich (Mensch)

Vor Phase 1 einmalig — Anleitung in [SETUP.md](SETUP.md):

1. Repo pullen, `git lfs install` einmal ausführen.
2. Unity Hub + Unity 6.6 mit **Web Build Support** installiert? (Vom Probelauf vorhanden.)
3. Unity-MCP und Blender-MCP in Claude Code eingerichtet, Blender offen.
4. Pfad zum Probelauf-Projekt bereithalten (der Agent kann dessen Einstellungen übernehmen).
5. Neue Claude-Code-Sitzung **im Repo-Ordner** starten und sagen: „Beginne mit Phase 1".
