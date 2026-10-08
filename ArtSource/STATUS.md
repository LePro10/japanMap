# Asset-Sprint — Stand

Plan: [docs/PLAN.md](../docs/PLAN.md), Abschnitt „Asset-Sprint". Regeln:
[STYLE-KIT.md](STYLE-KIT.md) (verbindlich). Läuft parallel zur Unity-Sitzung,
nur in `ArtSource/` und Blender; Commits nur `git add ArtSource/…`.

## Wo wir stehen (2026-10-08, Mittag)

- **Aufgabe 3 — Gebäude, Kiso: Pilot fertig, wartet auf Freigabe.**
  Eine Poststraße wie Tsumago/Narai: 7 Häuser + 3 ruhige Gassen-Versionen,
  jedes mit eigener Ladenausstattung (Mesh `_Shop`), dazu 4 Straßenstücke
  (Straße mit Wasserrinne, Steinstufen am Hang, Wassertrog, Wasserrad).
  Bilder: `previews/Kiso_Overview.png` (Straße auf Augenhöhe, Gegenrichtung,
  von oben, Stufen + Ishigaki-Haus, Gasse, Grau-Test), `Kiso_Buildings.png`
  (alle 10 einzeln), `Kiso_detail.png` (Nahaufnahmen: Gitter,
  Vorkragung, Steindach, Läden), `Kiso_Back.png` (Rückseiten),
  `Kiso_clay_houses.png` (Grau-Test je Haus), `Kiso_Pieces.png`.
- **Aufgabe 3 — Gebäude, Koedo: freigegeben** (2026-10-08).

- **Aufgabe 1 — Stil-Kit + Piloten:** freigegeben.
- **Aufgabe 2 — Requisiten:** fertig (15 Gruppen, Tabelle unten).
- **Aufgabe 3 — Gebäude, Tokyo: freigegeben** (Mensch: „gut genug“, 2026-10-08).
  Nächster Baustil: **Koedo** (Kura ausbauen). Tokyo hat zwei Stufen:
  1. **Nebenstraße** (Pilot 1): Konbini, Zakkyo, Wohnblock — Bilder
     `previews/Tokyo_Overview.png`, `Tokyo_detail.png`.
  2. **Zentrum** (neu, nach Rückmeldung „zu wenig Schilder/Details für
     Tokyo City", Vorbild Kabukichō-Gasse): 6 dichte Häuser + 4 ruhige
     Nebenstraßen-Versionen, jedes mit eigener Schilderhaut — Bilder
     `previews/Tokyo_Center_Overview.png` (Gasse) und
     `Tokyo_Center_Buildings.png` (alle 10 einzeln).
  Wohnblock-Budget: a) gilt (als 3 Felder zählen), mit der Freigabe bestätigt.
  Danach Baustil für Baustil: Koedo (Kura ausbauen), Kiso, Gassho,
  Fischerdorf, Tempel — je Pilot + Freigabe.

### Kiso-Pilot (Atlas `Kiso` + `KisoShop`, Generator `buildings/kiso.py` + Bausatz `buildings/kiso_kit.py`)

