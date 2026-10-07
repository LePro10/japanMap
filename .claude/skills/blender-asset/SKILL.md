---
name: blender-asset
description: Create or change a 3D asset in Blender via Blender MCP and bring it into Unity - modeling rules, export, import settings, checks. Use whenever a model, prop, building module or car part is made or edited.
---

# Asset in Blender bauen und nach Unity bringen

Stil und Budgets: `docs/ART-DIRECTION.md`. Quellen: `ArtSource/`.

## Grundsätze

- **Per Python (`bpy`) bauen**, als Generator-Skript in `ArtSource/<klasse>/`
  speichern — reproduzierbar und für Agenten lesbar. Eine `.blend` nur, wenn
  ein Asset von Hand verfeinert wurde (über Git LFS).
- **Keine kostenpflichtige Generierung** (`generate_3d`) und keine Downloads
  ohne Zustimmung des Menschen. Fremd-Assets nur mit Lizenz-Eintrag.
- Shader-Knoten nach Typ suchen, nicht nach Namen (Blender kann lokalisiert
  sein); Enum-Werte auslesen statt raten.

## Modellieren

- Maßstab Meter, Ursprung am Boden in der Mitte, Vorderseite so, dass sie in
  Unity nach **+Z** zeigt.
- Glaubwürdige Proportionen (Referenzmaße recherchieren: Torii, Laterne,
  Automat 1,83 × 1,0 × 0,8 m usw.), Fasen an sichtbaren Kanten, keine
  unsichtbaren Innenflächen, Normalen nach außen.
- Materialien PBR (Basisfarbe, Rauheit, Metall), wenige Materialien je Asset;
  gemeinsame Atlanten je Baustil bevorzugen.
- Dreiecksbudget einhalten; ab mittlerer Größe LOD1 (≈ 50 %) und ggf. LOD2.
- Collider: einfache Form als eigenes Objekt mit Präfix `COL_` (oder in Unity
  als primitive Collider).

## Prüfen in Blender

`look` mit kleinem Bild (≈ 512 px), mindestens zwei Ansichten. Dreieckszahl
auslesen und gegen Budget halten.

## Export → Unity

- Format **FBX** (oder GLB), nach `Assets/_Project/Art/Models/<klasse>/`.
- Namenskonvention: `SM_<Name>` (Mesh), `M_<Name>` (Material),
  `T_<Name>_<Kanal>` (Textur), Prefab `P_<Name>`.
- Import in Unity: Maßstab prüfen (1 m = 1 Einheit), Materialien auf URP,
  LOD Group, Collider, Prefab anlegen.
- **Bild in Unity** am Einsatzort machen und ansehen — Licht und Nebel ändern
  die Wirkung stark.

## Ändern

Immer die Quelle ändern (Skript/`.blend`) und neu exportieren — nie das
exportierte Modell in Unity „reparieren".
