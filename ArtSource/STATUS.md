# Asset-Sprint — Stand

Plan: [docs/PLAN.md](../docs/PLAN.md), Abschnitt „Asset-Sprint". Regeln:
[STYLE-KIT.md](STYLE-KIT.md). Läuft parallel zur Unity-Sitzung, nur in
`ArtSource/` und Blender.

## Wo wir stehen (2026-10-07)

**Aufgabe 1 — Stil-Kit + drei Pilot-Assets: freigegeben** (2. Runde; Kura
35 Dreiecke über Ziel ist ok, Entscheid Eigentümer).

**Aufgabe 2 — Requisiten: erste 10 Gruppen fertig → STOPP für den Lichttest
in Unity.** Übersicht: [previews/Props_Overview_1.png](previews/Props_Overview_1.png)

| # | Gruppe | Varianten (FBX in `exports/props/`) | Dreiecke LOD0 / LOD1 |
|---|---|---|---|
| 1 | Strommast + Kabel | UtilityPole_Transformer / _Plain / _Guy; PowerLine_Span20/30/40 | 2 336 / 536 · 1 618 · 1 732; Spannfeld 748 |
| 2 | Straßenlaterne | StreetLight_Road / _Road2 / _Shotengai | 434 · 598 · 884 |
| 3 | Leitplanke | Barrier_GuardRail_4m / _GuardRail_End / _GuardPipe_2m | 428 · 356 · 500 |
| 4 | Verkehrsschilder | RoadSign_Stop / _Speed40 / _NoParking / _Crosswalk / _Curve / _OneWay_Speed40 | 302–682 |
| 5 | Ampel | TrafficLight_Arm / _Ped (+ schaltbare LENS_-Meshes) | 944 · 428 |
| 6 | Zäune | Fence_BlockWall_2m / _BlockWall_Pillar / _Bamboo_1_8m / _Board_1_8m | 254 · 74 · 940 · 540 |
| 7 | Automaten-Varianten | VendingMachineSlim_Red/Blue/White, RecycleBins | 1 270 · 256 |
| 8 | Torii | Torii_Vermilion_M / _Vermilion_S / _Stone_M | 1 484 |
| 9 | Steinlaternen | StoneLantern (Kasuga, Pilot) / _Yukimi / _Oki | 1 154 · 1 078 · 442 |
| 10 | Bänke | Bench_Park / _Teahouse (mit Schirm) / _Stone | 760 · 874 · 76 |

Alle im Budget (kleine Props ≤ 3 000, mittlere ≤ 8 000). Jede Gruppe hat
Vorschaubilder (Stimmung, neutral, Grau ohne Textur) in `previews/`.
Neuer Atlas `Street` (1024²); `Props` erweitert. `exports/manifest.json`
listet für jede der 42 FBX-Dateien LODs, Dreiecke, Material, Collider,
Lichter, schaltbare Teile und Kabelpunkte.

Geprüft: alles aus `build.run()` in einem Lauf gebaut (0 Fehler, keine
Streck-Warnung), Dreiecke gezählt, alle Vorschaubilder angesehen.
**Ungeprüft:** Aussehen, Ausrichtung und Maßstab in Unity — dafür der
Lichttest unten.

## Für die Unity-Sitzung: Lichttest (vor der Masse)

Ziel: einmal unter dem echten Licht (Blaue Stunde, Nebel, Nässe) sehen, ob
Stil, Helligkeit der Emission und Maßstab passen. Vorschlag:
1. Texturen `exports/textures/T_{Props,Street,Kura}_{BaseColor,MaskMap,Emission}.png`
   importieren (MaskMap: **linear**, kein sRGB), je Atlas ein URP/Lit-Material
   mit Base Map, Mask Map, Emission (Intensität gegen einen gemessenen
   Bezugspunkt einstellen, ART-DIRECTION.md). `M_Glass`: URP/Lit transparent.