| FBX (`exports/buildings/`, Präfix `SM_Kiso_`) | Haus | Ladenausstattung | Dreiecke Haus LOD0 / LOD1 · Laden LOD0 / LOD1 |
|---|---|---|---|
| Hatago_3Bay_Kaede | Großes Gasthaus 8,2 m: Obergeschoss 0,75 m vorkragend auf Balkenköpfen, zwei vorstehende Gitter (dejōshi), Eingang, Gitterfenster oben, Udatsu an beiden Enden, Schindeldach mit 3 + 1 Steinreihen, Kragarme + Pfette | Schild 旅籠 楓屋 an Eisenstangen, Noren 御宿, Wandlaterne, Chōchin, Standschild, Bank, Feuereimer, Brennholz hinten | 4 981 / 964 · 692 / 386 |
| Hatago_2Bay_Yamabuki | Gasthaus mit Ziegeldach, offener Raum oben hinter Geländer, Bambusrollos, Senbon-Gitter unten, Bambusrinne | Noren, Wandlaterne 山吹, Chōchin, Feuereimer, Pflanzen | 4 083 / 680 · 672 / 350 |
| Soba_2Bay_Kodama | Ohne Vorkragung: Schindel-Vordach mit Steinen auf Kragarmen, hochgeklappte Läden (age-do) an Eisenstangen, Klappbank, niedriges Obergeschoss | Dachschild そば処 木霊, Noren そば, Standschild, Nobori, Wandlaterne | 3 983 / 850 · 520 / 278 |
| Shop_2Bay_Nushiya | Lackwaren/Kämme: Ziegeldach, Udatsu beidseits, Vorkragung 0,55 m | Schild 塗師屋, Lackschalen + Spanschachteln auf Stufen, Standschild お六櫛, Lampe | 3 995 / 764 · 1 480 / 152 |
| Minka_2Bay_Ishigaki | Kramladen auf 1,5 m hohem Ishigaki-Sockel mit gepflasterter Terrasse und Steintreppe längs der Front, Schindel-Vordach mit Steinen | Strohsandalen, Körbe, Tragekörbe, Brennholz mit Brettdach, Dachschild 荒物 ひさご屋 | 3 839 / 880 · 664 / 222 |
| Sake_3Bay_Yamagiri | Großer Sakeladen 8,6 m: Gitter, offener Laden, Bretterläden, Udatsu rechts, Bambusrinne + Fallrohr | Zedernkugel, Schild 山霧, Noren 酒, Fässer, Feuereimer, Lampe | 4 921 / 919 · 710 / 372 |
| Chaya_1F_Gohei | Eingeschossiges Teehaus, tiefes Schindel-Vordach, hochgeklappte Läden über die ganze Breite | Dachschild 御休処, Bank mit rotem Filz + Schirm, Nobori 五平餅, Menütafel, Wandlaterne | 3 217 / 726 · 386 / 240 |
| …_Lane (Kaede, Soba, Ishigaki) | Gassen-Versionen: Läden zu (Bretter), Gitter dunkel, ein Fenster oben hell | Schilder, Laternen, Feuereimer, Brennholz, Pflanzen | 3 579–4 771 · 474–606 |
| Street_8m · Street_Steps_8m · Trough · Waterwheel | Erdstraße mit Wasserrinne (Granitborde, 2 Steinbrücken) · Steinstufen +1,44 m · Wassertrog mit Bambusrohr · Wasserrad mit Zulaufrinne | — | 336 · 704 · 212 · 804 |

- **Budget:** alle Häuser ≤ 5 000 (Kaede 4 981, Sake 4 921 — nach Messung
  der Teile gekürzt: Seitenpfosten alle 2,7 m, hintere Steinreihe
  einfacher, Gitter etwas weiter). LOD1 15–21 % (Kiste mit Dach, Gitter
  als Bild, Steine jede zweite Reihe).
- **Gemessen:** Bau 14 FBX, 0 Fehler, 0 Streck-Warnungen; nach den Bildern
  steht nichts verschoben (geprüft). **Ungeprüft:** alles in Unity (zwei
  Materialien je Haus: `M_Kiso_Atlas`, `M_KisoShop_Atlas`).
- Lichter: `LIGHT_` vor jedem offenen Laden, jedem hellen Gitter und an
  jeder Wandlaterne.
- Fahrrad, Pflanzkübel, Steinlaterne, Bambuszaun in den Bildern sind die
  Requisiten aus Aufgabe 2.
- **Offen / Ideen nach der Freigabe:** Wasserrad als eigenes Mesh zum
  Drehen; Straßenstück für die schmale Gasse; mehr Varianten der
  Ishigaki-Treppe (seitlich, mittig).

