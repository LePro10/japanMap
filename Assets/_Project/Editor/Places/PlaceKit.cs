using System;
using UnityEngine;

namespace JapanMap.Editor.Places
{
    /// <summary>
    /// How one place of the prototype is built from library models: maps the kinds in
    /// SourceData/legacy/places/&lt;place&gt;.json to prefabs (Prefabs/Library, names without "P_").
    /// A kind without a rule is not built and shows up in the import report as a missing model
    /// (for the asset session). Order matters: the first rule whose kind and tag match wins.
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Place Kit")]
    public sealed class PlaceKit : ScriptableObject
    {
        public const string Dir = "Assets/_Project/Data/Places";

        [Serializable]
        public class Rule
        {
            [Tooltip("Kind from the legacy layout (e.g. 'kura', 'stoneLantern').")]
            public string kind;
            [Tooltip("Only items with this tag (empty: any).")]
            public string tag;
            [Tooltip("Library models; one is picked per item, stable by position.")]
            public string[] library = { };
            [Tooltip("Extra yaw (deg) when the model's front is not where the prototype's front was.")]
            public float yaw;
            public float scale = 1;
            [Tooltip("Level the terrain under the model's footprint (buildings). Small props sit on the ground as it is.")]
            public bool level;
            [Tooltip("Vertical offset (m) after placing on the ground.")]
            public float yOffset;
            [Tooltip("Shift (m) in the item's own frame: +z = towards its front. E.g. a building behind its forecourt.")]
            public Vector2 offset;
            [Tooltip("Paint this terrain layer (MapImportSettings.splatLayers name, e.g. 'Sand' for a gravel court) under the footprint; empty = none.")]
            public string paint;
            [Tooltip("With paint: only paint, keep the ground's shape (a court in a bowl).")]
            public bool paintOnly;
            [Tooltip("Tile the item's width with several models side by side (city frontages).")]
            public bool fill;
            [Tooltip("Pick among the models closest to the item's height (h).")]
            public bool matchHeight;
        }

        [Tooltip("File name in SourceData/legacy/places without .json.")]
        public string source;
        [Tooltip("Margin (m) around a levelled footprint where the ground blends back to the natural slope.")]
        public float levelBlend = 4;
        public Rule[] rules = { };
        [Tooltip("Draw the models instanced (InstanceRenderer + PlaceInstanceData) with one box collider per item, instead of a GameObject per model. For thousands of models (Tokyo).")]
        public bool instanced;
        [Tooltip("Instanced: LOD0 → LOD1 distance relative to the library LODGroup threshold (smaller = coarser sooner).")]
        public float lodDistanceScale = 1;
        [Tooltip("Instanced: cull distance relative to the library LODGroup threshold.")]
        public float cullDistanceScale = 1;
        [Tooltip("Instanced: shadows from LOD1 instead of the drawn LOD0.")]
        public bool shadowFromLastLod = true;
        [Tooltip("Instanced: beyond this distance (m, at lodBias 1) a building is a plain box shell (10 triangles) like the prototype's 'Hülle'. 0 = no shell.")]
        public float shellDistance;

        public Rule Find(string kind, string tag)
        {
            foreach (var r in rules)
                if (r.kind == kind && (string.IsNullOrEmpty(r.tag) || r.tag == tag)) return r;
            return null;
        }
    }
}
