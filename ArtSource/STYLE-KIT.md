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
  `M_Glass` (durchsichtig). Pilot: `Props` (Straßenmöbel) und `Kura`.
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

Gedämpfte Grundtöne, kräftige Farben nur als Akzent (Automat, Torii, Licht).

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

## LOD, Collider, Namen

- LOD-Stufen baut der **Generator** mit weniger Details (keine Fasen, weniger
  Segmente, kleine Teile weg) — kein Decimate. Ziel LOD1 ≈ 30–50 %.
- Ein Mesh je LOD: `SM_<Name>_LOD0`, `SM_<Name>_LOD1` (Unity baut daraus
  die LOD Group). Collider: `COL_<Name>` (einfache Box). Licht: `LIGHT_<Name>`.
- Varianten (Farbe, Fenster) sind eigene FBX: `SM_<Name>_<Variante>.fbx`.

## Arbeitsablauf

In Blender (über den Blender-MCP):

```python
import sys; sys.path.insert(0, '/Users/leandro/Documents/japanMap/ArtSource')
import importlib, build; importlib.reload(build)
build.run(['stone_lantern'])   # oder build.run() für alle
```

Baut, zählt Dreiecke, exportiert nach `exports/<klasse>/`, schreibt Atlanten
nach `exports/textures/` und Vorschauen nach `previews/`. Ein Asset-Modul
braucht `KLASS`, `NAME`, `build()`; optional `preview()`.

Vorschau-Bühne: Stimmung (Blaue Stunde; warmes Horizontglühen nur zur
Sonne hin — ein Rundum-Pfirsichhorizont färbte jede Wand warm), neutral,
und **Grau ohne Textur** (`*_clay.png`) für den Silhouetten-Test.

**Eingebaute Prüfungen:** Abbruch, wenn ein Material-Slot unbenutzt bleibt;
Warnung bei gestreckten Streifen (mit Ort); Dreiecke werden auch für
ausgeblendete Objekte mit Fasen gezählt; Rückseiten werden in der Vorschau
ausgeblendet wie in Unity (verdrehte Flächen sieht man als Loch); konkave
n-Ecke werden vor dem Export trianguliert; Atlas-Bereiche dürfen sich nicht
überlappen.