2. Diese FBX an einen Blickpunkt stellen: UtilityPole_Transformer +
   PowerLine_Span30 + UtilityPole_Plain (30 m auseinander), StreetLight_Road,
   RoadSign_Stop, TrafficLight_Arm, VendingMachine_Red + RecycleBins,
   Torii_Vermilion_M, StoneLantern, Fence_Bamboo_1_8m, Kura_2Bay_Black.
3. Prüfen und hier eintragen: zeigt die Vorderseite nach +Z (Schildfläche,
   Automatenfront)? Maßstab 1 m = 1 Einheit (Automat 1,83 m hoch)?
   Werden `_LOD0/_LOD1` zur LOD Group? Wirken Emission (Display, Laternen,
   Ampel) und Farben im Nebel richtig?
4. Bild vom Blickpunkt an den Menschen; Rückmeldung hier unter „Gefunden".

Konventionen beim Import: `COL_*` → Collider (Renderer aus), `LIGHT_*` →
Light (`color`, `unity_range`), `LENS_*` → eigener Renderer zum Schalten,
`CABLE_*` → Anschlusspunkte für Kabel (Spannfelder zwischen zwei Masten
können auch zur Laufzeit gebaut werden), Leitplanken-Module sind zum Biegen
entlang Splines geteilt, linkes Ende = gespiegeltes rechtes.

## Als Nächstes

- **Mensch:** Übersicht ansehen; Lichttest in der Unity-Sitzung anstoßen.
- Danach (nach Rückmeldung) Rest von Aufgabe 2: Bushaltestelle, Mülltonnen,
  Fahrradständer, Blumenkübel, Felsen; dann Aufgabe 3 (Gebäude-Bausätze).

## Für dich

1. Sieh dir `ArtSource/previews/Props_Overview_1.png` an (Einzelbilder je
   Gruppe daneben in `previews/`).
2. Sag der Unity-Sitzung: „Lichttest nach ArtSource/STATUS.md".
3. Sag mir Bescheid, wenn der Test gelaufen ist (oder was dir auffällt).

## Gefunden / Lektionen (für docs/LESSONS.md, trägt die Hauptsitzung ein)

- `mesh.materials.clear()` **nach** `bm.to_mesh()` setzt alle Material-Indizes
  auf 0 → `mesh_object` bricht ab, wenn ein Material-Slot unbenutzt bleibt.
- Neue BMesh-Flächen haben Normale (0,0,0) bis `normal_update()` →
  `map_faces` aktualisiert selbst.
- `matrix_world` ist direkt nach dem Verschieben veraltet → Vorschau ruft
  `view_layer.update()`.
- Gestreckte Atlas-Streifen sehen verschmiert aus → Streifen metrisch, der
  Bau meldet jede Streckung mit Ort (fand seitdem 8 Fälle: LOD1-Putz,
  Ausleger, Wartungsklappe, Bretter, Bambus, Bankplatte, Laternendach).
- Ausgeblendete Objekte wertet der Depsgraph nicht aus → `tri_count`
  blendet zum Zählen ein.
- Eine BMesh-Ebene nachträglich anlegen macht Flächen-Verweise ungültig →
  `K.new_bm()` legt alle Ebenen vorab an.
- Bühnenlicht kann Material vortäuschen (Stein wirkte wie Holz) → erst
  Farbe messen, dann Ursache trennen.
- Zylinder-Abwicklung: eine Fläche über der Naht reichte aus dem Atlasfeld
  (bunter Streifen am Mast) → Naht auf eine Kante legen, Winkel relativ zur
  Flächenmitte abwickeln.
- Einzelne Flächen (Ampellinse) wurden beim Normalen-Neuausrichten umgedreht
  und vom Rückseiten-Culling versteckt → Einzelflächen behalten ihre
  gebaute Richtung (zentral im Kit).
- Vorschau-Rahmung über eine Kugel ließ hohe, schlanke Objekte winzig →
  Rahmung über die Ecken des Begrenzungsquaders.
