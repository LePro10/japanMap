# Fremd-Assets und Lizenzen

Alles unter `Assets/ThirdParty/` bleibt inhaltlich unverändert (Anpassungen
nur über Import-Einstellungen oder Kopien unter `Assets/_Project/`). Ausnahme CrazySDK (D31):
eigene `CrazyGames.SDK.asmdef` (das Paket hat keine) und `whitelistedDomains` 127.0.0.1 + local in
`Resources/CrazyGamesSettings.asset` — ein Neuimport setzt beides zurück.

| Ordner | Asset | Urheber | Lizenz | Quelle |
|---|---|---|---|---|
| `CrazySDK` | CrazyGames Unity SDK 5.33.0, nur Laufzeitteil (ohne Demo, ohne Editor-Bauwerkzeug) | CrazyGames | Nutzung für Spiele auf CrazyGames (SDK-Bedingungen) | https://sdk.crazygames.com/UnityCrazySDK.unitypackage |
| `PolyHaven/Textures/aerial_grass_rock` | Textur 1k | Rob Tuytel | CC0 | https://polyhaven.com/a/aerial_grass_rock |
| `PolyHaven/Textures/asphalt_02` | Textur 2k | Rob Tuytel | CC0 | https://polyhaven.com/a/asphalt_02 |
| `PolyHaven/Textures/brown_mud_02` | Textur 1k | Rob Tuytel | CC0 | https://polyhaven.com/a/brown_mud_02 |
| `PolyHaven/Textures/coast_sand_01` | Textur 1k | Rob Tuytel | CC0 | https://polyhaven.com/a/coast_sand_01 |
| `PolyHaven/Textures/rock_face_03` | Textur 1k | Dario Barresi, Rico Cilliers | CC0 | https://polyhaven.com/a/rock_face_03 |

Übernommen aus dem Prototyp (`legacy/threejs/assets/textures/`, dort `CREDITS.md`).
Dateinamen: `<asset>_diff` (Farbe), `<asset>_nor_gl` (Normalen, OpenGL = Unity-Konvention),
`<asset>_arm` (AO / Roughness / Metallic).
