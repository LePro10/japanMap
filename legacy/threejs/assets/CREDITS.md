# Asset-Credits

Alle Assets von [Poly Haven](https://polyhaven.com) stehen unter **CC0**
(Public Domain). Eine Namensnennung ist nicht erforderlich, wird hier aber zur
Nachvollziehbarkeit geführt. Diese Datei wird von `tools/polyhaven.mjs`
automatisch gepflegt — Einträge nicht von Hand entfernen, sondern das Werkzeug
laufen lassen.

Weitere CC0-Quellen im Projekt (siehe [SPEC.md](../SPEC.md) §6): Quaternius,
Poly Pizza und ambientCG. Modelle daraus durchlaufen vor der Aufnahme den
Normalisierungs-Schritt aus `tools/process-assets.mjs` (einheitliche
Skalierung, Projekt-Palette, Draco/meshopt-Komprimierung).

## HDRIs

| Asset | Typ | Autor | Quelle |
|---|---|---|---|
| `rooftop_night` | hdris | Greg Zaal | https://polyhaven.com/a/rooftop_night |
| `industrial_sunset_02_puresky` | hdris | Jarod Guest, Sergej Majboroda | https://polyhaven.com/a/industrial_sunset_02_puresky |
| `evening_road_01_puresky` | hdris | Jarod Guest, Sergej Majboroda | https://polyhaven.com/a/evening_road_01_puresky |

Verwendung im Projekt: `industrial_sunset_02_puresky` (4k) als sichtbarer
Himmel (`scene.background`), `rooftop_night` (2k) als IBL
(`scene.environment`), `evening_road_01_puresky` (2k) als alternative Skybox.
Halbierte Varianten für den Startdownload erzeugt `tools/optimize-hdri.mjs`
nach `assets/generated/hdri/`.

## Texturen

Jeweils als `Diffuse` + `nor_gl` + `arm` geladen (`nor_gl` ist die
OpenGL-Normalmap für WebGL; `arm` packt AO/Roughness/Metalness in einen
Sampler statt drei).

| Asset | Typ | Autor | Quelle |
|---|---|---|---|
| `asphalt_02` | textures | Rob Tuytel | https://polyhaven.com/a/asphalt_02 |
| `rock_face_03` | textures | Dario Barresi, Rico Cilliers | https://polyhaven.com/a/rock_face_03 |
| `aerial_grass_rock` | textures | Rob Tuytel | https://polyhaven.com/a/aerial_grass_rock |
| `coast_sand_01` | textures | Rob Tuytel | https://polyhaven.com/a/coast_sand_01 |
| `brown_mud_02` | textures | Rob Tuytel | https://polyhaven.com/a/brown_mud_02 |

## Modelle

| Asset | Typ | Autor | Quelle |
|---|---|---|---|
| `boulder_01` | models | Rico Cilliers | https://polyhaven.com/a/boulder_01 |
| `coastal_cliff_04` | models | Rob Tuytel, Rico Cilliers | https://polyhaven.com/a/coastal_cliff_04 |
| `rock_moss_set_02` | models | Kless Gyzen | https://polyhaven.com/a/rock_moss_set_02 |
| `modular_wooden_pier` | models | Rico Cilliers | https://polyhaven.com/a/modular_wooden_pier |

> **Bekannt, gemessen, bewusst offen (P25):** `modular_wooden_pier.glb` enthält
> 3 Meshes (86 / 2061 / 835 Dreiecke); instanziert wird nur das erste, also
> **2,9 %** des Modells. Der Steg am Hafen ist damit fast vollständig
> unsichtbar. Die Meldung dazu steht bei jedem Laden in der Konsole. Nicht
> repariert, weil es genau ein Exemplar auf der ganzen Karte gibt — aber
> gemessen statt übersehen.
