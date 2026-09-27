# Car Lab — Fahrzeug-Prototypen (noch nicht im Spiel)

Zehn Autos, prozedural in Blender gebaut, mit Tuning-Optionen und einem
Web-Showroom zum Fahren. **Nichts davon ist in `src/` eingebunden** — der
Ordner hat einen eigenen Vite-Root und berührt das Spiel nicht.

## Starten

```bash
node node_modules/vite/bin/vite.js car-lab --port 5192 --strictPort
```

Dann `http://localhost:5192`. (In `.claude/launch.json` als `car-lab`.
Port 5190 ist auf dieser Maschine von einer fremden App belegt.)

Befehlszeile unten: `fahren`, `drift`, `federung`, `lenken`, `springen`,
`cockpit`, `nacht`, `licht`, `motor` (Röntgen), `felge 2`, `aero 3`,
`motor 3`, `lack 2`, `tiefer`, `sturz`, Autonamen (`supra`, `f1`, `kei`…),
`stop`, `selbst`, `hilfe`. Tastatur: WASD, Leertaste = Handbremse,
C = Kamera, L = Licht, X = Röntgen, R = Reset.

## Die Flotte

| id | Name | Klasse | Vorbild |
|---|---|---|---|
| mame | Mame K | Starter | Kei-Hatch (N-One / Alto Works) |
| hachi | Hachi 86 | Touge Drift | AE86 Trueno (Panda, Klappscheinwerfer) |
| kaze | Kaze 35 Drift | Drift Missile | 350Z Pro-Drift, Sakura-Graffiti |
| rotor | Rotor FD | JDM Legend | RX-7 FD3S (Klappscheinwerfer) |
| raiden | Raiden GT-R34 | JDM Legend | Skyline R34, Streifen + Unterbodenlicht |
| suprema | Suprema RZ | JDM Legend | Supra MK4 |
| kumo | Kumo STi 22 | Rally | Impreza 22B, Goldfelgen, Lichtpod |
| yama | Yama Cruiser 250 | Offroad | Land Cruiser 250 |
| hauler | Mini Hauler | Utility | Kei-Truck |
| hanami | Hanami SF-26 | Formula | F1, Kirschblüten-Lackierung |

Namen sind erfunden, keine Marken oder Logos.

## Knotenhierarchie im GLB (das, was ein Spiel braucht)

```
car_<id>              Wurzel, Boden = y 0, extras.carlab = Datenblatt (JSON)
├─ body_root          gefedert: Hub / Nicken / Wanken
│  ├─ body            alles Statische (ein Mesh, ein Primitive je Material)
│  ├─ steering_wheel  dreht um lokal +Y (zeigt zum Fahrer)
│  ├─ eye             Augpunkt Ich-Perspektive (Rechtslenker, x < 0)
│  ├─ popup_L/R       Klappscheinwerfer, Scharnier = Ursprung, um X
│  ├─ drs_flap_o*     DRS-Klappe (Formel), um X
│  ├─ driver          Fahrer (Formel) — im Cockpitblick ausblenden
│  ├─ aero_o0..2      Tuning-Slot Aero      (extras.tune_slot/opt/label)
│  └─ engine_o0..2    Tuning-Slot Motor     (sitzt im Motorraum)
├─ wheel_FL/FR/RL/RR  ungefedert, Radmitte; Lenkung um Y
│  ├─ caliper_*       lenkt mit, dreht nicht
│  └─ spin_*          dreht um X
│     └─ wheelmesh_*_o0..2   Tuning-Slot Felgen
└─ arm_<Rad>_<n>      nur Formel: Querlenker, Rohr Länge 1 entlang +X;
                      extras.arm_in (Aufbau) / arm_out (relativ zum Rad)
```

Vorwärts = +Z, links = +X (glTF) — dieselbe Konvention wie das Spiel.
Lackvarianten liegen als Texturen daneben (`textures/<id>_paint{0,1,2}.png`)
und werden am Material `<id>_paint` getauscht.

## Tuning je Auto

Je drei Optionen für **Felgen** (11 Felgenstile: six, five, split, mesh,
multi, eight, dish, steel, fan, y5, disc), **Aero**, **Motor** (Stufe
Serie / Street / Race; Motortyp passt zum Auto: Reihen-3/4/6, Wankel, Boxer,
V6, F1-V6) und **Lack**. Fahrwerkshöhe, Sturz und Spur sind im Web Regler,
keine Assets. Definiert in `blender/tuning.py`.

## Neu bauen

In Blender (MCP oder Konsole):

```python
IDS = ['suprema']            # oder alle ids
exec(open(r'...\car-lab\blender\run.py').read())
import export; export.export('suprema')
```

`blender/carkit.py` Karosserie-Loft, Räder, Innenraum · `build.py`
Zusammenbau + Anbauteile · `cars.py` Specs · `tuning.py` Optionen + Motoren
· `formula.py` Formelwagen · `render.py` / `tuneshots.py` Bilder.

## Zahlen (gemessen, Export 2026-09-26)

- Dreiecke je Auto: sichtbar ~60–78k (Formel ~40k), mit allen versteckten
  Tuning-Varianten 113–140k. GLB 1,6–3,5 MB (WebP-Texturen).
- Draw-Calls: Karosserie ~17–21 Primitive (je Material eins), Räder 6–7
  je Rad. Für das Spiel wären LODs und ein Atlas der nächste Schritt.

## Was nicht geprüft / bekannt schwach ist

- **Fahrgefühl** ist im Showroom ein kleines Einspur-Arcade-Modell, nicht
  das Spielmodell aus `src/game/`. Ob es sich gut anfühlt, braucht eine
  Hand an der Tastatur.
- **Drift-Autopilot** hält Winkel von 25–45° bei 45–60 km/h, der Kreis
  weitet sich aber langsam; nach ~40 m Radius setzt er neu an.
- Motoren sind bewusst schlicht (Kästen, Rohre, Turbos) — gut lesbar im
  Röntgenblick, nicht für Nahaufnahmen.
- Karosserie ist ein Querschnitt-Loft: Silhouetten und Lackierungen tragen,
  feine Sicken/Spaltmaße sind aufgemalt, nicht modelliert.
- Die eingebettete Vorschau liefert kein `requestAnimationFrame`; geprüft
  wurde mit `carlab.tick()` / `carlab.shot()` (Bilder in `renders/web/`).
