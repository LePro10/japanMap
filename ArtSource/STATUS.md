# Asset-Sprint — Stand

Plan: [docs/PLAN.md](../docs/PLAN.md), Abschnitt „Asset-Sprint". Regeln:
[STYLE-KIT.md](STYLE-KIT.md) (verbindlich). Läuft parallel zur Unity-Sitzung,
nur in `ArtSource/` und Blender; Commits nur `git add ArtSource/…`.

## Wo wir stehen (2026-10-08, Abend)

- **Aufgabe 1 — Stil-Kit + Piloten:** freigegeben.
- **Aufgabe 2 — Requisiten:** fertig (15 Gruppen, Tabelle unten).
- **Aufgabe 3 — Gebäude: Tokyo-Pilot steht zur Freigabe (STOPP).**
  Bilder: [previews/Tokyo_Overview.png](previews/Tokyo_Overview.png)
  (Stimmung, neutral, Rückseite, Straßenhöhe) und
  [previews/Tokyo_detail.png](previews/Tokyo_detail.png) (Nahaufnahmen),
  dazu `Tokyo.png`, `Tokyo_clay.png`, `Tokyo_Signs.png`.
  Danach Baustil für Baustil: Koedo (Kura ausbauen), Kiso, Gassho,
  Fischerdorf, Tempel — je Pilot + Freigabe.

### Tokyo-Pilot (Atlas `Tokyo`, Generator `buildings/tokyo.py` + Bausatz `buildings/tokyo_kit.py`)

| FBX (`exports/buildings/`, Präfix `SM_`) | Inhalt | Dreiecke LOD0 / LOD1 | Maße B × T × H |
|---|---|---|---|
| Tokyo_Konbini_3F | Eckhaus: Konbini „SORA MART" (Glasfront ums Eck, Leuchtblende, Automatiktür, Nobori おでん), Hauseingang mit Briefkästen, 2F Englischschule + Kissaten-Ausleger, 3F Wohnungen mit Klimageräten; Dach: Treppenhaus, Wassertank, Klimageräte | 4 541 / 1 193 | 11,8 × 13,3 × 15,0 m |
| Tokyo_Zakkyo_5F | Schmales Mieterhaus: Izakaya (Noren 焼き鳥, Gittertür, rote Laternen, Nobori 生ビール), Treppentür, Salon/Büro/Bar, senkrechtes Mieterschild, Neon „スナック", Dach-Billboard „ひかり不動産" | 4 366 / 1 212 | 5,8 × 11,3 × 18,2 m |
| Tokyo_Mansion_4F | Wohnblock, 3 Wohnungen je Geschoss: Balkone (Fliesenbrüstung, Milchglas, Trennwand 非常の際は…, Klimagerät, Wäschestange), Eingang mit Namensschild und Stufen; hinten Laubengang mit Stahltüren, Zählern, Gitterfenstern, braune Stahltreppe; TV-Antenne | **8 283** / 2 436 | 18,7 × 11,0 × 14,6 m |
| Tokyo_Sign_Tate_A / _B | Senkrechte Mieterschilder (5 Mieter, Leuchtkasten, 3 Arme + Streben) | 158 / 32 | 1,2 × 5,6 m |
| Tokyo_Sign_Neon_Snack | Neon スナック mit Rahmen, Abstandshaltern, Trafo und Kabel | 258 / 108 | 2,0 × 0,7 m |
| Tokyo_Sign_Kissa | Rundes Ausleger-Leuchtschild 喫茶 COFFEE | 126 / 54 | Ø 0,64 m |

- **Budget:** Konbini 91 %, Zakkyo 87 % von 5 000 — im Rahmen. **Mansion
  8 283 liegt über 5 000.** Es ist 3 Wohnungen breit (= 3 Felder à ~2 760).
  Frage an den Menschen (unten). LOD1 je 26–29 % (Kiste mit Dach, Öffnungen
  aufgemalt, Schilder vereinfacht).
- **Gemessen:** Gesamtbau 66 FBX, 0 Fehler, keine Streck-Warnung.
  **Ungeprüft:** alles in Unity (Achsen, Emission im Nebel, LOD Group).
- Lichter: `LIGHT_` am Konbini (kühl, Bürgersteig), Eingang, Laternen,
  Neon, Laubengang.

### Requisiten (Aufgabe 2, fertig)

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

