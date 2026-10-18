using JapanMap.Vehicles;
using UnityEditor;
using UnityEngine;
using UnityEngine.InputSystem;

namespace JapanMap.Editor.Vehicles
{
    /// <summary>
    /// Creates the headlight assets (D52) and wires them: three additive materials (beam pattern, cone, glow sprite) on
    /// JapanMap/Headlight Glow, Data/Vehicles/Headlights.asset, and its reference in VehicleEffects.asset. Keeps values
    /// already tuned in the settings asset. Batch: node Tools/unity-run.mjs JapanMap.Editor.Vehicles.HeadlightSetup.Apply
    /// </summary>
    public static class HeadlightSetup
    {
        public const string SettingsPath = "Assets/_Project/Data/Vehicles/Headlights.asset";
        public const string EffectsPath = "Assets/_Project/Data/Vehicles/VehicleEffects.asset";
        public const string ActionsPath = "Assets/_Project/Data/Input/Drive.inputactions";
        const string FxDir = "Assets/_Project/Art/Vehicles/FX";

        [MenuItem("JapanMap/Vehicles/Setup Headlights")]
        public static void Apply()
        {
            var shader = Shader.Find("JapanMap/Headlight Glow");
            if (shader == null) throw new System.InvalidOperationException("[Headlights] shader JapanMap/Headlight Glow missing");
            var beam = Material($"{FxDir}/HeadlightBeam.mat", shader, edge: 0f, ground: 1f, cull: 0, tex: null);
            var cone = Material($"{FxDir}/HeadlightCone.mat", shader, edge: 1.2f, ground: 0f, cull: 2, tex: null);
            var glow = Material($"{FxDir}/HeadlightGlow.mat", shader, edge: 0f, ground: 0f, cull: 0,
                tex: AssetDatabase.LoadAssetAtPath<Texture2D>($"{FxDir}/SoftDot.png"));

            var s = AssetDatabase.LoadAssetAtPath<HeadlightSettings>(SettingsPath);
            if (s == null)
            {
                s = ScriptableObject.CreateInstance<HeadlightSettings>();
                AssetDatabase.CreateAsset(s, SettingsPath);
            }
            s.actions = AssetDatabase.LoadAssetAtPath<InputActionAsset>(ActionsPath);
            s.beamMaterial = beam;
            s.coneMaterial = cone;
            s.glowMaterial = glow;
            EditorUtility.SetDirty(s);

            var fx = AssetDatabase.LoadAssetAtPath<VehicleEffectsSettings>(EffectsPath);
            fx.headlights = s;
            EditorUtility.SetDirty(fx);
            AssetDatabase.SaveAssets();
            Debug.Log($"[Library] headlights wired: {SettingsPath}");
        }

        static Material Material(string path, Shader shader, float edge, float ground, int cull, Texture2D tex)
        {
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null)
            {
                m = new Material(shader);
                AssetDatabase.CreateAsset(m, path);
            }
            m.shader = shader;
            m.SetFloat("_Edge", edge);
            m.SetFloat("_Ground", ground);
            m.SetFloat("_Cull", cull);
            if (tex != null) m.SetTexture("_MainTex", tex);
            EditorUtility.SetDirty(m);
            return m;
        }
    }
}