### Koedo-Pilot (Atlas `Koedo` + `KoedoShop`, Generator `buildings/koedo.py` + Bausatz `buildings/koedo_kit.py`)

| FBX (`exports/buildings/`, Präfix `SM_Koedo_`) | Haus | Ladenausstattung | Dreiecke Haus LOD0 / LOD1 · Laden LOD0 / LOD1 |
|---|---|---|---|
| Misegura_3Bay_Sake | Schwarze Laden-Kura 8,4 m, verputztes Vordach zwischen Brandwänden (Sodekabe), hoher First, große Oni, 2 Kura-Fenster (eins offen + Licht), Regenrinne, Feuerleiter | Dachschild 小江戸鶴, Noren さけ, Zedernkugel, Sakefässer, Standschild, Laterne, Feuereimer | 4 271 / 792 · 788 / 454 |
| Kura_2Bay_Imo | Weiße Kura 6,2 m mit Namako-Sockel, Ziegel-Vordach auf Holzkragträgern | Wandschild 紅あか, Noren 甘味, Warenstufen, 2 Nobori さつまいも, Bank mit rotem Filz + Schirm, Menütafel | 4 184 / 778 · 654 / 212 |
| Machiya_2Bay_Unagi | Holz-Machiya 5,6 m: Senbon-Gitter (leuchtend), Eingang, Mushiko-Fenster in schwarzem Putz, Sparren unter der Traufe | Dachschild 鰻 川よし, Noren うなぎ, Laterne, Standschild, Topfpflanzen, Wandlampe | 3 405 / 737 · 640 / 308 |
| Kanban_2Bay_Souvenir | Kupferfront (Kanban-Kenchiku) mit Attika, Gesimsen, Lisenen; Shōwa-Glastüren, Holz-Schiebefenster | Schild みやげ 蔵屋, kurzer Noren, 2 Verkaufsstände, Nobori | 2 871 / 670 · 770 / 84 |
| Kura_Corner_2Bay_Pottery | Schwarze Eck-Kura: Läden an zwei Straßen, Vordach ums Eck, Wappen am Giebel zur Seitenstraße | Dachschild 土の香, Töpferwaren-Stufen, Noren お茶 seitlich, Feuereimer, Lampe | 4 905 / 983 · 1 412 / 242 |
| Dagashi_1F | Niedriger Süßwarenladen (Kashiya Yokochō), Bretterwand, niedriges Obergeschoss | Bonbongläser auf Stufen, Noren だがし, 2 Nobori, 2 Laternen, Schild 福まる | 2 923 / 623 · 1 942 / 284 |
| Machiya_3Bay_Tea | Breite Holz-Machiya 8 m: Gitter + offener Laden, oben Shoji hinter Holzgeländer | Dachschild 松葉園, Noren お茶, Bambusrollos, Teekisten, Topfpflanzen | 4 249 / 817 · 688 / 244 |
| …_Lane (Imo, Unagi, Tea) | Gassen-Versionen: Laden zu (Brandschutztüren aus Putz bzw. Bretter), Gitter dunkel | nur Schilder, Lampen, Topfpflanzen | 3 360–4 025 · 486–842 |

- **Budget:** alle Häuser ≤ 5 000 (Eck-Kura 4 905 = 98 %: ohne Leiter,
  vordere Fenster zu). LOD1 17–24 % (Kiste mit Dach, Ziegelreihen jede
  zweite und dreieckig, Ladenpfosten bleiben) — unter dem Ziel 30–50 %,
  aber die Silhouette steht; bei Bedarf mehr in LOD1.
- **Rückseiten:** Tür (Kura: Brandschutztür aus Putz, Machiya: Bretter) mit
  kleinem Vordach, Fallrohr, bei Machiya ein Mushiko-Fenster unten.
