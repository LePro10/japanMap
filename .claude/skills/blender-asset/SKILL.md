---
name: blender-asset
description: Create or change a 3D asset in Blender via Blender MCP and bring it into Unity - modeling rules, export, import settings, checks. Use whenever a model, prop, building module or car part is made or edited.
---

# Asset in Blender bauen und nach Unity bringen

**Verbindlich, zuerst lesen:** `ArtSource/STYLE-KIT.md` (Bauweise, Atlas,
Fasen, Palette, Abnutzung, Arbeitsablauf mit `build.py`) und
`docs/ART-DIRECTION.md` (Stimmung, Budgets). Quellen: `ArtSource/`.

## Die Qualitäts-Schleife (vom Menschen freigegeben 2026-10-07)

So wurde das Stil-Kit abgenommen — jedes Asset läuft genauso:

1. **Maße nachschlagen**, dann bauen. Die **Form trägt das Detail**
   (Dach, Rahmen, Rücksprünge sind Geometrie, nicht aufgemalt).
2. **Grau-Test:** Bild ohne Textur (`*_clay.png`). Erkennt man das Objekt
   nicht an seiner Silhouette, ist es zu flach — zurück zu 1.
3. **Budget nutzen, nicht nur einhalten:** Zielbereich 40–80 % des Budgets
   für LOD0 (ART-DIRECTION.md). Darunter fehlt fast immer Form; darüber
   erst messen, was kostet (z. B. Fasen-Segmente), dann gezielt kürzen.
4. **Alle Seiten ansehen:** vorne, hinten, seitlich. Eine leere Rückseite
   ist ein Fehler, wenn man sie im Spiel sehen kann.
5. **Ursache messen statt raten** (Streckung, Farbwerte, Dreiecke je Teil).
   Wirkt ein Asset falsch, erst prüfen, ob es an der Vorschau-Bühne liegt.
6. **Vorher/nachher** vom selben Blickwinkel nebeneinander, wenn nachgebessert wird.
7. **Stopp-Punkte:** neuer Stil oder neuer Baustil → Pilot + Freigabe des
   Menschen. In der Masse nach etwa 10 Assets eine Übersicht und ein Test
   unter echtem Licht in Unity, bevor es weitergeht.

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

- Format **FBX**, zuerst nach `ArtSource/exports/<klasse>/` (macht `build.py`);
  der Import nach `Assets/_Project/Art/Models/<klasse>/` ist ein eigener
  Schritt in Unity (nur eine Sitzung zur Zeit in Unity).
- Namenskonvention: `SM_<Name>` (Mesh), `M_<Name>` (Material),
  `T_<Name>_<Kanal>` (Textur), Prefab `P_<Name>`.
- Import in Unity: Maßstab prüfen (1 m = 1 Einheit), Materialien auf URP,
  LOD Group, Collider, Prefab anlegen.
- **Bild in Unity** am Einsatzort machen und ansehen — Licht und Nebel ändern
  die Wirkung stark.

## Ändern

Immer die Quelle ändern (Skript/`.blend`) und neu exportieren — nie das
exportierte Modell in Unity „reparieren".
