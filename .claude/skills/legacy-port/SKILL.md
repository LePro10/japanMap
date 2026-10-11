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
- **Nicht nur die Kerndatei portieren:** Verhalten steckt oft in der Datei
  drumherum (Fahrmodell: `arcadeDynamics.ts` *und* `Vehicle.ts` mit Luft-Lage,
  Haltekraft, Hangkraft). Vor dem Bauen alle Regeln der Umgebungsdatei als
  Liste notieren und abhaken — die vergessene Luft-Lage kostete eine halbe
  Abnahmefahrt.
- **Bekannte Mängel nicht mitnehmen:** LEGACY-MAP.md listet sie; TODO.md
  des Eigentümers sagt, wie es richtig sein soll.

## Prototyp-Prüfstände laufen lassen (Zahlen als Maßstab)

`legacy/` hat keine `node_modules` und wird nicht angefasst. Kopie in den
Scratchpad, nur `three` nachinstallieren, dann wie im Prototyp:

```bash
S=<scratchpad>/legacy; mkdir -p $S && rsync -a legacy/threejs/{src,tools,package.json,tsconfig.json} $S/
cd $S && npm install --no-save --ignore-scripts three@$(node -p "require('./package.json').dependencies.three")
node --experimental-strip-types --import ./tools/bench/register.mjs tools/bench/fleet.mts
```

Ergebnisse von `fleet`, `arcade`, `hill` liegen schon in `SourceData/bench/`.

## Prototyp laufen lassen

Nur wenn nötig (z. B. GLB-Export eines Ortes, Vergleichsbild). Befehle und
Export-Snippet in LEGACY-MAP.md. Danach Dev-Server wieder beenden; nie zwei
Spiel-Instanzen gleichzeitig rendern.

## Erste Minute vergleichen (Pflicht vor jedem Phasenende)

Das Intro „First Drive“ des Prototyps ging beim Port verloren, und niemand merkte es, bis der Mensch am Handy spielte
(2026-10-11). Darum vor jedem Phasen-Tor: Was erlebt ein **neuer Spieler** in den ersten 60 s im Prototyp
(`src/main.ts` → Start-Ablauf, `src/game/intro/`, `src/ui/`), und was im Spiel (`node Tools/play.mjs … "intro; …"`
bzw. Browser mit frischem Profil)? Jede Stufe, die es im Prototyp gab und hier fehlt, ist ein Fund in STATUS.md.