- **Gemessen:** Gesamtbau 86 FBX, 0 Fehler, 0 Streck-Warnungen.
  **Ungeprüft:** alles in Unity (zwei Materialien je Haus: `M_Koedo_Atlas`,
  `M_KoedoShop_Atlas`; Emission der Innenräume im Nebel).
- Lichter: `LIGHT_` vor jedem offenen Laden und jedem Gitter (warm).
- Fahrräder und Pflanzkübel in den Bildern sind die Requisiten aus Aufgabe 2.

### Tokyo-Zentrum (Atlas `TokyoSigns` + `Tokyo`, Generator `buildings/tokyo_center.py`)

| FBX (`exports/buildings/`, Präfix `SM_Tokyo_`) | Haus | Schilder | Dreiecke Haus LOD0 / LOD1 · Schilder LOD0 / LOD1 |
|---|---|---|---|
| Center_7F_Izakaya | 6,0 m breit, Fliese beige, Izakaya, Laternenkette | 2 Türme, Querkästen, Bier-Billboard auf Gitterturm | 4 742 / 1 374 · 1 256 / 276 |
| Center_9F_Karaoke | 7,5 m, ALC + rote Paneele, Ladenfront | Turm mit Glühbirnen, Kamera-Billboard | 4 980 / 1 582 · 2 336 / 416 |
| Center_6F_Narrow | 4,5 m, ALC, Rollladen | Turm, Neon ラーメン direkt an der Wand | 3 468 / 1 044 · 636 / 210 |
| Center_8F_Glass | 8,0 m, Silberpaneel + Glasband | Videowand „NEO TOKYO" mit Wartungssteg | 4 614 / 1 424 · 652 / 232 |
| Center_6F_Brown | 5,5 m, Fliese braun, Izakaya | Turm, Neon BAR auf Platte, Laternen | 4 454 / 1 218 · 986 / 248 |
| Center_7F_Concrete | 6,5 m, Sichtbeton + dunkle Paneele | 2 Türme mit Glühbirnen, Handy-Billboard | 3 856 / 1 224 · 2 006 / 286 |
| Street_5F_Tile / _4F_Teal / _3F_Brown / _6F_Cream | ruhige Nebenstraßen-Häuser (density 0,3–0,5) | wenige Schilder, Neon スナック (Teal) | 1 966–3 530 · 160–388 |

Alle Häuser ≤ 5 000 Dreiecke; Schilderhaut getrennt (Zentrum 650–2 340).
Schilder: 24 Querkästen, 16 Turmschilder, 8 Aufsteller, 4 Billboards,
2 Videowände, 36 erfundene Läden. Gemessen in Blender, **ungeprüft in
Unity** (zwei Materialien je Haus: `M_Tokyo_Atlas`, `M_TokyoSigns_Atlas`).

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
1. Texturen `exports/textures/T_{Props,Street,Nature,Kura,Tokyo,TokyoSigns}_{BaseColor,MaskMap,Emission}.png`
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
   - Tokyo_Center_7F_Izakaya + Tokyo_Center_8F_Glass gegenüber (6 m Gasse): Schilderhaut, Videowand im Nebel
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

