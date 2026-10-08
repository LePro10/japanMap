# Stil-Kit (Asset-Sprint, Aufgabe 1)

Regeln für alle selbst gebauten Modelle. Stimmung und Budgets:
[docs/ART-DIRECTION.md](../docs/ART-DIRECTION.md). Code: `ArtSource/kit/`.

**Kurz:** Die Form trägt das Detail (Fasen, Stufen, Rücksprünge, Ziegelreihen
sind Geometrie). Die Textur liefert nur Farbe, leichtes Rauschen und
Abnutzung. Ein Material je Baustil. **Prüfstein:** Im Grau-Bild ohne Textur
(`*_clay.png`) muss man das Objekt erkennen.

## Maßstab und Ausrichtung

- Meter. Ursprung am Boden, in der Mitte der Grundfläche.
- Vorderseite schaut in Blender nach **−Y** (Ansicht „Vorne"). Der FBX-Export
  (`axis_forward='-Z', axis_up='Y'`, Transform angewendet) macht daraus
  **+Z in Unity** — *ungeprüft, bis die Hauptsitzung das erste FBX importiert*.
- **Gebäude** sind ganze Häuser aus einem Generator mit Feldern (Bays):
  Wandprofil einmal ums Grundrissrechteck geführt (Gehrung an den Ecken),
  Fenster/Türen als Spalten darin, Dach als Profilkörper. Kura: Feld 3,0 m,
  Tiefe 4,5 m, Traufe 5,42 m, First 7,9 m. Mehr Felder = längeres Haus.
- Glaubwürdige Maße, vorher nachschlagen. Pilot-Maße: Steinlaterne 1,96 m,
  Getränkeautomat 1,83 × 1,00 × 0,75 m, Kura 6,0 × 4,5 m (2 Felder),
  Sockel 0,5 m, Namako-Band 1,0 m, Traufüberstand 1,15 m, Dachneigung 30°.

## Fasen und Normalen

- Bevel-Modifier, **1 Segment** (2 Segmente verdoppeln die Dreiecke, gemessen
  am Automaten: 1 270 → 2 498), nur Kanten über **35°**, harte Normalen.
  Runde Teile bleiben glatt, Kanten fangen Licht.
- Fasen nur, wo man sie sieht: Ziegelreihen, Gitterstäbe, Lamellen und tiefe
  Laibungen sind ausgenommen (`K.nobevel`). Gebäude verschmelzen ebene
  Nachbarflächen vor dem Fasen (`dissolve=True`), sonst zahlt jede
  Rasterspalte eigene Fasen (Kura: 4 991 → 4 035).
- Breiten: Stein 12 mm · Blech/Kunststoff 12 mm · Gebäude 20 mm.
- LOD1 ohne Fasen, mit harten Kanten ab 35°.

## Materialien und Atlanten

- Je Baustil **ein** deckendes Material `M_<Stil>_Atlas` + das gemeinsame
  `M_Glass` (durchsichtig). Atlanten: `Props` (Schrein/Stein, Automaten),
  `Street` (Masten, Schilder, Ampeln, Zäune, Ishigaki, Bänke, Haltestelle,
  Fahrräder), `Nature` (Felsen, Laub, Erde, Töpfe — später Vegetation;
  nur deckend, Blatt-Karten mit Alpha brauchen in Aufgabe 4 ein eigenes
  Material), `Kura`, `Tokyo` (Fliesen- und ALC-Wände, Konbini, Schilder,
  Neon). Neuer Baustil = neuer Atlas (z. B. `Kiso`).
- Atlas 1024², drei Karten passend zu URP/Lit:
  `T_<Stil>_BaseColor` (sRGB) · `T_<Stil>_MaskMap` (R Metall, G AO = 1,
  A Glätte; linear) · `T_<Stil>_Emission` (sRGB).
- Aufbau des Atlas (`kit/atlas.py`, Tabelle `LAYOUTS`):
  - **Streifen** über die volle Breite — wiederholen sich in U (Wände, Stein,
    Holz). **Maßstabsgetreu in beiden Richtungen**, nie gestreckt; V beginnt am
    Fuß des Teils (Schmutz unten). Ein Streifen ist so hoch wie die höchste
    Fläche, die ihn nutzt (Putz: 2 m). Zu hohe Flächen meldet der Bau als
    `WARN stretched strips` — dann Fläche teilen oder Streifen erhöhen.
  - **Zellen** 64 px — eine Farbe mit sanftem Schmutzverlauf, **ohne
    Rauschen** (Zellen decken ganze Flächen, Rauschen würde verschmieren).
    `map_faces` bleibt in beiden Achsen vom Zellrand weg (U 0,3–0,7,
    V 0,12–0,88): Mip-Stufen mischen Nachbarzellen, eine leuchtende
    Nachbarzelle glühte sonst als Linie am Rand mit.
  - **Rechtecke** — Grafik genau auf eine Fläche (Display, Bedienfeld,
    Seitenwerbung, Aufkleber, Typenschild, Wappen, Oni-Ziegel).
- Neue Farben/Muster: Eintrag in `LAYOUTS`, nie ein zweites Material.
- **Texel-Dichte:** Streifen 128 px/m (Namako 256 px/m wegen der feinen
  Fugen). Blickfänge dürfen mehr haben (Display ≈ 580 px/m).

## Farbpalette (sRGB)

| Rolle | Farbe | | Rolle | Farbe |
|---|---|---|---|---|
| Granit (kühl) | `#808183` | | Kalkputz weiß | `#e2dccf` |
| Moos | `#4d5a2c` | | Kalkputz schwarz (Koedo) | `#1a1a1c` |
| Holz dunkel | `#3a281c` | | Namako-Fliese / Fuge | `#2f343b` / `#ddd9cf` |
| Dachziegel (3 Töne) | `#4d5560` `#454c56` `#555d68` | | Eisen | `#26272a` |
| Automat rot / blau / weiß | `#b3141c` / `#1c4a9c` / `#e6e7e6` | | Zinnober (Torii) | `#c4381c` |
| Licht warm | `#ffb768` | | Papierlicht | `#ffd9a0` |
| Licht kühl (LED) | `#dff3ff` | | Beton | `#9b9993` |
| Ishigaki (Grau/warm/kühl) | `#84817b` `#857766` `#757b81` | | Laub / Blüte Azalee | `#3c5a2a` / `#e0577f` |
| Fels | `#7f7e7a` | | Rückstrahler | `#f08a1c` |
| Fliese beige / braun (Tokyo) | `#b9a78c` / `#6e5143` | | ALC-Platte | `#d9d8d2` |
| Konbini blau / orange (fiktiv) | `#2d8fd6` / `#f39a1e` | | Neon pink / cyan | `#ff3fa4` / `#3fe6ff` |

Gedämpfte Grundtöne, kräftige Farben nur als Akzent (Automat, Torii, Licht).

## Japanisch, nicht allgemein (Rückmeldung 2026-10-08)

Ein Asset muss als **japanisch** erkennbar sein, nicht nur als „Mauer" oder
„Geländer". Die Betonsteinmauer in Läuferverband wirkte europäisch → ersetzt
durch **Ishigaki** (Bruchsteinmauer: runde, flach liegende Steine, tiefe
dunkle Fugen mit Keilsteinen, Moos in Flecken, geböschte Front). Vor jedem
Asset fragen: Welche Variante gibt es *so* nur in Japan? Beispiele, die
freigegeben sind: Ishigaki, Kenninji-Bambuszaun mit Palmseil-Knoten,
Itabei-Brettzaun mit Ziegeldach, Leitplanke mit Rückstrahler (デリネーター),
Mamachari mit Korb, runde バス停-Tafel auf Betonfuß, Topfgarten (roji).
Auch Muster prüfen: Voronoi-Steine ohne Licht/Schatten sahen aus wie
Gartenplatten — Steine brauchen runde Ränder, Licht oben, Schatten unten.

## Befestigung zeigen (Rückmeldung 2026-10-08)

„Zu schlicht" hieß: Profil, Pfosten und Befestigung fehlten. Jedes gebaute
Teil zeigt, **wie es hält**: Schrauben/Muttern, Halter, Schellen, Kappen,
Fußplatten, Seilbünde, Sockel, Stoßlaschen; Bleche mit echter Stärke und
Profil (W-Profil mit Kanten), Pfosten mit Kappe. Prüfen mit einer
**Nahaufnahme** (`P.details`, unten) — die Gruppen-Vorschau ist dafür zu klein.
Weißer Lack wirkt im neutralen Licht flach; Profile im Stimmungsbild oder
in der Nahaufnahme beurteilen.

## Gebäude-Bausatz (Tokyo, ab 2026-10-08)

Vorbild für neue Baustile: `buildings/tokyo_kit.py` (Module) +
`buildings/tokyo.py` (Häuser als Daten).
- **Wandprofil** je Geschossart (`profile`): Laden (Sockel, Brüstung,
  Kämpfer, Blende), Wohnen (Deckenband, Brüstung, Fensterzone, Sturz),
  oben Attika mit Abdeckblech. Läuft einmal um den Grundriss.
- **Öffnungen** sind Daten: `op(Seite, u0, u1, Geschoss, Modul, Zeilen)`.
  Module: Fenster (Laibung, Alu-Rahmen, Schiebeflügel, Sohlbank, Gitter,
  Klimagerät), Konbini-Front, Izakaya, Rollladen, Eingang, Stahltür.
- **Teile auf Wandrahmen** `F` (u entlang der Wand, z hoch, d nach außen;
  jedes Modul funktioniert auf jeder Seite): Balkon, Laubengang,
  Stahltreppe, Klimagerät, Fallrohr, Zählerkasten, Schilder, Nobori,
  Dachtechnik (Wassertank, Treppenhaus, Billboard, Antenne).
- Wand-Streifen sind 2 m hoch (96 px/m); das Profil teilt jedes Geschoss so,
  dass keine Wandfläche höher ist (`STRIP_H`).
- **Fasen** nur an Hülle, Bändern und großen Teilen; Laibungen,
  Kleinteile, Gitter, Rohre ohne (`nb`). Die Fasen kosteten sonst 40 %.
- Schilder sind auch eigene FBX (`Tokyo_Sign_*`, Ursprung = Wandbefestigung),
  damit Phase 5 sie an jede Fassade hängen kann.
- Typisch Tokyo und Pflicht im Bausatz: Klimageräte mit Leitungskanal,
  Fallrohre, Zählerkästen, Fenstergitter, senkrechte Mieterschilder,
  Nobori, Rollladenkasten, Laubengang mit Stahltreppe, Balkon-Trennwand
  (非常の際は…), Wäschestangen, Wassertank auf dem Dach, Fliesen
  (二丁掛) und ALC-Platten statt Ziegel/Putz.

## Abnutzung

- **Schmutz unten:** jede Fläche wird zum Boden hin dunkler (Spritzwasser).
- **Regenspuren:** dünne, unterbrochene Läufe (wenige cm breit, 10–60 cm
  lang) auf Putz und Stein — keine breiten Schlieren. Lack bleibt sauber;
  Abnutzung dort über Form und Aufkleber.
- **Moos:** nur auf nach oben zeigenden Flächen (Dach, Absätze).
- Nässe kommt **nicht** in die Textur — das macht später ein Shader-Effekt
  in Unity für alle Flächen gleich.

## Licht

- Leuchtende Flächen über die Emission-Karte (im Atlas).
- Wo ein echtes Licht hingehört, setzt der Generator ein Empty
  `LIGHT_<Name>` mit Eigenschaften `color`, `unity_range`, `unity_intensity`.
  Die Vorschau macht daraus eine Punktlampe, Unity später eine Light.
- Helligkeit der Emission in Unity gegen einen gemessenen Bezugspunkt
  einstellen (ART-DIRECTION.md), nicht nach Gefühl.

## Grafiken (Schilder, Tafeln, Banner)

Flache Grafiken mit Schrift entstehen als SVG in `kit/graphics.mjs` und
werden mit dem Headless-Chrome der Tools gerendert (`node
ArtSource/kit/graphics.mjs` → `kit/gfx/*.png`, committet; japanische Schrift
über Hiragino). Der Atlas lädt sie als Rechteck (`png(...)`). Schildplatten
folgen dem Umriss der Grafik, die UVs laufen über dieselben Pixelkoordinaten.
**Keine echten Firmen- oder Betreibernamen** — Texte sind fiktiv oder
allgemein (止まれ, 稲荷神社, „Sakura-dōri").

## Runde Teile und Rohre

- Masten und Säulen: `K.map_cyl` (Höhe läuft entlang U, Umfang einmal über
  V). Die Naht liegt hinten (+Y) **auf einer Kante** — Lathe mit Phase 0 und
  Seitenzahl durch 4 teilbar, sonst ragt eine Fläche aus dem Atlasfeld.
- Rohre, Kabel, Ausleger: `K.tube_path(..., reg=Streifen)` mappt entlang der
  Rohrlänge.
- Bretter, Latten, Pfosten: eine Fläche je Brett (eigene Maserung);
  `rotate=True` für senkrechte Maserung; `s_offset` versetzt Muster (Knoten).

## Organische Formen (Felsen, Büsche)

`kit/organic.py`: `lump()` = Ikosphäre mit Rauschen, optional planare
Bruchflächen (Fels), plane Oberseite (Hecke, Trittstein), Boden-Klemme;
`shrub()` = Hauptballen + kleinere Ballen. LOD0 und LOD1 aus demselben Seed
haben dieselbe Silhouette. **Achtung Blender 5:** `create_icosphere`
zählt das Ikosaeder als Stufe 1 → 2 = 80, 3 = 320, 4 = 1 280 Dreiecke.
UVs mit `K.map_box` (Projektion entlang der Hauptachse, Nachbarflächen
nahtlos) statt `map_faces` (Tangente je Fläche → Nähte überall).

## LOD, Collider, Namen

- LOD-Stufen baut der **Generator** mit weniger Details (keine Fasen, weniger
  Segmente, kleine Teile weg) — kein Decimate. Ziel LOD1 ≈ 30–50 %.
- Ein Mesh je LOD: `SM_<Name>_LOD0`, `SM_<Name>_LOD1` (Unity baut daraus
  die LOD Group). Collider: `COL_<Name>` (einfache Box). Licht: `LIGHT_<Name>`.
- Varianten (Farbe, Fenster) sind eigene FBX: `SM_<Name>_<Variante>.fbx`.
- Weitere Marker: `CABLE_<HV|LV|TEL>_<i>` (Kabel-Anschlusspunkte am Mast),
  `LENS_<Car|Ped>_<Farbe>` (eigenes Mesh je Ampellicht — Unity schaltet es
  ein/aus, dahinter liegt eine unbeleuchtete Linse).
- `exports/manifest.json` (schreibt `build.run`): je FBX die LOD-Meshes,
  Dreiecke, Materialien, Collider, Lichter, schaltbaren Teile und
  Anschlusspunkte — der Unity-Import liest das, statt Namen zu raten.
- Lange Module (Leitplanke) sind entlang X in Stücke geteilt, damit Unity
  sie entlang einer Spline biegen kann. Linke Enden = gespiegelte rechte
  (Scale X −1).

## Arbeitsablauf

In Blender (über den Blender-MCP):

```python
import sys; sys.path.insert(0, '/Users/leandro/Documents/japanMap/ArtSource')
import importlib, build; importlib.reload(build)
build.run(['stone_lantern'])   # oder build.run() für alle
```

Baut, zählt Dreiecke, meldet die Maße (B × T × H — ein verirrtes Teil fällt
sofort auf), exportiert nach `exports/<klasse>/`, schreibt Atlanten
nach `exports/textures/` und Vorschauen nach `previews/`. Ein Asset-Modul
braucht `KLASS`, `NAME`, `build()`; optional `preview()`.

Ein Stil-Bausatz (`buildings/<stil>_kit.py`) wird bei jedem `build.run`
mit neu geladen. Nahaufnahme je Objekt (Profile, Befestigung):
`from kit import preview as P; P.details([obj, …], 'name', direction, mood=…, out_dir=…)`.

Vorschau-Bühne: Stimmung (Blaue Stunde; warmes Horizontglühen nur zur
Sonne hin — ein Rundum-Pfirsichhorizont färbte jede Wand warm), neutral,
und **Grau ohne Textur** (`*_clay.png`) für den Silhouetten-Test.

**Eingebaute Prüfungen:** Abbruch, wenn ein Material-Slot unbenutzt bleibt;
Warnung bei gestreckten Streifen (mit Ort); Dreiecke werden auch für
ausgeblendete Objekte mit Fasen gezählt; Rückseiten werden in der Vorschau
ausgeblendet wie in Unity (verdrehte Flächen sieht man als Loch); konkave
n-Ecke werden vor dem Export trianguliert; Atlas-Bereiche dürfen sich nicht
überlappen; das Manifest wirft Einträge ohne FBX-Datei hinaus
(umbenannte/entfernte Assets).
