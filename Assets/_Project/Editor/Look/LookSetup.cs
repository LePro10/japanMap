using System.IO;
using JapanMap.World;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace JapanMap.Editor.Look
{
    /// <summary>
    /// Writes <see cref="LookProfile"/> into Game.unity: sun light, procedural sky, trilight ambient,
    /// fog, a dedicated post-processing profile on "Global Volume", wet road materials and post on the
    /// main camera. Running it twice gives the same scene. Menu: JapanMap/Look/Apply.
    /// </summary>
    public static class LookSetup
    {
        public const string ProfilePath = "Assets/_Project/Data/Look/Look.asset";
        public const string SkyPath = "Assets/_Project/Art/Materials/Sky_BlueHour.mat";
        public const string VolumePath = "Assets/_Project/Data/Look/LookVolume.asset";
        const string MaterialDir = "Assets/_Project/Art/Materials";

        public static LookProfile LoadOrCreate()
        {
            var p = AssetDatabase.LoadAssetAtPath<LookProfile>(ProfilePath);
            if (p != null) return p;
            Directory.CreateDirectory(Path.GetDirectoryName(ProfilePath));
            p = ScriptableObject.CreateInstance<LookProfile>();
            AssetDatabase.CreateAsset(p, ProfilePath);
            return p;
        }

        [MenuItem("JapanMap/Look/Apply")]
        public static void ApplyFromMenu()
        {
            Apply(LoadOrCreate());
            Map.MapScene.Save();
        }

        public static void Apply(LookProfile p)
        {
            Map.MapScene.OpenGameScene();
            ApplyToActiveScene(p);
        }

        /// <summary>Same mood in any open scene (Game, Showroom).</summary>
        public static void ApplyToActiveScene(LookProfile p)
        {
            ApplySun(p);
            ApplySky(p);
            ApplyFog(p);
            ApplyVolume(p);
            ApplyCamera();
            ApplyWet(p);
            AssetDatabase.SaveAssets();
        }

        static void ApplySun(LookProfile p)
        {
            var go = GameObject.Find("Sun") ?? new GameObject("Sun", typeof(Light));
            var sun = go.GetComponent<Light>();
            sun.type = LightType.Directional;
            sun.transform.rotation = p.SunRotation();
            sun.useColorTemperature = false;
            sun.color = p.sunColor;
            sun.intensity = p.sunIntensity;
            sun.shadows = LightShadows.Soft;
            sun.shadowStrength = p.shadowStrength;
            RenderSettings.sun = sun;
        }

        static void ApplySky(LookProfile p)
        {
            var sky = AssetDatabase.LoadAssetAtPath<Material>(SkyPath);
            if (sky == null)
            {
                sky = new Material(Shader.Find("Skybox/Procedural"));
                AssetDatabase.CreateAsset(sky, SkyPath);
            }
            sky.SetFloat("_SunDisk", 2); // high quality
            sky.SetFloat("_SunSize", p.sunSize);
            sky.SetFloat("_SunSizeConvergence", p.sunSizeConvergence);
            sky.SetFloat("_AtmosphereThickness", p.atmosphereThickness);
            sky.SetColor("_SkyTint", p.skyTint);
            sky.SetColor("_GroundColor", p.skyGround);
            sky.SetFloat("_Exposure", p.skyExposure);
            EditorUtility.SetDirty(sky);
            RenderSettings.skybox = sky;

            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = p.ambientSky;
            RenderSettings.ambientEquatorColor = p.ambientEquator;
            RenderSettings.ambientGroundColor = p.ambientGround;
            RenderSettings.defaultReflectionMode = DefaultReflectionMode.Skybox;
            RenderSettings.reflectionIntensity = p.reflectionIntensity;
            DynamicGI.UpdateEnvironment();
        }

        static void ApplyFog(LookProfile p)
        {
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogColor = p.fogColor;
            RenderSettings.fogDensity = p.fogDensity;
        }

        static void ApplyVolume(LookProfile p)
        {
            var profile = AssetDatabase.LoadAssetAtPath<VolumeProfile>(VolumePath);
            if (profile == null)
            {
                profile = ScriptableObject.CreateInstance<VolumeProfile>();
                AssetDatabase.CreateAsset(profile, VolumePath);
            }

            var tone = Get<Tonemapping>(profile);
            tone.mode.Override(TonemappingMode.ACES);

            var ca = Get<ColorAdjustments>(profile);
            ca.postExposure.Override(p.postExposure);
            ca.contrast.Override(p.contrast);
            ca.saturation.Override(p.saturation);

            var wb = Get<WhiteBalance>(profile);
            wb.temperature.Override(p.whiteBalanceTemperature);
            wb.tint.Override(p.whiteBalanceTint);

            var bloom = Get<Bloom>(profile);
            bloom.threshold.Override(p.bloomThreshold);
            bloom.intensity.Override(p.bloomIntensity);
            bloom.scatter.Override(p.bloomScatter);
            bloom.clamp.Override(p.bloomClamp);
            bloom.highQualityFiltering.Override(false);

            var vig = Get<Vignette>(profile);
            vig.intensity.Override(p.vignette);
            vig.smoothness.Override(0.45f);

            var smh = Get<ShadowsMidtonesHighlights>(profile);
            smh.shadows.Override(new Vector4(p.shadowsTint.r, p.shadowsTint.g, p.shadowsTint.b, p.shadowsTint.a));

            EditorUtility.SetDirty(profile);
            foreach (var c in profile.components) EditorUtility.SetDirty(c);

            var go = GameObject.Find("Global Volume") ?? new GameObject("Global Volume", typeof(Volume));
            var vol = go.GetComponent<Volume>();
            vol.isGlobal = true;
            vol.sharedProfile = profile;
        }

        static T Get<T>(VolumeProfile profile) where T : VolumeComponent
        {
            if (profile.TryGet<T>(out var c)) return c;
            c = profile.Add<T>(true);
            c.name = typeof(T).Name;
            AssetDatabase.AddObjectToAsset(c, profile);
            return c;
        }

        static void ApplyCamera()
        {
            var cam = Camera.main;
            if (cam == null) return;
            var data = cam.GetComponent<UniversalAdditionalCameraData>() ?? cam.gameObject.AddComponent<UniversalAdditionalCameraData>();
            data.renderPostProcessing = true;
            data.antialiasing = AntialiasingMode.FastApproximateAntialiasing;
            cam.clearFlags = CameraClearFlags.Skybox;
        }

        /// <summary>After rain: paved surfaces become glossy and mirror the sky (cheap: skybox reflections, no SSR in URP).</summary>
        static void ApplyWet(LookProfile p)
        {
            SetSmoothness("Road_Asphalt", p.wetAsphaltSmoothness);
            SetSmoothness("Road_Concrete", p.wetConcreteSmoothness);
            SetSmoothness("City_Slab", p.wetConcreteSmoothness);
        }

        static void SetSmoothness(string name, float value)
        {
            var mat = AssetDatabase.LoadAssetAtPath<Material>($"{MaterialDir}/{name}.mat");
            if (mat == null) { Debug.LogWarning($"[Look] material {name} missing"); return; }
            mat.SetFloat("_Smoothness", value);
            EditorUtility.SetDirty(mat);
        }
    }
}
