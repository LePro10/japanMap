---
name: web-build
description: Build the game for the browser, measure download size, serve it locally and smoke-test it in headless Chrome. Use at every phase gate, after larger changes, and for anything about CrazyGames limits, load time or mobile.
---

# Web-Build bauen und prüfen

Der Browser ist die Zielplattform — ein Feature ist erst fertig, wenn es im
Web-Build läuft. Die Werkzeuge entstehen in Phase 1 (`Tools/build-web`,
`Tools/serve-web`); bis dahin über den Unity-MCP bauen.

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
3. **Ausliefern** (z. B. `npx http-server Builds/Web -p 8080`) und in
   Headless-Chrome laden: Konsole mitlesen (0 Fehler), warten bis spielbar,
   Bild machen. Zeit bis spielbar notieren.
4. Nur **ein** Spiel-Fenster gleichzeitig rendern lassen (der Rechner des
   Menschen ist mit zwei schon abgestürzt).
5. Werte in STATUS.md eintragen.

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
