# Hintergrund — warum dieses Projekt so aufgestellt ist

> Zusammenfassung des Gesprächs vom 2026-10-07, das zum Umzug nach Unity
> geführt hat: Analyse des Prototyps, Recherche, Probelauf. Nachschlagewerk —
> nicht bei jedem Start lesen. Zahlen tragen ihr Datum; Web-Angaben sind
> Stand Oktober 2026.

## Der Eigentümer und das Ziel

- Hat **keine Zeile Code selbst geschrieben** und noch nie mit einer Engine
  gearbeitet. Alles läuft über KI-Agenten (bisher Claude Code, Codex,
  Cursor, Grok — künftig ein Werkzeug).
- Ziel: ein **sehr erfolgreiches Spiel**, mit dem nebenbei Geld verdient wird.
  Veröffentlichung auf **CrazyGames**; Browser muss bleiben.
- Wünsche, wörtlich und ausführlich: `legacy/threejs/TODO.md` (Englisch,
  vom Eigentümer). Produkt-Soll aus einem früheren Design-Durchgang:
  `legacy/threejs/ASTRA_PLAN.md` (Index in [LEGACY-MAP.md](LEGACY-MAP.md)).
- Vorbild für Inhalt und Dichte: *Forza Horizon* (vom Eigentümer mehrfach
  genannt) — als Ideengeber, nicht als Grafikmaßstab.

## Was die Analyse des Prototyps ergab (2026-10-07)

| Messgröße | Wert |
|---|---|
| Spielcode `src/` | ≈ 95 000 Zeilen TS/GLSL/CSS, 254 TS-Dateien |
| Werkzeuge `tools/` | ≈ 21 500 Zeilen |
| Doku (Markdown) | ≈ 17 700 Zeilen; `CLAUDE.md` 145 KB ≈ 48 000 Tokens (bei jedem Start geladen), `PLAN.md` 620 KB ≈ 200 000 Tokens |
| Commits | 316 vom 26.07. bis 01.10.2026; 71 davon ändern die Physik-Kerndateien |
| Eigenbau, den eine Engine mitbringt | ≈ 29 000 Zeilen: Physik/Kollision 8 200, Debug 4 400, Rendering 4 200, Shader/Material 3 900, Vegetation 3 400, Kern 2 000, Gelände/Wasser 1 400, Kamera 1 300 |
| Spielinhalt (muss in jeder Engine neu) | ≈ 66 000 Zeilen: Stadt/Dörfer/Props/Stunts/Straßen 26 800, UI 10 800, Konfiguration 10 000, Spiel-Logik, Ton |

Drei Ursachen für Bugs und Chaos — und was davon eine Engine löst:

1. **Selbstgebaute Engine-Teile**, vor allem Fahrphysik und Kollision: die
   lange Fehlerliste des Prototyps ist überwiegend Physik (Vorzeichen,
   Energie aus dem Nichts, Blech im Hang, Räder bleiben beim Sprung liegen).
   → **Löst Unity** (PhysX, Standardkomponenten).
2. **Welt aus Code-Grundformen** (Häuser aus Quadern/Zylindern in
   TypeScript). → Löst **keine** Engine allein; braucht eine Asset-Pipeline
   (Blender + gute Fremd-Assets). Unity hilft über den Asset Store.
3. **Doku- und Prozess-Chaos:** riesige, sich widersprechende Doku, vier
   KI-Werkzeuge parallel, zwölf offene Agent-Zweige, Features angefangen statt
   fertig. → Löst **kein** Engine-Wechsel; dafür die Regeln in `CLAUDE.md`
   und D08.

## Recherche: Engines im Browser (Oktober 2026)

| Engine | Befund |
|---|---|
| Unreal 5 | Kein Web-Export seit 4.24; nur Pixel Streaming (Server je Spieler) |
| Unity 6.6 | Web-Export ausgereift; **WebGPU seit 6.6 (01.09.2026) offiziell**, Standard bleibt WebGL2; typische Builds laut Vergleich 15–50 MB; leerer Build ≈ 8 MB+; mobile Leistung ist der bekannte Schwachpunkt |
| Godot 4.6 | Web nur mit Compatibility-Renderer (WebGL2), **kein C# im Web**, Grunddownload laut einer Quelle 25–35 MB; Jolt-Physik eingebaut |
| PlayCanvas | Web-nativ, Laufzeit 1–2 MB, offizieller Editor-MCP |
| Babylon.js 9 | Web-nativ (März 2026), Havok-Physik, WebGPU |
| Three.js | WebGPURenderer empfohlen seit r171 mit WebGL2-Rückfall |

