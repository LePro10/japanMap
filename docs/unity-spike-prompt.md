# Prompt für den Unity-Probelauf

Vorbereitung (einmalig, von Hand):

1. Unity Hub installieren, mit Unity-Konto anmelden (Personal-Lizenz).
2. Unity 6.6 installieren, Modul **Web Build Support** anhaken.
3. Neues Projekt, Vorlage **Universal 3D**, Ordner
   `C:\Users\Leandro\Documents\projects\projects\japanMap-unity`.
4. „MCP for Unity" einrichten (Paket im Projekt + MCP-Eintrag für Claude Code),
   Blender mit Blender-MCP offen lassen.
5. Claude Code **im Ordner `japanMap-unity` starten**, nicht in `japanMap` —
   sonst lädt es dessen 48 000-Token-`CLAUDE.md` mit.
6. Unity-Editor geöffnet lassen.

Danach den folgenden Block einfügen:

---

```text
Probelauf: Wie gut baut ein KI-Agent in Unity? Das Ergebnis entscheidet, ob ein
Browser-Open-World-Fahrspiel ("japanMap", Japan, Blaue Stunde nach Regen) von
Three.js nach Unity umzieht. Halte den Umfang klein — es geht um eine
aussagekräftige Probe, nicht um ein Spiel.

UMGEBUNG
- Unity 6.6, URP-Projekt im aktuellen Ordner, Editor ist offen.
- Tools: Unity-MCP, Blender-MCP, normale CLI. Liste zuerst die verfügbaren
  MCP-Tools auf, statt Namen zu raten.
- Eingabedaten (nur lesen): C:\Users\Leandro\Documents\projects\projects\japanMap\export\unity-spike\
  terrain.json, height_513.raw, height_preview.png.
  Öffne sonst NICHTS aus dem Ordner japanMap.

LIEFERUMFANG — genau das, nichts darüber hinaus
1. Terrain aus height_513.raw (Werte in terrain.json: Größe, Position, 16 bit,
   Windows-Byteorder). Prüfe nach dem Import, dass der höchste Punkt bei
   check.peakUnity liegt; sonst Zeilen spiegeln. Zwei bis drei Terrain-Layer
   (Gras, Fels nach Steilheit, Erde). Stimmung: Abend nach Regen — tiefe Sonne,
   leichter Nebel, kühler Himmel, URP-Postprocessing (Tonemapping, etwas Bloom).
2. Zwei bis drei Assets, modelliert in Blender per Python (bpy) über Blender-MCP:
   ein Torii, eine Steinlaterne (tōrō), optional ein japanischer Getränkeautomat.
   Kein generate_3d, keine Downloads/Asset-Bibliotheken — es geht darum, was
   du selbst baust. Ziel: sauber und glaubwürdig, nicht Klötzchen: Fasen,
   richtige Proportionen, PBR-Materialien, je < 5 000 Dreiecke, Ursprung am
   Boden, Maßstab in Metern. Als FBX oder GLB nach Assets/Models exportieren,
   als Prefab anlegen und ein paar Exemplare sinnvoll auf das Terrain stellen
   (Torii über der Straße, die als Rinne im Höhenfeld zu sehen ist,
   Laternen daneben).
3. Startmenü (UI Toolkit oder uGUI): Titel "japanMap", Knöpfe "Spielen",
   "Grafik: Hoch/Niedrig" (schaltet URP-Qualitätsstufe), "Ton an/aus".
   "Spielen" blendet das Menü aus und startet eine Flugkamera (WASD + Maus,
   auf Touch reicht ein Ziehen zum Drehen). Escape zurück ins Menü. Das Menü
   soll gut aussehen: passend zur Stimmung, lesbar, nicht Unity-Standardgrau.
4. Web-Build (WebGL2, Brotli, Decompression Fallback an) nach Builds/Web.

PRÜFEN, BEVOR DU "FERTIG" SAGST
- Unity-Konsole: 0 Fehler.
- Je ein Screenshot: Spielansicht mit Assets, Menü, ein Asset in Blender.
- Web-Build einmal lokal ausliefern und laden (z. B. npx http-server Builds/Web).
- Was nicht gemessen wurde, gilt als nicht erledigt — schreib es dann so hin.

SPARSAM ARBEITEN
- Blender-look und Screenshots klein halten (max_size ~512), nur wenn nötig.
- Scheitert ein Schritt dreimal, notieren und weitergehen statt endlos probieren.
- Keine zusätzlichen Features, keine Refactors, keine lange Doku.

ZUM SCHLUSS: REPORT.md im Projektordner, kurz
- Was gebaut wurde, mit Pfaden der Screenshots.
- Was über MCP gut ging, was hakte, wo ein Mensch klicken müsste.
- Web-Build: Gesamtgröße, größte Dateien, Build-Dauer, lädt ja/nein.
- Zeit pro Schritt grob, Zahl der Fehlversuche.
- Ehrliches Urteil in drei Sätzen: Ist Unity + MCP für dieses Projekt ein
  besserer Weg als Three.js?
```
