---
name: legacy-port
description: Find and carry over behavior, numbers, layouts or data from the old Three.js prototype in legacy/threejs. Use whenever a task says "aus dem Prototyp", "wie im alten Spiel", or needs positions, tuning values, events, layouts or game rules that already existed.
---

# Aus dem Prototyp übernehmen

Einstieg ist immer `docs/LEGACY-MAP.md` (was liegt wo). Der Prototyp ist
**nur Quelle**: Verhalten, Zahlen und Lagen werden übernommen, Code nicht
abgeschrieben — er löst Probleme, die Unity nicht hat.

## Lesen, ohne den Kontext zu fluten

- `legacy/threejs/WORKFLOW-LEGACY.md` (48 000 Tokens) und `PLAN.md`
  (200 000 Tokens) **nie ganz öffnen**. Mit Grep nach dem Thema suchen und
  nur die Fundstellen lesen.
- `ASTRA_PLAN.md` abschnittsweise (Index in LEGACY-MAP.md).
- Konfigurationen in `src/config/*.config.ts` sind die verlässlichste Quelle
  für Zahlen — sie sind kommentiert, oft mit Messung.

## Übertragen

- **Koordinaten:** Three → Unity ist `(x, y, −z)`; Drehungen siehe
  `SourceData/legacy/README.md`. Jede übertragene Lage einmal im Bild prüfen.
- **Zahlen** in ScriptableObjects unter `Assets/_Project/Data/`, mit Herkunft
  im Kommentar (`// from legacy arcade.config.ts ARCADE_SURFACE`).
- **Verhalten** zuerst als Test beschreiben (was soll passieren, messbar),
  dann in Unity bauen, dann gegen den Test prüfen. Die Prüfstände unter
  `legacy/threejs/tools/bench/` sind Vorlagen für solche Tests.
- **Bekannte Mängel nicht mitnehmen:** LEGACY-MAP.md listet sie; TODO.md
  des Eigentümers sagt, wie es richtig sein soll.

## Prototyp laufen lassen

Nur wenn nötig (z. B. GLB-Export eines Ortes, Vergleichsbild). Befehle und
Export-Snippet in LEGACY-MAP.md. Danach Dev-Server wieder beenden; nie zwei
Spiel-Instanzen gleichzeitig rendern.