**MCP für Unity:** „MCP for Unity" (CoplayDev) — kostenlos, MIT, Unity 2021.3
bis 6.x, Claude Code wird unterstützt; Szenen, Skripte, Assets, Konsole,
Play, Build, Profiler. Offizieller Unity-MCP (im Paket „AI Assistant") seit
Mai 2026 als offene Beta, braucht Unity-Cloud-Projekt und Unity-AI-Abo.

## CrazyGames-Anforderungen

| Vorgabe | Wert |
|---|---|
| Startdownload | ≤ 50 MB; **≤ 20 MB für die Handy-Startseite** |
| Gemessen wird | vom Ladebeginn bis zum ersten `gameplayStart` des SDK (ohne SDK: Gesamtgröße) |
| Gesamtgröße / Dateien | ≤ 250 MB / ≤ 1 500 Dateien |
| Ladezeit im Spiel | ≤ 20 s |
| Browser | Chrome, Edge; Safari muss gehen (sonst wird deaktiviert) |
| Geräte | Chromebook mit 4 GB RAM muss flüssig laufen; Maus, Tastatur, Touch |
| Unity-spezifisch | iOS zunächst deaktiviert (Absturzprobleme), nach genug Spielen freigeschaltet; DPR = 1 für iOS / Android mit wenig Speicher |
| SDK | Pflicht für Full Launch und Einnahmen (Basic Launch geht ohne); Module: Werbung, Spielereignisse, Nutzer, Daten, Käufe |
| Sonstiges | relative Pfade, Sitelock, `-webkit-user-select: none`, Safe Area in der App |

## Geld — realistische Erwartungen

- **CrazyGames:** 60 % der Werbeeinnahmen, 70 % bei Käufen (Käufe nur auf
  Einladung). Gut laufende Portal-Spiele laut einer Auswertung 200–2 000 $
  im Monat; die Spitze deutlich mehr. Rewarded Video, eCPM brutto: USA 15–28 $,
  EU 8–15 $. Einnahmen hängen an Spielzeit und Wiederkehr.
- **Steam:** 30 % Anteil, 100 $ Gebühr je Spiel; Median-Umsatz eines
  Indie-Spiels laut Auswertungen nur wenige hundert bis wenige tausend Dollar.
  Spieler müssen selbst geholt werden (Wunschlisten, Videos).
- **Konkurrenz auf Steam:** *Forza Horizon 6* (Japan, größte Karte der Serie,
  19.05.2026), *Tokyo Xtreme Racer* (95 % positiv), *JDM: Japanese Drift
  Master* (Unreal 5). Im Browser gibt es nichts Vergleichbares.
- Web-Spiele kommen auch später auf Steam (Vampire Survivors und CrossCode
  sind als HTML5-Spiele erschienen) — der Weg bleibt offen.

## Der Probelauf (2026-10-07)

Ein Agent (Opus 5.5) baute in einer Sitzung mit Unity-MCP + Blender-MCP eine
kleine Szene: Hügel mit nassem Steinweg, Abendlicht mit tiefer Sonne und
Nebel, drei in Blender per Python gebaute Assets (Torii, Steinlaterne,
Getränkeautomat), Startmenü „AMEAGARI — Ein Abend nach dem Regen" mit
Spielen / Grafik / Ton und Flugkamera. Urteil des Eigentümers: „insane".

Beobachtungen: Stimmung trägt (Licht + Postprocessing von URP), Menü
gestalterisch stark, Assets sauber aber noch einfach (Automat am schwächsten),
Terrain-Textur kachelt sichtbar, dunkle Schlieren auf einem Hang.
**Nicht gemessen** wurden Web-Build-Größe, Handy, Verbrauch des Laufs — das
holt Phase 1 nach.

Der verwendete Prompt (eigenständig, ohne Projektdaten): Unity 6.6 URP,
kleines Terrain ~300 m, 2–3 Assets per `bpy` ohne Generierung/Downloads,
< 5 000 Dreiecke je Asset, Startmenü, Web-Build (WebGL2, Brotli,
Decompression Fallback), Prüfen (Konsole 0 Fehler, Screenshots), sparsam
arbeiten, kurzer REPORT.md.

## Quellen

- [CrazyGames – Technical requirements](https://docs.crazygames.com/requirements/technical) · [SDK](https://docs.crazygames.com/sdk/intro/)
- [Unity 6.6 WebGPU](https://alternativeto.net/news/2026/9/unity-6-6-adds-webgpu-build-analysis-and-coreclr-prep/) · [Unity AI / MCP](https://unity.com/blog/unity-ai-mcp-how-to-get-started) · [MCP for Unity](https://glama.ai/mcp/servers/@CoplayDev/unity-mcp)
- [Three.js vs Unity im Web](https://www.utsubo.com/blog/threejs-vs-unity-web-comparison) · [Web-Engines 2026](https://app.cinevva.com/blog/2026-06-09-web-game-engines-2026-comparison)
- [Godot – Web-Export](https://docs.godotengine.org/en/4.5/tutorials/export/exporting_for_web.html) · [Godot-Web-Größe](https://dev.to/ziva/godot-4-fur-web-spiele-export-wasm-und-browser-performance-4315)
- [Unreal und Web](https://bugnet.io/blog/how-to-export-a-unreal-engine-game-for-the-web) · [PlayCanvas MCP](https://developer.playcanvas.com/user-manual/editor/mcp-server/) · [Babylon.js 9](https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0)
- [Web-Game-Monetarisierung](https://app.cinevva.com/guides/web-game-monetization) · [Steam-Indie-Markt](https://fungies.io/indie-developer-market-2026-complete-analysis-data-trends-forecasts-5/)
- [Forza Horizon 6](https://www.shacknews.com/article/147524/forza-horizon-6-release-date) · [Tokyo Xtreme Racer](https://www.pcgameshardware.de/Spiele-Thema-239104/News/Tokyo-Xtreme-Racer-Release-Preis-wird-erhoeht-1481481/) · [JDM](https://onlineracedriver.com/2025/01/27/jdm-japanese-drift-master-has-a-march-2025-release-date)
- [Web-Spiele auf Steam (Electron)](https://phaser.io/news/2025/03/publishing-web-games-on-steam-with-electron)
