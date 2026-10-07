# Stil-Kit (Asset-Sprint, Aufgabe 1)

Regeln für alle selbst gebauten Modelle. Stimmung und Budgets:
[docs/ART-DIRECTION.md](../docs/ART-DIRECTION.md). Code: `ArtSource/kit/`.

**Kurz:** Die Form trägt das Detail (Fasen, Stufen, Rücksprünge, Ziegelreihen
sind Geometrie). Die Textur liefert nur Farbe, leichtes Rauschen und
Abnutzung. Ein Material je Baustil.

## Maßstab und Ausrichtung

- Meter. Ursprung am Boden, in der Mitte der Grundfläche.
- Vorderseite schaut in Blender nach **−Y** (Ansicht „Vorne"). Der FBX-Export
  (`axis_forward='-Z', axis_up='Y'`, Transform angewendet) macht daraus
  **+Z in Unity** — *ungeprüft, bis die Hauptsitzung das erste FBX importiert*.
- **Gebäude-Module:** Raster 4,0 m breit (x −2…2), Geschoss 3,9 m. Außenwand
  liegt auf y = 0, der Wandkörper reicht nach +Y (0,30 m). Muster und
  Ziegelreihen wiederholen sich so, dass Module nahtlos aneinanderpassen.
- Glaubwürdige Maße, vorher nachschlagen. Pilot-Maße: Steinlaterne 1,96 m,
  Getränkeautomat 1,83 × 1,00 × 0,75 m, Kura-Sockel 0,40 m, Namako-Band 1,0 m.

## Fasen und Normalen

- Bevel-Modifier, 1 Segment, nur Kanten über **35°**, harte Normalen
  (`harden_normals`). Runde Teile bleiben dadurch glatt, Kanten fangen Licht.
- Breiten: Stein 12 mm · Blech/Kunststoff 8 mm · Gebäude 15 mm.
- LOD1 ohne Fasen, mit harten Kanten ab 35°.

## Materialien und Atlanten

- Je Baustil **ein** deckendes Material `M_<Stil>_Atlas` + das gemeinsame
  `M_Glass` (durchsichtig). Pilot: `Props` (Straßenmöbel) und `Kura`.
- Atlas 1024², drei Karten passend zu URP/Lit:
  `T_<Stil>_BaseColor` (sRGB) · `T_<Stil>_MaskMap` (R Metall, G AO = 1,
  A Glätte; linear) · `T_<Stil>_Emission` (sRGB).
- Aufbau des Atlas (`kit/atlas.py`, Tabelle `LAYOUTS`):
  - **Streifen** über die volle Breite — wiederholen sich in U (Wände, Stein,
    Holz). V wird über die Teilhöhe gestreckt (Schmutz sitzt unten), außer bei
    Mustern mit fester Größe (Namako: metrisch, 1 m).
  - **Zellen** 64 px — eine Farbe mit Schmutzverlauf (Lack, Kunststoff,
    Eisen, Leuchtflächen).
  - **Rechtecke** — Grafik genau auf eine Fläche (Automaten-Display,
    Bedienfeld).
- Neue Farben/Muster: Eintrag in `LAYOUTS`, nie ein zweites Material.
- **Texel-Dichte:** Streifen 256 px/m. Blickfänge dürfen mehr haben
  (Display ≈ 580 px/m).

## Farbpalette (sRGB)

| Rolle | Farbe | | Rolle | Farbe |
|---|---|---|---|---|
| Granit | `#7b7972` | | Kalkputz weiß | `#e2dccf` |
| Moos | `#4d5a2c` | | Kalkputz schwarz (Koedo) | `#1a1a1c` |
| Holz dunkel | `#3a281c` | | Namako-Fliese / Fuge | `#2f343b` / `#ddd9cf` |
| Dachziegel | `#4d5560` | | Eisen | `#26272a` |
| Automat rot / blau / weiß | `#b3141c` / `#1c4a9c` / `#e6e7e6` | | Zinnober (Torii) | `#c4381c` |
| Licht warm | `#ffb768` | | Papierlicht | `#ffd9a0` |
| Licht kühl (LED) | `#dff3ff` | | Beton | `#9b9993` |

Gedämpfte Grundtöne, kräftige Farben nur als Akzent (Automat, Torii, Licht).

## Abnutzung

- **Schmutz unten:** jede Fläche wird zum Boden hin dunkler (Spritzwasser).
- **Regenspuren:** senkrechte Schlieren auf Putz, Stein, Lack.
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

**Eingebaute Prüfungen:** Abbruch, wenn ein Material-Slot unbenutzt bleibt;
Rückseiten werden in der Vorschau ausgeblendet wie in Unity (verdrehte
Flächen sieht man als Loch).
