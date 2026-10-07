# Asset-Sprint — Stand

Plan: [docs/PLAN.md](../docs/PLAN.md), Abschnitt „Asset-Sprint". Regeln:
[STYLE-KIT.md](STYLE-KIT.md). Läuft parallel zur Unity-Sitzung, nur in
`ArtSource/` und Blender.

## Wo wir stehen (2026-10-07)

**Aufgabe 1 — Stil-Kit + drei Pilot-Assets: fertig, wartet auf Freigabe.**
Übersichtsbild: [previews/StyleKit_Overview.png](previews/StyleKit_Overview.png)

| Asset | Dreiecke LOD0 / LOD1 | Budget | Varianten | Vorschau |
|---|---|---|---|---|
| Steinlaterne (Kasuga-dōrō) | 1 146 / 528 | ≤ 3 000 | — | `previews/StoneLantern.png` |
| Getränkeautomat | 428 / 140 | ≤ 3 000 | Rot, Blau, Weiß | `previews/VendingMachine*.png` |
| Kura-Modul, Fenster | 1 080 / 138 | ≤ 5 000 | Schwarz (Licht an), Weiß | `previews/Kura_Bay.png` |
| Kura-Modul, glatt | 648 / 34 | ≤ 5 000 | Schwarz, Weiß | 〃 |

Atlanten (je 1024², drei Karten): `Props`, `Kura` → `exports/textures/`.
Exporte: `exports/props/`, `exports/buildings/` (FBX mit `_LOD0/_LOD1`,
`COL_`, `LIGHT_`). Alles aus `build.run()` reproduzierbar (≈ 7 s für alle).

Geprüft: Dreiecke gezählt; FBX zurückimportiert (enthält LOD0, LOD1,
Collider, Licht-Marker, richtige Materialien); Vorschaubilder angesehen.
**Ungeprüft:** Ausrichtung und Aussehen in Unity (macht die Hauptsitzung in
Phase 4).

## Als Nächstes

- **Mensch:** Stil freigeben oder Änderungen nennen (siehe „Für dich").
- Danach Aufgabe 2: Requisiten in der Reihenfolge aus PLAN.md
  (Strommast + Kabel, Straßenlaterne, Leitplanke, …).

## Für dich

1. Sieh dir `ArtSource/previews/StyleKit_Overview.png` an (größer:
   die Einzelbilder daneben). Fragen dazu:
   - Detailgrad zwischen „POLY Japan" und realistisch getroffen?
   - Kura in Schwarz (wie Kawagoe/Koedo) und Weiß — beide behalten?
   - Automaten-Display und Abnutzung (Schmutz unten, Regenspuren) so ok?
2. Sag „freigegeben" oder was anders werden soll.

## Für die Hauptsitzung (Import in Phase 4)

- FBX-Achsen: Front = Blender −Y, exportiert mit `axis_forward='-Z'`,
  `axis_up='Y'`, `bake_space_transform` → soll in Unity +Z zeigen, ohne
  −90°-Drehung. Beim ersten Import prüfen und hier eintragen.
- `COL_*`-Meshes → Collider (Renderer aus), `LIGHT_*`-Empties → Light
  (Eigenschaften `color`, `unity_range`, `unity_intensity` stehen als
  FBX-User-Properties dran).
- `T_*_MaskMap`: R Metall, G AO, A Glätte = URP/Lit-Mask-Map (linear, kein sRGB).
- `M_Glass`: URP/Lit transparent.

## Gefunden / Lektionen (für docs/LESSONS.md, trägt die Hauptsitzung ein)

- `mesh.materials.clear()` **nach** `bm.to_mesh()` setzt alle Material-Indizes
  auf 0 (Automatenglas wurde undurchsichtig) → Vorkehrung: `mesh_object`
  bricht ab, wenn ein Material-Slot unbenutzt bleibt.
- Neue BMesh-Flächen haben Normale (0,0,0) bis `normal_update()` → UV-Projektion
  lieferte konstantes U (Namako als Streifen) → `map_faces` aktualisiert jetzt
  selbst.
- `matrix_world` ist direkt nach dem Verschieben veraltet → Kamera und Lichter
  der Vorschau lagen falsch → `preview.render` ruft `view_layer.update()`.
- Rückseiten-Culling im Vorschau-Material an, damit verdrehte Flächen wie in
  Unity als Loch auffallen (Blender rendert sonst beide Seiten).
