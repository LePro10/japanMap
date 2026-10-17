using JapanMap.Vehicles;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Editor.Vehicles
{
    /// <summary>
    /// Creates the damage settings (D47) and their materials and links them to the fleet: sparks reuse the additive
    /// nitro flame, bits are lit particles with vertex colour, marks a transparent lit material whose texture the game
    /// draws at start. Re-running keeps tuned numbers.
    /// </summary>
    public static class DamageSetup
    {
        public const string SettingsPath = "Assets/_Project/Data/Vehicles/VehicleDamage.asset";
        const string Fx = "Assets/_Project/Art/Vehicles/FX";

        [MenuItem("JapanMap/Vehicles/Setup Damage")]
        public static string Apply()
        {
            var s = AssetDatabase.LoadAssetAtPath<VehicleDamageSettings>(SettingsPath);
            if (s == null)
            {
                s = ScriptableObject.CreateInstance<VehicleDamageSettings>();
                AssetDatabase.CreateAsset(s, SettingsPath);
            }
            s.sparkMaterial = AssetDatabase.LoadAssetAtPath<Material>(Fx + "/Flame.mat");
            s.debrisMaterial = Mat(Fx + "/DamageBits.mat", "Universal Render Pipeline/Particles/Simple Lit", m =>
            {
                m.SetFloat("_Surface", 0f);
                m.SetColor("_BaseColor", Color.white);
                m.SetFloat("_Smoothness", 0.55f);
                m.enableInstancing = true;
            });
            s.decalMaterial = Mat(Fx + "/DamageMarks.mat", "Universal Render Pipeline/Lit", m =>
            {
                // Transparent, alpha-blended, no depth write: a thin sheet on the paint.
                m.SetFloat("_Surface", 1f);
                m.SetFloat("_Blend", 0f);
                m.SetFloat("_SrcBlend", (float)UnityEngine.Rendering.BlendMode.SrcAlpha);
                m.SetFloat("_DstBlend", (float)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
                m.SetFloat("_SrcBlendAlpha", (float)UnityEngine.Rendering.BlendMode.One);
                m.SetFloat("_DstBlendAlpha", (float)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
                m.SetFloat("_ZWrite", 0f);
                m.SetFloat("_Cull", 2f);
                m.SetFloat("_Metallic", 0.75f);
                m.SetFloat("_Smoothness", 0.5f);
                m.SetFloat("_ReceiveShadows", 1f);
                m.SetColor("_BaseColor", Color.white);
                m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
                m.SetOverrideTag("RenderType", "Transparent");
                m.renderQueue = (int)UnityEngine.Rendering.RenderQueue.Transparent;
                m.SetShaderPassEnabled("DepthOnly", false);
                m.SetShaderPassEnabled("ShadowCaster", false);
            });
            EditorUtility.SetDirty(s);
            foreach (var guid in AssetDatabase.FindAssets("t:JapanMap.Vehicles.VehicleFleet", new[] { "Assets/_Project/Data/Vehicles" }))
            {
                var fleet = AssetDatabase.LoadAssetAtPath<VehicleFleet>(AssetDatabase.GUIDToAssetPath(guid));
                fleet.damage = s;
                EditorUtility.SetDirty(fleet);
            }
            AssetDatabase.SaveAssets();
            return $"[Damage] settings {SettingsPath}, sparks {s.sparkMaterial?.name}, bits {s.debrisMaterial?.name}, marks {s.decalMaterial?.name}";
        }

        static Material Mat(string path, string shader, System.Action<Material> setup)
        {
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null)
            {
                m = new Material(Shader.Find(shader)) { name = System.IO.Path.GetFileNameWithoutExtension(path) };
                AssetDatabase.CreateAsset(m, path);
            }
            else if (m.shader == null || m.shader.name != shader) m.shader = Shader.Find(shader);
            setup(m);
            EditorUtility.SetDirty(m);
            return m;
        }
    }
}
