# Asset-Sprint — Stand

Plan: [docs/PLAN.md](../docs/PLAN.md), Abschnitt „Asset-Sprint". Regeln:
[STYLE-KIT.md](STYLE-KIT.md). Läuft parallel zur Unity-Sitzung, nur in
`ArtSource/` und Blender.

## Wo wir stehen (2026-10-07)

**Aufgabe 1 — Stil-Kit + drei Pilot-Assets: 2. Runde fertig, wartet auf Freigabe.**

Runde 1: Stil-Richtung, Laterne und Automaten gut; nicht freigegeben wegen
(1) Kura zu flach, (2) gestreckte Schlieren, (3) Automat hinten/seitlich
leer, (4) dunkle Laterne wirkt wie Holz, dazu: Dreiecks-Spielraum für Form
nutzen, Silhouette im Grau-Bild prüfen.

| Asset | Dreiecke LOD0 / LOD1 | Ziel | Budget | Varianten |
|---|---|---|---|---|
| Steinlaterne (Kasuga-dōrō) | 1 154 / 528 | — | ≤ 3 000 | — |
| Getränkeautomat | 1 270 / 224 | 1 200–1 800 | ≤ 3 000 | Rot, Blau, Weiß |
| Kura, 2 Felder (ganzes Haus) | 4 035 / 382 | 3 000–4 000 | ≤ 5 000 je Modul | Schwarz (Fenster lit), Weiß |

Bilder:
- Vorher/nachher: `previews/compare/Kura_vorher_nachher.png`,
  `Laterne_vorher_nachher.png`, `Automat_vorher_nachher.png`
- Ohne Textur: `previews/compare/Grau_ohne_Textur.png` (+ `previews/*_clay.png`)
- Übersicht: `previews/StyleKit_Overview.png`

Was sich geändert hat:
1. **Kura** ist jetzt ein ganzes zweistöckiges Haus (6,0 × 4,5 m, First 7,9 m,
   Oni-Hörner 8,3 m): Satteldach 30° mit 1,15 m Traufe, 0,45 m dicker
   Traufkante, 8 Ziegellagen, runden Deckziegelreihen mit Stirnziegeln,
   0,8 m hohem Firststapel mit Rundziegel, Oni-Ziegeln, 0,7 m Giebelüberstand
   mit Ortgangziegeln; dreistufiges Traufgesims, Geschossband, Tropfsims,
   Steinsockel, Namako-Band; Fenster mit vorstehendem Stufenrahmen,
   Eisenstäben und offenen dicken Läden; Wappen im Giebel.
2. **Schlieren:** Ursache gemessen — Streifen wurden senkrecht 1,9- bis
   3,9-fach gestreckt, Farbzellen (64 px) auf 1,8 m gezogen. Jetzt:
   Streifen maßstabsgetreu (128 px/m), Zellen ohne Rauschen, Regenspuren
   dünn und kurz. Der Bau warnt bei jeder Streckung (mit Ort).
3. **Automat:** Seitenwerbung, Lüftungsgitter (Seiten + hinten), Rückwand-
   paneel, Typenschild, Warnaufkleber, Hinweisaufkleber vorne, Kabel mit
   Anschlussdose, Schloss, Scharnierleiste, Trittblech, Stellfüße,
   Kranösen, rundere Kanten.
4. **Laterne:** kühlerer Granit mit sichtbarer Körnung, keine gestreckten
   Streifen. Die braune Wirkung kam von der Vorschau-Bühne (Pfirsich-Horizont
   rundum): Pfostenfarbe gemessen R 0,19 / G 0,17 / B 0,19 → nach Umbau der
   Bühne R 0,12 / G 0,14 / B 0,19 (kühles Grau).

Geprüft: Dreiecke (auch für ausgeblendete Objekte mit Fasen), keine
Streck-Warnung, Grau-Bilder angesehen, alle Vorschaubilder angesehen.
**Ungeprüft:** Aussehen und Ausrichtung in Unity (Import macht Phase 4).

## Als Nächstes

- **Mensch:** Stil freigeben oder Änderungen nennen.
- Danach Aufgabe 2: Requisiten (Strommast + Kabel, Straßenlaterne,
  Leitplanke, …). Offene Kura-Ideen für später: Tür-Variante im Erdgeschoss,
  kleine Fenster-Vordächer, Eckmodul für Ladenzeilen (Koedo).

## Für dich

1. Sieh dir die vier Bilder in `ArtSource/previews/compare/` an.
2. Sag „freigegeben" oder was anders werden soll.

## Für die Hauptsitzung (Import in Phase 4)

- FBX-Achsen: Front = Blender −Y, exportiert mit `axis_forward='-Z'`,
  `axis_up='Y'`, `bake_space_transform` → soll in Unity +Z zeigen, ohne
  −90°-Drehung. Beim ersten Import prüfen und hier eintragen.
- `COL_*`-Meshes → Collider (Renderer aus; Kura hat zwei: Wände + Dach),
  `LIGHT_*`-Empties → Light (`color`, `unity_range`, `unity_intensity` als
  FBX-User-Properties).
- `T_*_MaskMap`: R Metall, G AO, A Glätte = URP/Lit-Mask-Map (linear).
- `M_Glass`: URP/Lit transparent.
- Altes `Kura_Bay`-Wandmodul ist entfernt, ersetzt durch `SM_Kura_2Bay_*`.

## Gefunden / Lektionen (für docs/LESSONS.md, trägt die Hauptsitzung ein)

- `mesh.materials.clear()` **nach** `bm.to_mesh()` setzt alle Material-Indizes
  auf 0 → `mesh_object` bricht ab, wenn ein Material-Slot unbenutzt bleibt.
- Neue BMesh-Flächen haben Normale (0,0,0) bis `normal_update()` →
  `map_faces` aktualisiert selbst.
- `matrix_world` ist direkt nach dem Verschieben veraltet → Vorschau ruft
  `view_layer.update()`.
- Gestreckte Atlas-Streifen sehen aus wie verschmiert → Streifen metrisch,
  Bau meldet jede Streckung mit Ort (fand sofort einen 5-cm-Fall in LOD1).
- Ausgeblendete Objekte wertet der Depsgraph nicht aus → Dreieckszahl ohne
  Fasen (2 577 statt 4 991) → `tri_count` blendet zum Zählen ein.
- Eine BMesh-Ebene nachträglich anlegen macht Python-Verweise auf Flächen
  ungültig → `K.new_bm()` legt alle Ebenen vorab an.
- Bühnenlicht kann Material vortäuschen (Stein wirkte wie Holz) → erst
  Farbe messen, dann Ursache trennen (Material vs. Licht).
