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
node Tools/smoke.mjs --gpu      # dasselbe mit echter GPU (Metal) ohne Vsync + FPS über 5 s
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

- **FPS streuen ±20 % zwischen Läufen** desselben Builds (Phase 9: 231–354). Mindestens drei Läufe, Spanne melden;
  für eine Ursache A/B mit `--param` (z. B. `noui=1`) im selben Build.
- Ohne `--gpu` läuft die Rauchprobe auf **SwiftShader** (Software): FPS dort sind wertlos.
  Mit `--gpu` gelten sie für **diesen Rechner** (M4: leere Karte P2 = 250 fps) —
  nie für Handy oder Chromebook; die prüft der Mensch.
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

**Start messen nur mit `node Tools/sdk-web.mjs`** (Bytes auf der Leitung bis gameplayStart, auch WASM und Gelände-Datei;
Phase 10: 18,9 MB). `size-report.txt` „start" ist eine Näherung; dort „MB" = 10⁶ Byte.
**Zeiten vergleichen nur mit denselben Schaltern und abwechselnd** (vorher/nachher/vorher …): `--stream --probe` misst
2,0 s, ohne Schalter 4,4 s für denselben Build (Phase 11: ein Gewinn wurde so zu groß gemeldet).

Hebel, gemessen in Phase 10 (D36): `data.unity3d` ist innen immer LZ4 — Brotli außen hilft kaum, nur weniger Inhalt.
Größter Posten waren **Shader** (Varianten: URP-Funktionen aus, die niemand nutzt; `Editor/ShaderStripping.cs`, Bericht
`Builds/shader-variants.txt`), dann Welt-Teile (Addressables), Gelände (gzip-Datei), Crunch. Unkomprimierte Zahlen im
Build-Bericht täuschen — `node Tools/data-sizes.mjs` oder ein Versuchs-Build ohne die Gruppe. **LZMA-Bündel laden im
Browser nicht.** Neue Inhalte, die nicht in den Start gehören: als eigene Szene/Adresse (`StreamingSetup`).

## Handy-Test

Braucht den Menschen: Build im WLAN ausliefern (`-a 0.0.0.0`), Adresse und
genaue Prüfliste in STATUS.md „Für dich" schreiben (lädt? FPS gefühlt?
Touch bedienbar? Ton?).