## Aufgabe 3 — Anleitung (für eine neue Sitzung)

**Start:**
1. Lesen: `STYLE-KIT.md` und `docs/ART-DIRECTION.md`. Dann aus `docs/PLAN.md`
   **nur** den Abschnitt „Asset-Sprint".
2. Der Skill `blender-asset` enthält die Qualitäts-Schleife.
3. Blender-MCP prüfen (`get_addon_status`), dann:
   ```python
   import sys; sys.path.insert(0, '/Users/leandro/Documents/japanMap/ArtSource')
   import importlib, build; importlib.reload(build); build.run(['kura'])
   ```

**Vorlage:** für Häuser mit vielen Öffnungen und Anbauten
`buildings/tokyo_kit.py` + `tokyo.py` (Wandprofil je Geschossart,
Öffnungen als Daten `op(...)`, Teile auf Wandrahmen `F`; Stil-Kit-Abschnitt
„Gebäude-Bausatz"). Für Häuser mit Satteldach `buildings/kura.py`
(freigegeben, 4 035 Dreiecke).
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
1. Texturen `exports/textures/T_{Props,Street,Nature,Kura,Tokyo}_{BaseColor,MaskMap,Emission}.png`
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
   - Kura_2Bay_Black, Tokyo_Konbini_3F (Leuchtblende, Glasfront, Neon am Zakkyo)
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

1. **Tokyo-Pilot freigeben oder korrigieren:** `ArtSource/previews/Tokyo_Overview.png`
   und `Tokyo_detail.png` ansehen. Stimmt der Tokyo-Stil (Fliesen, Klimageräte,
   Schilder, Neon, Konbini, Balkone, Stahltreppe)?
2. **Eine Entscheidung zum Wohnblock:** Er hat 8 283 Dreiecke, das Budget
   ist 5 000 je Modul. Er ist 3 Wohnungen breit. Möglichkeiten:
   a) so lassen und als „3 Felder" zählen (empfohlen, Bild bleibt wie es ist),
   b) in drei Feld-Module schneiden, die Phase 5 aneinandersetzt,
   c) auf unter 5 000 abspecken (weniger Gitter, Balkon-Details, Treppe).
3. Weiter wie bisher: der Unity-Sitzung bei Gelegenheit „Lichttest nach
   ArtSource/STATUS.md" sagen.

## Für die Hauptsitzung (darf ich nicht ändern)

- **Fehler `Tools/montage.mjs` Zeile 10:** `join(ROOT, …)` macht aus einem
  absoluten `--out` einen Pfad unter dem Repo (`japanMap/private/tmp/…`).
  Lösung: `resolve` statt `join`.
- **Skill `blender-asset`:** zwei Regeln aus STYLE-KIT übernehmen,
  „Japanisch, nicht allgemein" und „Befestigung zeigen + Nahaufnahme".
- **LESSONS.md:** die Zeilen unten eintragen.
- Der Fehler in `montage.mjs` besteht weiter (2026-10-08 Abend: wieder
  umgangen mit relativem `--out`).

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
- 2026-10-08 Abend (Tokyo-Pilot):
  - **Zellen bluteten an den Rand:** Stufen und Sockel glühten türkis,
    weil V bis an die Zellkante lief und die Mip-Stufe die Neon-Zelle
    darunter mischte. `map_faces` bleibt jetzt in U und V vom Rand weg
    (Werkzeug, gilt für alle Atlanten; alle 66 FBX neu exportiert).
  - **Verirrtes Teil 20 m über dem Dach** (Leitersprossen mit absoluter
    statt relativer Höhe gezählt) fiel nur an der zu fernen Vorschau-Kamera
    auf. `build.run` meldet jetzt die Maße B × T × H je Asset (Werkzeug).
  - **`P.details(..., mood=True)` brach ab:** die Vorschau baut ihre
    Punktlichter bei jedem Bild neu, `details` hielt sie fest. Behoben;
    nach dem Abbruch waren Objekte unsichtbar geblieben (leere Bilder).
  - **Fasen kosten bei Gebäuden ~40 %, Verschmelzen fast nichts:**
    Laibungen, Gitter und Kleinteile ohne Fasen (Stil-Kit „Gebäude-Bausatz").
  - **Stil-Bausatz wurde nicht neu geladen:** `build._reload` lädt jetzt
    alle `*_kit`-Module neu.