1. **Kiso-Pilot ansehen und freigeben** (Bilder oben unter „Wo wir
   stehen"). Danach geht es mit Gassho weiter.
2. Der Unity-Sitzung bei Gelegenheit „Lichttest nach ArtSource/STATUS.md"
   sagen.

## Für die Hauptsitzung (darf ich nicht ändern)

- **Fehler `Tools/montage.mjs` Zeile 10:** `join(ROOT, …)` macht aus einem
  absoluten `--out` einen Pfad unter dem Repo (`japanMap/private/tmp/…`).
  Lösung: `resolve` statt `join`.
- **Skill `blender-asset`:** zwei Regeln aus STYLE-KIT übernehmen,
  „Japanisch, nicht allgemein" und „Befestigung zeigen + Nahaufnahme".
- **LESSONS.md:** die Zeilen unten eintragen.
- Der Fehler in `montage.mjs` besteht weiter (2026-10-08 Abend: wieder
  umgangen mit relativem `--out`).
- **Alle FBX neu exportiert** (2026-10-08, Koedo): Die Triangulierung im
  Kit hat sich geändert (siehe Lektionen). Wer FBX schon importiert hat,
  importiert neu; Dreieckszahlen bleiben fast gleich.

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
- 2026-10-08 Nacht (Tokyo-Zentrum):
  - **Rückmeldung „zu wenig, zu generisch für Tokyo City":** Stil-Kit
    „Zwei Dichten" + Schilderhaut als eigener Bausatz; Häuser als Daten +
    Startwert, damit eine Straße sich nicht wiederholt.
  - **Verschmelzen half kaum, weil jede Fensterspalte alle Geschosse
    schneidet:** gemeinsame Spaltenlinien je Vorderseite (−650 Dreiecke).
  - **Schilder wirkten pastellig:** Emission 4 + AgX wäscht Farben aus →
    Vorschau-Stärke 1,6 für `TokyoSigns`. Erst messen/vergleichen, dann
    Grafiken ändern.
  - **Querkästen nur in der Brüstung wirkten klein**; Kabukichō-Kästen
    decken auch den unteren Fensterteil (0,7–1,25 m).
- 2026-10-08 Vormittag (Koedo):
  - **Loch neben einem Fenster:** Ear-Clipping zerlegte die U-förmige
    Wandfläche um ein Fenster in lange Splitter, die Fase machte daraus ein
    Loch. Das Kit trianguliert n-Ecke jetzt mit BEAUTY (Werkzeug, gilt für
    alle Assets, alle FBX neu exportiert). Gefunden mit der Rückansicht.
  - **Leere Rückseiten** fielen erst in der Rückansicht auf: jedes
    Koedo-Haus bekommt hinten automatisch Tür, Vordach und Fallrohr
    (`_back_ground`).
  - **Requisite zweimal verschoben** (in Hauptstraße und Gasse) → Objekte
    blieben versetzt liegen. Die Bilder macht jetzt `koedo.shots(ordner)`
    im Repo; es prüft, dass jede Requisite nur in einer Szene steht, und
    stellt alles zurück (nachgemessen: nichts verschoben).
  - **Neue Kamera `P.shot`** (Augenhöhe, Nahaufnahme, auch Grau-Test) im
    Kit statt Hilfsdatei: Straßenbilder sind jetzt ein Aufruf.
  - **Budget messen statt raten:** Teile einzeln abschalten zeigte Leiter
    176, offenes Kura-Fenster 222, Seitenvordach 322 Dreiecke.
  - **`graphics.mjs` rendert alle Grafiken neu, die Schrift-Kanten weichen
    dabei bitweise leicht ab:** 16 Tokyo-Schilder wurden „geändert", ohne
    dass sich ihr SVG änderte. Nur die PNG des eigenen Stils committen
    (hier `KO_*`), die anderen zurücksetzen.
- 2026-10-08 Mittag (Kiso):
  - **`graphics.mjs` rendert jetzt nur einen Stil**, wenn man ein Präfix
    angibt (`node ArtSource/kit/graphics.mjs KI_`): Die Lektion von
    Koedo, andere PNG von Hand zurückzusetzen, ist damit ein Werkzeug.
  - **Rinne unter dem Bühnenboden unsichtbar:** Der Vorschau-Boden liegt
    bei z = 0 und deckt alles darunter. `kiso.shots` senkt ihn auf −0,45
    und legt eine Bodenplatte mit Loch um die Straße.
  - **Grau-Test von oben sagt wenig** (alles gleich grau, auch der Boden):
    Grau-Test der Straße auf Augenhöhe.
  - **Kamera-Richtung in `P.shot`** zeigt vom Ziel *zur Kamera* — die
    Gassen-Kamera stand zweimal außerhalb der Gasse. Steht im Docstring.
