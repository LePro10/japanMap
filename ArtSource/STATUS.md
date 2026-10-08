# Asset-Sprint — Stand

Plan: [docs/PLAN.md](../docs/PLAN.md), Abschnitt „Asset-Sprint". Regeln:
[STYLE-KIT.md](STYLE-KIT.md) (verbindlich). Läuft parallel zur Unity-Sitzung,
nur in `ArtSource/` und Blender; Commits nur `git add ArtSource/…`.

## Wo wir stehen (2026-10-08, Aufgabe 5a)

- **Aufgabe 4 — Vegetation („Flora"): freigegeben** (Mensch, 2026-10-08).
- **5a Schritt 1 — Löcher: behoben.** Ursache: Das Kit triangulierte nur
  n-Ecke > 4 und das **vor** der Fase. Der Bevel-Modifier entsteht erst beim
  Export und macht an seinen Ecken neue n-Ecke (Tokyo-Mansion: 251 von 257
  verdrehten Flächen), dazu kamen verdrehte Vierecke aus dem Bau (6).
  `mesh_object` hängt jetzt einen **Triangulate-Modifier hinter die Fase**
  (BEAUTY, Normalen bleiben). Neue Prüfung `K.poly_check` im Bauprotokoll
  (`ngons …`, `WARN twisted …`, Summe am Ende). Gemessen: **vorher 1 579
  verdrehte Flächen in 103 Meshes** (strenger als Unity, das 395 in 29
  verwarf), **nachher 0 in allen 176 FBX**. FBX-Gegenprobe (Mansion neu
  importiert): nur Dreiecke. Dreiecke LOD0 gesamt 381 641 → 381 587
  (−54, entartete Flächen ohne Fläche fallen weg; je Asset 0–4). Schattierung
  vorher/nachher gleich (Kura-Nahaufnahme).

- **5a Schritt 2 — Streugut: fertig, wartet auf Freigabe.** Neuer Atlas
  `Scatter` (Schalungsbeton mit Plattenfugen, P-con-Ankerlöchern,
  Ausblühungen und schwarzen Algenläufen; Kenchi-Blöcke im Rautenverband;
  Tetrapod-Beton mit nassem Fuß; Gewächshausfolie; polierter und alter
  bemooster Granit; Gras für Hanggitter; Grafiken `SC_*`). Maße nach den
  Unity-Platzhaltern (`MapImportSettings`). Alle FBX nur Dreiecke, 0 verdrehte Flächen.

  | Gruppe | FBX (Präfix `SM_`) | Dreiecke LOD0 / LOD1 | Einsatz |
  |---|---|---|---|
  | Tetrapod | Tetrapod · Tetrapod_Tilted · Tetrapod_Pile (5 verhakt) | 712/112 · 712/112 · 3 560/560 | 372× Mole/Küste |
  | Leitpfosten | Delineator_White / _Orange (Rundstrahler, Schelle) · SnowPole (矢羽根, 4,6 m) · PostCone | 318/156 · 598/230 · 324/114 | 170× Straßenrand |
  | Stützmauer | Wall_Concrete_8m (Fuge, Rohre) · Wall_Kenchi_8m · Wall_Norimen_8m (Hanggitter, Anker, U-Rinne) | 418/192 · 298/128 · 2 060/338 | 79× Bergstraße |
  | Gewächshaus | Greenhouse_Closed · _Open (Beete, Bögen innen) | 2 698/498 · 7 696/1 682 | 30× Felder |
  | Jizō | Jizo (Latz, Mütze, Opfergaben) · Jizo_Roku (6 unter Dach) | 802/249 · 3 512/946 | Dorfrand, Gassho |
  | Friedhof | Grave_Family · Grave_Old (Gorintō, Funagata) · Cemetery_Row_8m | 1 042/312 · 570/228 · 4 160/1 256 | Kiso, Dörfer |
  | Fahnen/Tafel | Nobori_Red / _Blue / _Yellow (Wassertank-Fuß) · EventBoard_4m (+2 LIGHT_) | 404/54 · 608/200 | Sakura Commons |
  | Kiso | Kiso_Kido (Tor über 6,4-m-Straße, Kollider nur Pfosten, 2 LIGHT_) | 1 695/468 | Kiso-Juku Ortsenden |
  | Minato | Minato_Lighthouse_White (grünes Licht) · Minato_Slipway_8m (Rampe 1:8, Winde) | 474/226 · 578/266 | Funaura |

  Bilder in `previews/`: `Scatter_Scenes.png` (Hafenmole mit Tetrapoden
  und weißem Feuer, Bergstraße mit Leitpfosten/Schneepfählen/Mauern,
  Feld mit Gewächshäusern, Dorfrand mit Jizō und Friedhof,
  Kiso-Ortseingang mit Kido-Tor; je Stimmung | neutral),
  `Scatter_Scenes_clay.png`, `Scatter_detail.png` (20 Nahaufnahmen der
  Befestigung), je Gruppe vorne/hinten/Grau: `Tetrapod`, `Delineator`,
  `RetainingWall`, `Greenhouse`, `Jizo`, `Cemetery`, `Signage` (+`_clay`),
  `Scatter_Atlas.png`. Szenen neu: `from props import scatter_shots as SS;
  SS.shots(ordner); SS.closeups(ordner)`.

### Davor: Vegetation (Aufgabe 4)

- Vegetation-Pilot (freigegeben): Alle sechs Arten aus PLAN (Zeder, Ahorn, Kirsche, Bambus, Kiefer, Büsche)
  mit japanischen Varianten, je LOD0/LOD1/LOD2 (LOD2 = Fernkörper ≤ 108
  Dreiecke statt Billboard, D18). 12 Bäume + 6 Büsche, **ein** Material
  `M_Flora_Atlas` (Alpha-Clip) je Modell. Bilder in `previews/`:
  `Flora_Overview.png` (Bergschrein im Zedernwald mit Shinboku, Tempelgarten,
  Kirschallee mit Hängekirsche, Bambusweg; je Augenhöhe Stimmung/neutral/Grau,
  von oben), `Flora_Trees.png` und `Flora_Bushes.png` (alle einzeln: vorne,
  hinten, Stimmung, Grau), `Flora_LOD.png` (LOD0 | LOD1 | LOD2 nebeneinander),
  `Flora_detail.png` (Nahaufnahmen: Shimenawa mit Shide, Kiefernstütze,
  Zedernkrone, Rotkiefer, Ahorn, Kirschblüten, Bambus-Knoten, geschnittene
  Azalee, Hortensie, Sasa), `Flora_Atlas.png`.
  **Der Bergschrein (Tera) steht jetzt im echten Zedernwald** — gleiche
  Kamera wie `Tera_Overview` „yama_steps", also direkt vergleichbar.
- **Tera (Tempel/Schrein): als freigegeben übernommen.** Der Mensch hat
  ohne Einwand zur nächsten Aufgabe weitergeschickt („führe asset phase
  fort", 2026-10-08), die Hauptsitzung hatte Tera schon importiert. Die drei
  Wahrzeichen (Haupthalle 9 343, Pagode 9 072, Tor 7 073) bleiben wie
  gemessen, solange niemand widerspricht.

## Davor (2026-10-08, Nacht)

- **Aufgabe 3 — Gebäude, Tempel/Schrein („Tera"): fertig** (siehe oben). Letzter Baustil von Aufgabe 3. Zwei Dichten: **großer
  Tempelbezirk** (Tor mit großer Laterne, Sandō mit Fahnen und
  Steinlaternen, Haupthalle in Zinnober, Pagode, Glockenturm, Brunnenhaus,
  Amulett-Schalter mit Ema- und Omikuji-Gestell, Lehmmauer mit weißen
  Linien) und **stiller Bergschrein im Wald** (Steintorii, Kiesweg,
  Steintreppe, Zinnober-Torii oben, Koma-inu, Haiden mit Vordach und
  Honden mit Chigi/Katsuogi; daneben Bergtempel aus altem Holz mit
  Rindendach und kleinem Tor). Bilder in `previews/`: `Tera_Overview.png`
  (Bezirk: Augenhöhe Stimmung/neutral, Tor, Seite mit Pagode, von oben,
  Grau; Bergschrein: Treppe Stimmung/neutral, Haiden, Bergtempel, von oben,
  Grau), `Tera_Buildings.png` (alle 10 einzeln), `Tera_Back.png`,
  `Tera_clay_houses.png`, `Tera_detail.png` (Nahaufnahmen: Traufe mit
  Konsolen und Sparren von unten, Hallenfront mit Altar und Opferkasten,
  Ecke mit Grat und Windglocke, Haiden-Front mit Shimenawa und Glocke,
  Tempelglocke mit Stoßbalken, Chigi/Katsuogi, Brunnen mit Schöpfkellen,
  Pagoden-Traufe, Tor mit Laterne, Amulett-Schalter), `Tera_Pieces.png`.

## Davor (2026-10-08, Abend)

- **Aufgabe 3 — Gebäude, Fischerdorf/Hafen („Minato"): freigegeben**
  (Mensch: „Qualität gefällt mir", 2026-10-08). Zwei Dichten: **Hafenkern** (Kaimauer, Fischhalle,
  Imbiss, Laden, Netzschuppen, Tintenfischboote, Steg, Wellenbrecher mit
  Leuchtturm) und **ruhige Bucht** (Reihe Bootshäuser wie Ine no Funaya,
  Gasse dahinter, Fischerhäuser). Bilder in `previews/`:
  `Minato_Overview.png` (Hafen vom Wasser, Kai-Straße, von oben, Bucht vom
  Meer, Gasse, von oben; je Stimmung/neutral/grau), `Minato_Buildings.png`
  (alle 10 einzeln), `Minato_Back.png` (Rückseiten),
  `Minato_clay_houses.png` (Grau-Test), `Minato_detail.png`
  (Nahaufnahmen: Bootsbucht, Balkon, Gasflaschen + Gitter, Anbau mit Netzen,
  Traufe/Ortgang Wellblech, Imbiss-Front, Fischhalle innen, Kaimauer mit
  Poller/Fender/Leiter, Lampen am Tintenfischboot, Trockengestell),
  `Minato_Pieces.png` (Hafenstücke, Boote, Kleinkram-Sets).
  **Nächster Baustil: Tempel** (letzter Baustil von Aufgabe 3; danach
  Aufgabe 4 Vegetation, ersetzt die vorläufigen Bäume aus D18).
- **Aufgabe 3 — Gebäude, Gassho: freigegeben** (Mensch fragte nach der
  nächsten Aufgabe, 2026-10-08). Nächster Baustil: **Fischerdorf/Hafen**.
  Strohdachdorf wie Shirakawa-gō/Gokayama: 5 Bauernhäuser + 2 ruhige
  Feld-Versionen + 4 kleine Bauten + 3 Dorfstücke, je mit eigener
  Ausstattung (Mesh `_Shop`). Bilder: `previews/Gassho_Overview.png`
  (Dorfkern Augenhöhe/Gegenrichtung/von oben, Feldrand, je Stimmung und
  neutral, Grau-Tests), `Gassho_Buildings.png` (alle 11 einzeln),
  `Gassho_detail.png` (Nahaufnahmen: Eingang Minshuku, Giebel, Traufe,
  Engawa mit Kakis, First, Café, Schneebretter, Washi-Werkstatt),
  `Gassho_Back.png` (Rückseiten), `Gassho_clay_houses.png`, `Gassho_Pieces.png`.
- **Aufgabe 3 — Gebäude, Kiso: freigegeben** (Mensch fragte nach der
  nächsten Aufgabe, 2026-10-08).
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

### Vegetation-Pilot „Flora" (Atlas `Flora`, Generator `vegetation/trees.py` + Bausatz `vegetation/tree_kit.py`)

| FBX (`exports/vegetation/`) | Was | Dreiecke LOD0 / LOD1 / LOD2 · Maße |
|---|---|---|
| Tree_Sugi | Zeder (sugi) 22 m: gerader Stamm mit faseriger rotbrauner Rinde, untere 40 % kahl (wie im Forst geästet), Krone als Kegel aus Büscheln an kurzen Ästen | 4 944 / 876 / 68 · 9 × 9 × 22,7 m |
| Tree_Sugi_Young | junge Zeder 14,5 m, Krone tiefer | 3 672 / 708 / 68 |
| Tree_Sugi_Shinboku | **heilige Zeder** 27,6 m, Stamm 1,5 m mit Wurzelanlauf, Shimenawa (dickes Strohseil mit Knoten und hängenden Enden) und 4 Shide im Zickzack, ältere Nadeln mit braunen Spitzen | 5 522 / 1 032 / 68 |
| Tree_Matsu_Niwa | **Gartenkiefer** (kuromatsu, niwaki) 6 m: S-förmig geneigter Stamm mit Plattenrinde, waagrechte Äste mit flachen Wolkenpolstern, längster Ast auf zwei gekreuzten Stützen (shichū) mit Palmseil-Bund | 2 964 / 522 / 108 |
| Tree_Matsu_Aka | **Rotkiefer** (akamatsu) 14,8 m: geneigt, unten graue Platten, oben orange Schuppenrinde, Schirmkrone aus Polstern | 5 252 / 642 / 108 |
| Tree_Momiji_Green · _Red · _Gold | Fächerahorn 6,6 m: kurzer Stamm, drei Stämmlinge, feine Zweige, breite lichte Krone aus siebenlappigen Blättern; grün / rot / gold (Herbst-Akzent, D18 „10 %") | 3 264 / 738 / 48 |
| Tree_Sakura_Bloom · _Leaf | Somei-yoshino 8,8 m, Krone 11,5 m: dicker Stamm mit Querstreifen (Lentizellen), 4 weit ausladende Äste, Schirmkrone; Blüte (blassrosa, gekerbte Blütenblätter in Dolden) / Sommerlaub | 4 348 / 964 / 48 |
| Tree_Sakura_Shidare | **Hängekirsche** 7,7 m: Äste steigen, biegen über und lassen Vorhänge aus Blütenzweigen fast bis zum Boden hängen | 2 640 / 986 / 48 |
| Tree_Take_Grove | **Mōsō-Bambushain** (Stück ~4 m): 10 Halme 10–14,5 m mit Knoten und Wachsring, nach außen geneigt und oben gebogen, Laub nur in der oberen Hälfte | 4 825 / 1 520 / 28 |
| Bush_Tsutsuji · _Row_4m | **geschnittene Azalee** (karikomi) mit pinken Blüten, einzeln und als 4-m-Reihe | 360 / 80 / 20 · 1 440 / 320 / 40 |
| Bush_Tama | runder geschnittener Strauch (tamamono) | 360 / 80 / 20 |
| Bush_Ajisai | **Hortensie** (Regenzeit): große Blätter, blaue bis violette Blütenbälle | 360 / 144 / 20 |
| Bush_Sasa | **Kumazasa** (Zwergbambus mit hellen Blatträndern), kniehoher Teppich 3 × 3 m | 540 / 216 / 20 |
| Bush_Yabu | wilder Strauch für Wald- und Straßenränder | 483 / 168 / 20 |

- **Bauweise:** Äste = sich verjüngende Röhren (Rinde entlang, bei dicken
  Stämmen mehrmals rundherum). Laub = Büschel: dunkler Kern mit dichter
  Laub-Kachel + Schale aus 20 Blatt-Karten (Alpha), LOD1 8 Karten.
  Normalen der Karten zeigen vom Büschel- und Kronenmittelpunkt weg (Krone
  schattiert wie ein Volumen). Kronen von Ahorn/Kirsche über eine
  Hüllform gefüllt (`fill_crown`).
- **Budget** (Baum ≤ 6 000, Ziel 40–80 %): Zedern 61–92 %, Kiefern 49–88 %,
  Kirsche 72 %, Ahorn 54 %, Bambus 80 %, Hängekirsche 44 %. Gemessen und
  gekürzt: Shinboku 6 434 → 5 522 (Astquirle alle 1,55 m), Bambus 6 555 →
  4 825 (Laub ohne Kern, 10 Halme), Kiefern hoch 1 400 → 2 964 (Polster mit
  80 Karten statt 20: zu dünn). Büsche haben kein eigenes Budget (≤ 1 500
  angesetzt, werden tausendfach gestreut).
- **Gemessen:** 18 FBX, 0 Streck-Warnungen. FBX zurückgelesen: eigene
  Normalen, UV und ein Material kommen an. Alte Atlanten bitgleich (Rundung
  ≤ 1/255). **Ungeprüft:** alles in Unity (Alpha-Clip, beidseitig, Normalen,
  Mip-Stufen der Karten).
- **Offen / Ideen nach der Freigabe:** Wind (Biege-Gewicht als
  Vertex-Farbe: R = Höhe/Astspitze); Kiefer mit Strohmanschette (komomaki,
  Winter) und Schneeseilen (yukitsuri, Kanazawa); Farne/Gras-Büschel für den
  Waldboden; Zedernkarten aus der Nähe eher Laub als Nadeln (aus Fahrhöhe
  unauffällig).

### Tempel/Schrein-Pilot „Tera" (Atlas `Tera` + `TeraShop`, Generator `buildings/tera.py` + Bausatz `buildings/tera_kit.py`)

| FBX (`exports/buildings/`, Präfix `SM_Tera_`) | Bau | Ausstattung | Dreiecke Bau LOD0 / LOD1 · Ausstattung LOD0 / LOD1 |
|---|---|---|---|
| Hondo | **Wahrzeichen.** Haupthalle 5 × 4 Felder (13,5 × 10,2 m, First 13 m): Steinpodest, Umgang mit Geländer, Treppe mit Zwiebelknäufen, Zinnober-Rundsäulen auf Basissteinen, Gittertüren (hell), Shitomi, offene Brettür mit Altarbild, Stabfenster, 2-stufige Konsolen, Irimoya-Ziegeldach mit Eckhub, Sparren, Eckbalken mit Windglocken | Altar-Innenbild, Tafel 青嵐寺, große rote Laterne, Opferkasten, 2 weiße Laternen, Räucherbecken, 2 Nobori, Besen | **9 343** / 2 682 · 1 038 / 504 |
| Hondo_Yama | Bergtempel 3 × 3 Felder (Murō-ji): altes graues Holz, Ishigaki-Terrasse, 1-stufige Konsolen, Irimoya-Rindendach mit dicker Kante | Altar, Tafel, Opferkasten, kleines Räucherbecken, Besen | 5 700 / 2 222 · 410 / 228 |
| Sanmon | **Wahrzeichen.** Zweigeschossiges Tor (rōmon) 3 Felder, Durchgang mit großer Laterne (wie Kaminarimon), Gitter in den Seitenfeldern, Umgang oben, Irimoya-Ziegeldach | Tafel 青嵐寺, große Laterne | **7 073** / 2 448 · 166 / 92 |
| Pagoda_3 | **Wahrzeichen.** Dreistöckige Pagode 23,5 m: Podest mit Treppe, Konsolen je Stockwerk, Umgänge oben, Sōrin mit 9 Ringen, Flammenblech, Juwel | — | **9 072** / 4 412 |
| Shoro | Glockenturm auf Ishigaki-Sockel mit Steintreppe, offen, Querbalken | Bronzeglocke (Bänder, Haken), Stoßbalken an zwei Seilen, Zugseil | 3 185 / 1 154 · 380 / 138 |
| Yakuimon | Kleines Tor, 4 Pfosten, Ziegel-Satteldach, Torflügel offen | Besen | 1 341 / 552 · 12 / 12 |
| Haiden | Gebetshalle 3 × 2 Felder, unbemaltes Holz, Umgang, Gittertür (hell), hochgeklappte Shitomi, **Vordach (kōhai)** über der Treppe auf 2 Pfosten, Irimoya-Kupferdach | Shimenawa mit Shide und Quasten, Glocke mit Seil (rot/weiß/violett), Opferkasten, Tafel 雨宮神社, 2 Laternen, Koma-inu-Paar | 4 865 / 2 025 · 1 218 / 498 |
| Honden | Hauptschrein (shinmei): hoher Boden, Umgang, Treppe, Brettwände, Rinden-Satteldach, **Chigi** (gekreuzte Bretter) und 5 **Katsuogi**, freistehende Firstpfosten | kleine Shimenawa | 1 816 / 928 · 256 / 46 |
| Temizuya | Brunnenhaus: 4 Pfosten, Kupfer-Satteldach, Steinbecken mit Wasser, Bronze-Auslauf | 5 Schöpfkellen auf Bambusstangen | 1 024 / 610 · 196 / 136 |
| Juyosho | Amulett-Schalter 4 × 2 Felder: 3 Schalterfenster mit Ablage, Irimoya-Ziegeldach | Innenbild Amulette, Schild 授与所, Preistafel, Ema-Gestell, Omikuji-Gestell, 2 Nobori | 4 193 / 1 314 · 1 287 / 192 |
| Wall_Tsuiji_4m · Wall_Suji_4m | Bezirksmauer: Ishigaki-Sockel, geböschter Putz (weiß / ocker mit 5 weißen Linien), Holzband, Ziegelkappe mit First | — | 476 / 204 |
| Sando_8m · Path_Gravel_8m · Steps_Stone_8m | Sandō (Steinplatten, Bordsteine, Kies) · Bergweg (Kies, Trittsteine, Waldboden) · Steintreppe +2,4 m (16 Stufen, Ishigaki-Wangen, Absätze für Laternen) | — | 34 · 734 · 608 |
| Komainu_Pair · Jokoro · Ema_Rack · Omikuji_Rack · Nobori_Row_8m · Chochin_Rack · Tatefuda | Detail-Sets (Atlas TeraShop): Wächter auf Sockeln · Räucherbecken mit Dach · Ema-Gestell · Omikuji-Gestell · 6 rote Fahnen · Laternengestell (LIGHT_) · Tafel 由緒 | — | 304 · 202 · 202 · 996 · 396 · 892 · 40 |

- **Budget:** alle normalen Bauten ≤ 5 000 (Haiden 4 865, Juyosho 4 193).
  **Drei Wahrzeichen darüber**, gemessen mit `K.part_costs` und gekürzt
  (Haupthalle 12 955 → 9 343, Pagode 15 148 → 9 072, Tor 8 177 → 7 073).
  Größte Posten Haupthalle: Dachfläche mit Ziegelreihen 1 832, Konsolen
  1 456, Sparren 896, Geländer 818, Traufe 764, Säulen 720. Begründung: je
  ein Bau pro Tempelbezirk, Blickfang und Ziel des Weges, größer als 2–3
  Häuser (wie Wohnblock Tokyo, „als 3 Felder").
- **Gemessen:** 22 FBX, 0 Fehler, 0 Streck-Warnungen. **Ungeprüft:** alles
  in Unity (zwei Materialien je Bau: `M_Tera_Atlas`, `M_TeraShop_Atlas`).
- Requisiten aus Aufgabe 2 in den Bildern: Steinlaternen, Torii (Stein,
  Zinnober), Teehaus-Bank, Fahrrad, Felsen, Bambuszaun. **Zedern sind
  Platzhalter** nur für die Vorschau (Aufgabe 4).
- **Offen / Ideen nach der Freigabe:** Koma-inu noch kantig (runder,
  Mähne); Niō-Figuren im Tor; Tor-Varianten (Torii-Reihe wie Fushimi Inari
  als Stück); Kiesharken-Muster; Steinmauer-Ende; Kupferdach evtl. etwas
  dunkler (frische Patina ist so hell, wirkt aber im Neutralbild grell).

### Fischerdorf/Hafen-Pilot „Minato" (Atlas `Minato` + `MinatoShop`, Generator `buildings/minato.py` + Bausatz `buildings/minato_kit.py`)

| FBX (`exports/buildings/`, Präfix `SM_Minato_`) | Bau | Ausstattung | Dreiecke Bau LOD0 / LOD1 · Ausstattung LOD0 / LOD1 |
|---|---|---|---|
| Funaya_A | Bootshaus wie in Ine: 11 × 5,8 m, Giebel zum Meer, unten offene Bootsbucht (Slipanlage aus Beton mit Holzschienen bis unter Wasser, Steinfundamente ins Meer, Deckenbalken, Eckpfosten, Sturz), oben Wohnung mit Alu-Fenstern + Balkon (Geländer, Wäschestange), Bretterwände, Ziegeldach | Boot (Tenma) auf der Slip, Bojen-Netze, Netz über dem Geländer, Innenbild Bootslager, Reifen-Fender, Krabbenkörbe, Fass, Stiefel, Stangen | 3 492 / 1 115 · 1 229 / 569 |
| Funaya_B | Älteres Bootshaus 10 × 5 m: niedriger Netzboden aus rostigem Wellblech, Bretterladen + Fenster zum Meer, Wellblechdach | Boot, Netz am Balken, Bojen, Krabbenkörbe | 2 104 / 610 · 959 / 434 |
| Gyoka_Tin | Fischerhaus 9 × 6,4 m: oben blaues Wellblech (Profil als Geometrie, Lagen überlappend), unten Bretter, rotes Wellblechdach mit First- und Ortgangblech, Rinnen, Alu-Haustür mit Vordach, Fenstergitter, Haube, Balkon, Netzlager-Anbau, 2 Gasflaschen auf Sockel, Kerosintank + Boiler, Antenne | Netze + Bojen unterm Anbau, Krabbenkörbe, Fass, Stiefel, Töpfe | 4 987 / 1 432 · 954 / 347 |
| Gyoka_Kawara | Älteres Fischerhaus 10 × 7 m: dunkle Bretter, Ziegeldach, Holz-Glasschiebetüren (hell), Fenster mit Hauben, Wellblech-Rückwand, Anbau | Fisch-Trockengestell (himono), Tintenfisch-Leine, Kühlbox, Stiefel, Netze | 4 551 / 1 504 · 794 / 318 |
| Shokudo | Imbiss 海鮮食堂 かもめ: offener Laden mit Innenbild, Wellblech-Vordach über die ganze Front, Alu-Tür, oben graues Wellblech, blaues Dach | Schild, 2 Noren, 2 Nobori, Menütafel, Standschild, Kisten + Styroporboxen | 4 002 / 1 240 · 484 / 274 |
| Shop_Ice | Angel- und Eisladen 釣具・氷: Scheinfassade aus Wellblech vor dem Dach, Rolltor halb offen mit Innenbild, Alu-Tür | Schild, Standschild 釣りエサ, Kühlbox, Styroporboxen, Seil, Bojen | 2 656 / 636 · 564 / 258 |
| Amigoya | Netzschuppen 6,4 × 4,6 m, ganz aus rostigem Wellblech, weit offen, Anbau | Netzhaufen innen + davor, Bojen, Krabbenkörbe, Fass | 1 608 / 310 · 1 524 / 447 |
| Ichiba | Fischhalle 24 × 12 m: Stahlrahmen alle 6 m, Faltblechdach (seppan), 2 Felder offen / 2 mit Rolltor, Wellblech auf Betonsockel, Büro mit Fenstern, Rolltore hinten/seitlich, Leuchtröhren (LIGHT_) | Schild 海猫港 魚市場, Kistenstapel, Styroporboxen, Fässer | 4 866 / 774 · 1 290 / 1 040 |
| Funaya_A_Quiet · Gyoka_Tin_Quiet | Bucht-Versionen: Fenster dunkel, Läden zu | Netze, Bojen, Boote bleiben | wie oben |
| Quay_8m · Quay_Stone_8m · Quay_Steps_8m | Kaimauer Beton (Poller, V-Fender, Leiter, Kante, 8 m Meer) · alte Steinmauer (Granitpoller, Reifen) · Treppe ins Wasser (Algen, Handlauf) | — | 258 · 144 · 246 |
| Pier_8m · Breakwater_8m · Lighthouse_Red · Sea_8m | Steg auf Betonpfählen (Planken, Klampen, Reifen, Leiter) · Wellenbrecher mit Brüstung und Tetrapoden · kleiner roter Hafenleuchtturm (Galerie, Laterne, LIGHT_ rot) · Meer | — | 758 · 790 · 474 · 4 |
| Boat_Ika · Boat_Skiff | Tintenfischboot 12 m (FRP-Rumpf mit Streifen, Steuerhaus, Radar, Antennen, 2 Reihen Lampen an Drähten, Fangmaschinen, Reifen, Stützsegel, Name 第八 海幸丸) · Tenma mit Außenborder | (Atlas MinatoShop) | 2 345 / 347 · 365 / 127 |
| Gear_Market · Gear_Drying · Gear_Nets | Kleinkram-Sets zum Verteilen: Fischkisten + Styropor + Fässer + Kühlbox + Seil + Stiefel · 2 Trockengestelle + Tintenfisch-Leine · Netzhaufen + Krabbenkörbe + Bojen | (Atlas MinatoShop) | 614 · 330 · 758 |

- **Budget:** alle Häuser ≤ 5 000 (Gyoka_Tin 4 987 nach Messung: Öffnungen
  1 916, Wellblech-Wände +1 506 gegenüber Brettern, Dachlagen 528, Anbau 298,
  Balkon 258 → Rahmen ohne verdeckte Flächen, Wellenabstand Wand 0,27 m /
  Dach 0,34 m, Halle 0,36 m). LOD1 = glatte Bleche, keine Rahmen/Gitter.
- **Gemessen:** 22 FBX, 0 Fehler, 0 Streck-Warnungen; Szenen räumen sich
  selbst auf (verlinkte Kopien). **Ungeprüft:** alles in Unity (zwei
  Materialien je Haus: `M_Minato_Atlas`, `M_MinatoShop_Atlas`; Wasser ist im
  Atlas nur eine glänzende Fläche — echtes Wasser macht Unity).
- **Wasserstand:** Kai-Oberkante z = 0, Meer z = −1,1 (`minato_kit.WATER_Z`).
  Funaya-Ursprung: Mitte des Hauses; die Uferlinie liegt 1,9 m (A) bzw.
  2,0 m (B) hinter der Mitte (landseitig) — so stehen sie im Bild.
- **Offen / Ideen nach der Freigabe:** Wasser-Shader in Unity; Boote als
  bewegliche Objekte; mehr Bucht-Häuser (Funaya mit weißem Putz, mit
  Rolltor); Wellenbrecher-Kopf (Ende) als eigenes Stück; Kran/Winde am Kai.

### Gassho-Pilot (Atlas `Gassho` + `GasshoShop`, Generator `buildings/gassho.py` + Bausatz `buildings/gassho_kit.py`)

| FBX (`exports/buildings/`, Präfix `SM_Gassho_`) | Bau | Ausstattung | Dreiecke Bau LOD0 / LOD1 · Ausstattung LOD0 / LOD1 |
|---|---|---|---|
| L_Honke | Großes Haupthaus 20 × 11,5 m, First 15,4 m, Giebel zur Straße, 4 Dachgeschosse mit Fenstern, Brett-Vordach am Giebel, Shoji + Engawa an der Sonnenseite, Sturmläden | Kakis unter der Traufe, Leiter, Brennholz, Strohgarben, Zuber, Feuereimer, Töpfe | 4 768 / 1 455 · 1 566 / 494 |
| M_Minshuku | Gasthaus 16 × 10 m, Eingang mit Herdraum (irori) hell, viele helle Fenster, Vordach auf Pfosten | Schild 民宿 かや乃 auf dem Vordach, Noren 民宿, Wandlaterne, Standschild, Bank, Kakis, Leiter, Brennholz | 4 554 / 1 423 · 1 134 / 484 |
| M_Cafe | Café 14 × 9,5 m, **Langseite zur Straße**, offener Laden, Gitter, Shoji, Engawa | Wandschild 茶房 ゆい, Noren, Menü, Nobori 甘味処, rote Bank mit Schirm, Kakis, Brennholz | 3 763 / 1 145 · 988 / 434 |
| S_Koya | Kleines Bauernhaus 11 × 7,6 m, 2 Dachgeschosse, **Schneebretter** halb aufgestellt, viel Moos | Strohgarben, Rettiche, Brennholz, Korb, Leiter | 3 350 / 1 101 · 896 / 232 |
| M_Washi | Gokayama-Art 13 × 8,8 m, 62°, **Stroh-Vordach** über dem Giebel, Fenster mit Brett-Hauben, Werkstattladen | Schild 五箇山和紙, Noren 和紙, Standschild, Lampe, Washi-Trockenbretter | 3 931 / 1 141 · 610 / 358 |
| L_Honke_Field · S_Koya_Field | Feld-Versionen: Läden zu (Sturmläden), alle Fenster dunkel | nur Bauernsachen | wie oben |
| Itakura · Naya · Hosuiju · Hokora | Speicher auf Steinen (Schloss, Stufen) · offener Holzschuppen · Feuerhütte des Löschwerfers (Mini-Gassho, rote Tür 放水銃, Standrohr) · Bergschrein auf Ishigaki-Sockel | Korb/Zuber · Brennholz, Leiter · Schild · Tafel 山之神, Opfergaben | 768 · 562 · 388 · 240 |
| Road_8m · Paddy_8m · Hasa_6m | Kiesweg mit Steinrinne und Plattenbrücke · Reisfeld-Rand mit Damm · Reis-Trockengestell mit Strohbündeln | — | 206 · 85 · 834 |

- **Budget:** alle ≤ 5 000 (Honke 95 %, Minshuku 91 %), gemessen nach Teilen
  (Stil-Kit „Gassho-Bausatz"). LOD1 23–33 % (Dach ohne Stufen/Stangen,
  Fenster als Bild).
- **Gemessen:** Bau 14 FBX, 0 Fehler, 0 Streck-Warnungen; nach den Bildern
  steht nichts verschoben. **Ungeprüft:** alles in Unity.
- Lichter: `LIGHT_` vor offenen Läden, hellen Shoji-Reihen und Wandlaternen.
- Steinlaterne, Ishigaki-Mauer, Fahrrad, Torii, Bambuszaun, Fels in den
  Bildern sind Requisiten aus Aufgabe 2.
- **Offen / Ideen nach der Freigabe:** Wassermühle-Hütte; Stroh-Textur aus
  der Nähe noch etwas „brettig"; Feuerwerfer als eigenes Objekt (für das
  berühmte Wasserspiel); mehr Giebel-Varianten (Balkon).

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
- Vegetation (Aufgabe 4) hat einen eigenen Atlas `Flora` mit Alpha und
  das Cutout-Material `M_Flora_Atlas` (`K.cutout_material`).

## Nächste Aufgabe (5) — Nachlieferung für Phase 5 (Stand 2026-10-08)

PLAN-Aufgaben 1–4 sind gebaut (4 wartet auf Freigabe). Die Hauptsitzung
braucht für die Orte noch Modelle (`docs/STATUS.md`, „Für die
Asset-Sitzung" und „Offene Probleme"). Drei Sitzungen, in dieser Reihenfolge:
- **5a — Löcher + Streugut:** 395 sich selbst schneidende Polygone in 29
  Meshes (Unity verwirft sie) → Ursache im Kit finden, alle FBX neu;
  Tetrapod (372×), Leitpfosten (170×), Betonmauer (79×), Gewächshaus (30×),
  Jizō, Grabsteine/Friedhof, Kido-Tor, weißes Molenfeuer, Slipanlage,
  einzelne Nobori, Veranstaltungstafel.
- **5b — fehlende Gebäude:** Autohaus Petal Motors, Werkstatt Open Bay,
  Toki-no-Kane-Glockenturm, moderne Wohnhäuser, Brauhalle mit Schornstein,
  Holz-Izakaya für Yokochō-Gassen, Mühlhaus mit Teich und Rinne.
- **5c — Tokyo-Höhe + Rest:** Hochhäuser 40–154 m, Kino-/Hotel-/
  Markthallen-Fronten, Kaki und Weide als Baumarten, Kei-Truck.

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

1. **Streugut ansehen** (`previews/Scatter_Scenes.png` zuerst, dann
   `Scatter_detail.png`) und freigeben oder sagen, was nicht passt. Zwei
   Entscheidungen von mir: Das Kido-Tor überspannt die ganze Straße
   (echte Tore waren schmaler, Autos müssen durch), und das weiße
   Molenfeuer leuchtet grün (so ist es in Japan).
2. Falls du doch etwas gegen die drei Tempel-Wahrzeichen über 5 000
   Dreiecken hast (Haupthalle, Pagode, Tor): sag es, dann verkleinere ich sie.
3. Der Unity-Sitzung sagen: „Vegetation aus ArtSource importieren
   (ArtSource/STATUS.md, Abschnitt Für die Hauptsitzung)" — und weiterhin
   den Lichttest.

## Für die Hauptsitzung (darf ich nicht ändern)

- **Vegetation importieren** (ersetzt die vorläufigen Bäume aus
  `Editor/Vegetation/TreeBuilder`, D18) — **vom Menschen freigegeben
  (2026-10-08)**:
  - 18 FBX in `exports/vegetation/` (`SM_Tree_*`, `SM_Bush_*`), je
    `_LOD0/_LOD1/_LOD2` + bei Bäumen `COL_` (Stammbox 3 m hoch). Atlas
    `T_Flora_{BaseColor,MaskMap,Emission}`; **BaseColor hat Alpha**.
  - Material `M_Flora_Atlas`: URP/Lit, **Alpha Clipping 0,5**,
    **Render Face Both** (Karten sind einzelne Flächen), keine Emission.
    Textur: „Alpha is Transparency" an, **„Mip Maps Preserve Coverage"**
    (Cutoff 0,5) — sonst dünnt das Laub in der Ferne aus.
  - Modell-Import: **Normals = Import** (eigene Normalen: die Krone
    schattiert wie ein Volumen; „Calculate" macht daraus Papierkarten).
  - Zuordnung zu den bisherigen Arten: Cedar → `Tree_Sugi` /
    `_Sugi_Young` (Wald), Maple → `Tree_Momiji_Green` (+ `_Red`/`_Gold`
    als 10 % Herbst), Cherry → `Tree_Sakura_Bloom` (oder `_Leaf`), Bamboo
    → `Tree_Take_Grove` (ein Stück ist schon ein Hain ~4 m), Bush →
    `Bush_Yabu` (Wald/Straße), `Bush_Tsutsuji`/`_Tama`/`_Ajisai` (Gärten,
    Tempel, Orte). Neu: Kiefer (`Tree_Matsu_Aka` an Küste/Hängen,
    `Tree_Matsu_Niwa` in Gärten), `Bush_Sasa` (Waldboden),
    Einzelstücke `Tree_Sugi_Shinboku` (an Schreinen) und
    `Tree_Sakura_Shidare` (Tempel).
  - Dreiecke LOD0 ≤ 5 522 (Bäume), LOD2 ≤ 108. Größen in der Tabelle oben.
- **Streugut importieren** (Aufgabe 5a, nach Freigabe): neuer Atlas
  `T_Scatter_{BaseColor,MaskMap,Emission}` → `M_Scatter_Atlas` (deckend,
  Emission nur für LED-Strahler). 21 FBX in `exports/props/` + `Kiso_Kido`,
  `Minato_Lighthouse_White`, `Minato_Slipway_8m` in `exports/buildings/`.
  Platzhalter-Zuordnung: tetrapod → `Tetrapod` (gemischt mit `_Tilted`,
  zufällige Drehung um Z; Haufen-Stellen → `Tetrapod_Pile`), delineator →
  `Delineator_White` (Gassho/Pass: `SnowPole`), concreteWall →
  `Wall_Concrete_8m` (8,4 m wie der Platzhalter; Abwechslung
  `Wall_Kenchi_8m`; hohe Hänge `Wall_Norimen_8m`), greenhouse →
  `Greenhouse_Closed` (jedes dritte `_Open`). Für Phase-5-Orte: Jizō
  (Gassho), Friedhof/Kido-Tor (Kiso), weißes Molenfeuer/Slipanlage
  (Funaura), Nobori ×6 + EventBoard (Sakura Commons).
- **Alle FBX neu (2026-10-08, Aufgabe 5a), bitte „JapanMap/Art/Import
  Library" neu laufen lassen.** Die FBX enthalten jetzt nur Dreiecke; die
  395 verworfenen Polygone (Löcher) sollten im Import-Bericht verschwinden.
  Dreieckszahlen fast gleich (−0 bis −4 je Asset).
- **Alle FBX neu exportiert** (2026-10-08, Koedo): Die Triangulierung im
  Kit hat sich geändert (siehe Lektionen). Wer FBX schon importiert hat,
  importiert neu; Dreieckszahlen bleiben fast gleich.

## Gefunden / Lektionen (für docs/LESSONS.md)

- 2026-10-08 (Aufgabe 5a, Streugut):
  - **Gewächshaus-Giebel waren Dreiecke:** Profilpunkte in falscher
    Reihenfolge (links vom First statt vom Boden). Gefunden im ersten Bild.
  - **Szenen-Kamera stand im Tetrapod / Hangplateau wirkte als Überhang:**
    Szenen immer einmal ansehen (wie Tera/Flora); Szenen jetzt als Code
    in `props/scatter_shots.py`.
  - **`montage.mjs --out` relativ** löst gegen das Repo auf; `../x.png`
    landete außerhalb. Immer absolute Pfade für `--out` außerhalb des Repos.
- 2026-10-08 (Aufgabe 5a, Löcher):
  - **Unity verwarf 395 Polygone (Löcher):** die Triangulierung im Kit lag
    vor der Fase, der Bevel-Modifier macht beim Export neue n-Ecke. Jetzt
    Triangulate-Modifier als letzter im Stapel (Vorschau = FBX) und Prüfung
    `K.poly_check` im Bauprotokoll (Werkzeug). Erst gemessen (Fase an/aus:
    251 von 257 aus der Fase), dann behoben.

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
- 2026-10-08 Nachmittag (Gassho):
  - **Fasen kosteten ~900 Dreiecke**, weil die Spaltenlinien der Öffnungen
    jede waagrechte Profilkante zerschneiden (gemessen: 52 Stücke je Kante;
    Zellen-UVs je Fläche verhindern das Verschmelzen). Sockel-, Schwellen-
    und Pfettenkanten im Gassho-Sweep ohne Fase (Bausatz).
  - **Stroh über 10 m Hang** passt in keinen Streifen: Dach in Lagen ≤ 2 m,
    Textur in U und V kachelbar (`pnoise`), UVs am Hang entlang
    (`map_axes`) — Werkzeug im Bausatz.
  - **Blender stürzte ab**: nichts verloren, weil alles aus Skripten kommt;
    Szene mit `build.run([...])` in einer Minute wieder da. Neu exportierte
    Requisiten-FBX (Zeitstempel) mit `git checkout -- ArtSource/exports/props`
    zurückgesetzt, sie gehörten nicht zur Aufgabe.
- 2026-10-08 Abend (Vegetation):
  - **Karten mit gemeinsamem Mittelpunkt wirkten wie Sterne** (Zedernzweige
    strahlenförmig aus der Kartenmitte): Triebe über die ganze Karte
    verteilt, jeder in eigener Richtung (`card_sugi`).
  - **Dunkle Kerne lasen sich als glatte schwarze Kugeln** zwischen den
    Karten: Kerne bekommen eine dichte Laub-Kachel ohne Alpha (`dense`).
  - **Alle Karten tangential auf einer Kugel** zeichneten deren Rand als
    Linie („Kugelschalen"): Tiefe und Neigung je Karte zufällig.
  - **Laubbäume sahen aus wie Schirmakazien** (Büschel nur an den
    Zweigspitzen): Krone über eine Hüllform füllen (`fill_crown`).
  - **Rinde einmal rund gestaucht** (Kiefernplatten wie Pflaster am dicken
    Stamm): der Streifen läuft bei dicken Stämmen mehrmals rundherum
    (Teiler der Seitenzahl, damit keine Fläche über den Streifen ragt).
  - **Grau-Test machte Karten zu Quadraten** (Material-Override ohne
    Alpha): `P._clay` liest bei Objekten mit Eigenschaft `cutout` das
    Flora-Alpha (Werkzeug).
  - **Kartenbüschel stand aus der geschnittenen Oberseite** der Azalee:
    `cards(zmax=…)` legt sie auf die Schnittfläche.
  - **Kamera in einer Krone / Baum 2 m neben einem anderen:** Szenen
    einmal ansehen (wie bei Tera) — Kirschabstände und Shinboku-Platz
    korrigiert.
  - `Tools/montage.mjs`: eine Beschriftung mit „=" bricht ab (Trenner von
    `label=pfad`) — vermeiden oder dort nur am ersten „=" trennen.
- 2026-10-08 Nacht (Tempel):
  - **Traufbretter mit Punkten der falschen Dachseite:** eine Hilfsfunktion
    in der Schleife über die Dachseiten griff erst später auf `side`/`cache`
    zu (Python bindet spät) → Standardwerte binden. Gefunden über
    Streck-Warnungen an der Traufe; alle Bausätze nach Funktionen in
    Schleifen durchsucht (nur Tempel betroffen, sonst sofort benutzt).
  - **Dreiecke je Teil messen war Handarbeit:** neu `K.part_costs(modul,
    [namen], fn)` im Kit (Werkzeug) — Haupthalle 12 955 → 9 343 in zwei
    Schritten.
  - **Kies und Waldboden unsichtbar** (zweites Mal, nach Kiso): Bodenstücke
    lagen auf 0 im Bühnenboden. Regel im Stil-Kit: Bodenstücke ≥ 2 cm über 0.
  - **First auf kleinen Dächern so groß wie auf der Haupthalle:** Firsthöhe,
    Grat und Onigawara folgen jetzt der Dachtiefe (`T.roof`).
  - **Stehende Kamera in Tor/Torii-Säule:** Szenen-Bilder immer einmal
    ansehen; Kameras in `tera.shots` korrigiert.
- 2026-10-08 Abend (Fischerdorf/Hafen):
  - **Wellblech als Geometrie war zu teuer** (Fischerhaus 5 705): gemessen
    nach Teilen, dann Wellenabstand und verdeckte Rahmenflächen gekürzt
    (4 987). Dreieckswelle mit weichen Normalen liest sich als runde Welle.
  - **Gestreckte Texturen** an senkrechten Holz-Leisten (Streifen 0,67 m):
    Leisten jetzt `rotate=True`; Netzhaufen mit Rechteck-Grafik nicht über
    `map_box` (Streifen-Funktion) mappen.
  - **Schlitz unter der Traufe** (Dachunterseite lag über der Wand):
    Blechdach-Platte so gebaut, dass die Unterseite an der Wandlinie auf der
    Wandoberkante liegt; Giebel-Oberkante folgt derselben Linie.
  - **Szenen mit verlinkten Kopien** (`minato._scene/_clear`): ein Haus kann
    mehrmals stehen, nichts wird verschoben, alles wird gelöscht.
  - **Steinmauer sah aus wie Maschendraht** (dünne dunkle Diagonal-Fugen):
    größere Steine, Licht oben, Schatten unten, weiche Fugen.

