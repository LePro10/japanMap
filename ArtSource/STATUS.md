# Asset-Sprint — Stand

Plan: [docs/PLAN.md](../docs/PLAN.md), Abschnitt „Asset-Sprint". Regeln:
[STYLE-KIT.md](STYLE-KIT.md) (verbindlich). Läuft parallel zur Unity-Sitzung,
nur in `ArtSource/` und Blender; Commits nur `git add ArtSource/…`.

## Wo wir stehen (2026-10-08)

- **Aufgabe 1 — Stil-Kit + Piloten:** freigegeben.
- **Aufgabe 2 — Requisiten:** **fertig**, alle 15 Gruppen aus PLAN.md. Der
  Mensch hat den Stil freigegeben („Stil passt") und zwei Nachbesserungen
  verlangt, beide erledigt:
  - Leitplanken und Zäune waren zu schlicht → jetzt mit Profil, Pfosten und
    Befestigung.
  - Die Mauer wirkte europäisch → jetzt Ishigaki.
  Zur Freigabe liegt die Übersicht der neuen und nachgeschärften Teile:
  [previews/Props_Overview_2.png](previews/Props_Overview_2.png). Die erste
  Runde zeigt [Props_Overview_1.png](previews/Props_Overview_1.png).
  Vorher/nachher: `previews/compare/{Fence,Barrier}_vorher_nachher.png`,
  Nahaufnahmen: `previews/{Fence,Barrier}_detail.png`.
- **Nächster Schritt: Aufgabe 3 — Gebäude-Bausätze** (Anleitung unten).

Gesamtbau `build.run()`: **59 FBX in 37 s, 0 Fehler, keine Streck-Warnung**;
`exports/manifest.json` hat 59 Einträge.
**Ungeprüft:** alles in Unity (Ausrichtung +Z, Maßstab, LOD Group, Emission
im Nebel). Der Lichttest unten wurde noch nicht gemeldet.

| # | Gruppe | FBX (`exports/props/`, Präfix `SM_`) | Dreiecke LOD0 / LOD1 |
|---|---|---|---|
| 1 | Strommast + Kabel | UtilityPole_Transformer / _Plain / _Guy; PowerLine_Span20/30/40 | 2 336 · 1 618 · 1 732; Spannfeld 748 |
| 2 | Straßenlaterne | StreetLight_Road / _Road2 / _Shotengai | 434 · 598 · 884 |
| 3 | Leitplanke **(neu 2b)** | Barrier_GuardRail_4m (W-Profil mit Blechstärke, Stoßlasche + 4 Schrauben, Halter, Pfostenkappe, Rückstrahler) / _GuardRail_End (aufgebogen + Rundende) / _GuardPipe_2m (Rohrschellen) / _GuardPipe_End (Rohre abgebogen) / _Railing_2m (Fußgängergitter, Fußplatte) | 1 236 · 1 198 · 892 · 1 366 · 414 |
| 4 | Verkehrsschilder | RoadSign_Stop / _Speed40 / _NoParking / _Crosswalk / _Curve / _OneWay_Speed40 | 302–682 |
| 5 | Ampel | TrafficLight_Arm / _Ped (+ schaltbare LENS_) | 944 · 428 |
| 6 | Zäune **(neu 2b)** | Fence_Ishigaki_2m (Bruchstein, geböscht, Decksteine) / _Ishigaki_Retain_4m (Stützmauer 1,9 m, Entwässerungsrohre) / _Bamboo_1_8m (Zedernpfosten, Abdeckbündel, Seilknoten, Fußleiste) / _Board_1_8m (Ishigaki-Sockel, Schwelle, Nagelköpfe, Traufbrett) | 204 · 408 · 1 588 · 748 |
| 7 | Automaten-Varianten | VendingMachine(Slim)_Red/Blue/White, RecycleBins | 1 270 · 256 |
| 8 | Torii | Torii_Vermilion_M / _Vermilion_S / _Stone_M | 1 484 |
| 9 | Steinlaternen | StoneLantern / _Yukimi / _Oki | 1 154 · 1 078 · 442 |
| 10 | Bänke | Bench_Park / _Teahouse / _Stone | 760 · 874 · 76 |
| 11 | Bushaltestelle | BusStop_Pole (runde バス停-Tafel, Haltestellenname, Fahrplankasten) / _Shelter (Glas, LED-Streifen + LIGHT_, hinterleuchtetes Plakat, Bank) | 672 · 1 102 |
| 12 | Mülltonnen | = RecycleBins (Gruppe 7) | 256 |
| 13 | Fahrradständer | BikeRack_6 (6 Schlitze, versetzt, Schlossboxen) + Bicycle_Mamachari_Silver/_Mint/_Cream | 1 872 · 2 444 |
| 14 | Blumenkübel | Planter_Concrete (Buchshecke) / _Round (Azalee) / _PotGroup (Topfgarten) | 398 · 980 · 2 812 |
| 15 | Felsen | Rock_S / _M / _L / _M_Moss / _Flat / _Standing | 320 (L 1 280) |

Alles im Budget (kleine Props ≤ 3 000). Atlanten: `Props`, `Street` (neu:
ISHIGAKI-Streifen statt Betonstein, Fahrplan, Plakat, Haltestellenname,
Korbgitter, 13 neue Zellen), **neu `Nature`** (Fels, Moosfels, Laub,
Blütenlaub, Erde, Beton, Topf-Zellen), `Kura`.

## Aufgabe 3 — so geht es weiter (für eine neue Sitzung)

**Start:**
1. Lesen: `STYLE-KIT.md` und `docs/ART-DIRECTION.md`. Dann aus `docs/PLAN.md`
   **nur** den Abschnitt „Asset-Sprint".
2. Der Skill `blender-asset` enthält die Qualitäts-Schleife.
3. Blender-MCP prüfen (`get_addon_status`), dann:
   ```python
   import sys; sys.path.insert(0, '/Users/leandro/Documents/japanMap/ArtSource')
   import importlib, build; importlib.reload(build); build.run(['kura'])
   ```

**Vorlage:** `buildings/kura.py` (freigegeben, 4 035 Dreiecke).
- **Aufbau:** ganzes Haus aus Feldern (Bays).
  - Ein Wandprofil läuft einmal um den Grundriss (`K.sweep_loop`).
  - Fenster und Türen sind Spalten (`GROUPS`/`ROW` je LOD).
  - Das Dach ist ein Profilkörper (`K.poly_prism_x`) mit echten
    Ziegelreihen (`_tile_row`), First, Oni-Ziegel und Giebelwappen.
- **Einstellungen:** `mesh_object(..., recalc=False, dissolve=True, bevel=0.02)`.
- **Varianten:** Varianten-Tabelle (Black/White) und `LIGHT_`-Marker für
  erleuchtete Fenster.

**Reihenfolge laut PLAN:** Tokyo-Laden / Konbini / Wohnblock mit
Neon-Schildern, Kura (Koedo, ausbauen), Holz-Gasse (Kiso), Gassho-Bauernhaus,
Fischerdorf/Hafen, Tempel. Je Baustil gilt:
1. **Neuer Atlas** in `kit/atlas.py` → `LAYOUTS['<Stil>']`. Strips sind so
   hoch wie die höchste Fläche, Zellen 64 px. Schriften und Neon kommen als
   SVG aus `kit/graphics.mjs`, Neon als Emission. Texte nur fiktiv, keine
   echten Marken.
2. **Generator** `buildings/<stil>.py`, nach dem Muster von `kura.py`.
   PLAN nennt „Wand, Ecke, Fenster, Tür, Dach, Ladenfront". Empfehlung:
   wie beim Kura ganze Häuser aus einer Feldliste (z. B.
   `['shop', 'window', 'door']`) bauen, mit 3–5 Varianten je Stil. Phase 5
   braucht vor allem fertige Häuser in Vielfalt. Falls die Hauptsitzung
   einzelne Module will: dieselben Feld-Funktionen einzeln exportieren.
3. **Budget:** Gebäude-Modul ≤ 5 000 Dreiecke LOD0, Ziel 40–80 %. LOD1 ist
   die Kiste mit Dach.
4. **Pilot + Stopp:** Ein neuer Baustil bedeutet ein Pilot-Haus mit
   Stimmungsbild, neutraler Ansicht, Grau-Bild und Nahaufnahme
   (`P.details`). Dann **Freigabe durch den Menschen**, erst danach
   Varianten.
5. **Japanisch prüfen:** Stil-Kit-Abschnitt „Japanisch, nicht allgemein"
   und „Befestigung zeigen". Typische Details:
   - Tokyo: Klimageräte, Außentreppen, Leitungen, Rollläden, Schilder
     senkrecht.
   - Kiso: Gitterfronten (koshi), Vordach, Steine auf dem Dach.
   - Gassho: steiles Strohdach.
   - Hafen: Wellblech, Bojen, Netze.
   - Tempel: Kumimono, geschwungenes Dach.
   Vorbilder in `docs/refs/` (Stil, nicht Qualitätsstufe).

**Bekannte offene Punkte:**
- Ungeprüft: Unity-Achsen und die Vorderseite +Z. Der Lichttest unten ist
  noch offen.
- `Planter_PotGroup` LOD1 hat 1 220 Dreiecke, das sind 43 % von LOD0. Das
  ist ok, könnte aber mit einfacheren Pflanzen weiter runter.
- Vegetation (Aufgabe 4) nutzt `kit/organic.py` und den Atlas `Nature`.
  Blätter mit Alpha brauchen ein eigenes Cutout-Material.

## Für die Unity-Sitzung: Lichttest (noch offen)

Ziel: einmal unter echtem Licht prüfen (Blaue Stunde, Nebel, Nässe).
1. Texturen `exports/textures/T_{Props,Street,Nature,Kura}_{BaseColor,MaskMap,Emission}.png`
   importieren. MaskMap **linear**. Je Atlas ein URP/Lit-Material,
   `M_Glass` transparent.
2. An einen Blickpunkt stellen:
   - UtilityPole_Transformer + PowerLine_Span30 + UtilityPole_Plain
     (30 m Abstand)
   - StreetLight_Road, RoadSign_Stop, TrafficLight_Arm
   - VendingMachine_Red + RecycleBins
   - Torii_Vermilion_M, StoneLantern
   - Fence_Ishigaki_2m, Barrier_GuardRail_4m
   - BusStop_Shelter, Bicycle_Mamachari_Mint
   - Kura_2Bay_Black
3. Prüfen und hier unter „Gefunden" eintragen:
   - Vorderseite nach +Z?
   - 1 m = 1 Einheit?
   - Wird `_LOD0/_LOD1` zur LOD Group?
   - Emission im Nebel (Display, Plakat, Ampel)?

Konventionen:
- `COL_*` → Collider, `LIGHT_*` → Light (`color`, `unity_range`),
  `LENS_*` → schaltbarer Renderer, `CABLE_*` → Kabelpunkte. Alles steht
  auch in `exports/manifest.json`.
- Module laufen entlang +X ab x = 0. Linkes Ende = gespiegeltes rechtes.

## Für dich

1. Sieh dir `ArtSource/previews/Props_Overview_2.png` an, dazu die
   Vorher-nachher-Bilder in `previews/compare/`. Passt der Stand, ist
   Aufgabe 2 abgeschlossen.
2. Sag der Unity-Sitzung bei Gelegenheit: „Lichttest nach ArtSource/STATUS.md".
3. Neue Sitzung für Aufgabe 3 starten mit: „Asset-Sprint Aufgabe 3 nach
   ArtSource/STATUS.md".

## Für die Hauptsitzung (darf ich nicht ändern)

- **Fehler `Tools/montage.mjs` Zeile 10:** `join(ROOT, …)` macht aus einem
  absoluten `--out` einen Pfad unter dem Repo (`japanMap/private/tmp/…`).
  Lösung: `resolve` statt `join`.
- **Skill `blender-asset`:** zwei Regeln aus STYLE-KIT übernehmen,
  „Japanisch, nicht allgemein" und „Befestigung zeigen + Nahaufnahme".
- **LESSONS.md:** die Zeilen unten eintragen.

## Gefunden / Lektionen (für docs/LESSONS.md)

- `mesh.materials.clear()` **nach** `bm.to_mesh()` setzt alle Material-Indizes
  auf 0. Deshalb bricht `mesh_object` ab, wenn ein Material-Slot unbenutzt bleibt.
- Neue BMesh-Flächen haben Normale (0,0,0) bis `normal_update()`.
  `map_faces` aktualisiert deshalb selbst.
- `matrix_world` ist direkt nach dem Verschieben veraltet. Die Vorschau ruft
  `view_layer.update()`.
- Gestreckte Atlas-Streifen sehen verschmiert aus. Deshalb sind Streifen
  metrisch, und der Bau meldet jede Streckung mit Ort.
- Ausgeblendete Objekte wertet der Depsgraph nicht aus. `tri_count` blendet
  sie zum Zählen ein.
- Eine BMesh-Ebene nachträglich anzulegen macht Flächen-Verweise ungültig.
  `K.new_bm()` legt deshalb alle Ebenen vorab an.
- Bühnenlicht kann Material vortäuschen. Deshalb erst Farbe messen, dann
  die Ursache trennen.
- Zylinder-Abwicklung: Die Naht muss auf einer Kante liegen.
- Einzelflächen behalten ihre gebaute Richtung, zentral im Kit.
- Vorschau-Rahmung über die Ecken des Begrenzungsquaders, nicht über eine
  Kugel.
- 2026-10-08:
  - **Rückmeldung „zu schlicht" / „europäisch":** Regeln in STYLE-KIT
    („Japanisch, nicht allgemein", „Befestigung zeigen") und Werkzeug
    `P.details` für Nahaufnahmen. Die Gruppenbilder waren zu klein, um
    Profile zu beurteilen.
  - **Erstes Ishigaki sah wie Gartenplatten aus:** Voronoi braucht runde
    Ränder, Licht oben, Schatten unten und schmale dunkle Fugen. Steht im
    Stil-Kit.
  - **Blender 5 zählt Ikosphären-Stufen anders** (2 = 80 Dreiecke): Felsen
    hatten nur 80 Dreiecke. Steht in `kit/organic.py` und im Stil-Kit; die
    Dreieckszahl im Bauprotokoll hat es gezeigt.
  - **Umbenannte Assets ließen alte Manifest-Einträge stehen:**
    `build._write_manifest` entfernt jetzt Einträge ohne FBX (Werkzeug).
  - **Organische Formen bekamen Nähte durch Tangenten je Fläche:**
    `K.map_box` (Werkzeug).
