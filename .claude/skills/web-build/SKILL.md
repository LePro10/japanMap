---
name: web-build
description: Build the game for the browser, measure download size, serve it locally and smoke-test it in headless Chrome. Use at every phase gate, after larger changes, and for anything about CrazyGames limits, load time or mobile.
---

# Web-Build bauen und prüfen

Der Browser ist die Zielplattform — ein Feature ist erst fertig, wenn es im
Web-Build läuft.

```bash
node Tools/build-web.mjs        # Release → Builds/Web + size-report.txt (~1,5–2,5 min)
node Tools/build-web.mjs --dev  # Development mit F1-Overlay (~30 s, ~45 MB — Größe zählt nicht)
node Tools/smoke.mjs            # ausliefern, Headless-Chrome, Konsole, F1, Bild → Captures/web-smoke.png
node Tools/serve-web.mjs --lan  # Handy im WLAN, Port 8090
```

Referenz leerer Build (2026-10-07): Release **7,75 MB** (wasm 5,18, data 2,39).

## Einstellungen (Ausgangspunkt)

- Ziel: Web, Grafik-API WebGL2 (WebGPU erst prüfen, wenn ein Grund da ist —
  in Unity 6.6 offiziell, aber nicht Standard).
- Kompression **Brotli**, **Decompression Fallback an** (damit jeder einfache
  Server den Build ausliefert).
- Development Build nur zum Messen mit Overlay; Größe immer am Release-Build
  messen.

## Ablauf

1. Bauen nach `Builds/Web/`, Dauer notieren.
2. **Größenbericht:** Gesamtgröße, größte 10 Dateien, Anzahl Dateien.
   Vergleich mit dem letzten Wert in STATUS.md — Sprünge erklären.
3. **Ausliefern** (`node Tools/smoke.mjs` macht 3. selbst) und in
   Headless-Chrome laden: Konsole mitlesen (0 Fehler), warten bis spielbar,
   Bild machen. Zeit bis spielbar notieren.
4. Nur **ein** Spiel-Fenster gleichzeitig rendern lassen (der Rechner des
   Menschen ist mit zwei schon abgestürzt).
5. Werte in STATUS.md eintragen.

## Fallen

- Die Rauchprobe läuft auf **SwiftShader** (Software): FPS dort sind wertlos.
- Der Web-Player liefert „Draw Calls" und „Batches" nicht (Overlay: „n/a");
  Dreiecke und SetPass stimmen. Draw-Calls im offenen Editor messen.
- `net::ERR_ABORTED` auf `*.unityweb` ist Absicht des Unity-Laders.
- Port 8080 gehört dem Unity-MCP.

## CrazyGames-Grenzen

| | Grenze |
|---|---|
| Startdownload bis erstes `gameplayStart` | ≤ 50 MB, **≤ 20 MB für die Handy-Startseite** |
| Gesamt / Dateien | ≤ 250 MB / ≤ 1 500 |
| Zeit bis spielbar | ≤ 20 s |
| Geräte | 4-GB-Chromebook flüssig; Safari muss laufen |

Hebel, wenn es zu groß wird: Texturen (Größe, Kompression), Addressables
(Welt nachladen statt im Startpaket), ungenutzte Pakete entfernen, Code
Stripping, Audio komprimieren. Immer messen, welcher Hebel wie viel bringt.

## Handy-Test

Braucht den Menschen: Build im WLAN ausliefern (`-a 0.0.0.0`), Adresse und
genaue Prüfliste in STATUS.md „Für dich" schreiben (lädt? FPS gefühlt?
Touch bedienbar? Ton?).
