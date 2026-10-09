using System.Collections.Generic;
using JapanMap.Editor.Map;
using JapanMap.Editor.Places;
using JapanMap.Editor.Vehicles;
using JapanMap.Gameplay.Stunts;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Editor.Content
{
    /// <summary>
    /// Builds World/Ramps from Data/Gameplay/Ramps.asset: each ramp one rigid body on a straight base
    /// line fitted to the terrain (a foundation, not a terrain overlay), side walls reaching below the
    /// lowest ground under them, a landing pad and white chevrons visible from the lip. Meshes go to
    /// Art/Generated/Ramps via MeshAssets.Save (never CopySerialized, see unity-verify).
    /// </summary>
    public static class RampBuilder
    {
        public const string Path = ContentSetup.Dir + "/Ramps.asset";
        const string MeshDir = "Assets/_Project/Art/Generated/Ramps";
        const float MaxBaseSlope = 0.05f;
        const float FoundationDepth = 0.6f;

        [MenuItem("JapanMap/Content/Build Ramps")]
        public static string Build()
        {
            var set = LoadOrCreate();
            MapScene.OpenGameScene();
            var group = MapScene.FreshGroup("Ramps");
            var top = AssetDatabase.LoadAssetAtPath<Material>("Assets/_Project/Art/Materials/Road_Concrete.mat");
            var side = AssetDatabase.LoadAssetAtPath<Material>("Assets/_Project/Art/Materials/Placeholder_Concrete.mat");
            var pad = AssetDatabase.LoadAssetAtPath<Material>("Assets/_Project/Art/Materials/Road_Gravel.mat");
            var chevron = PlayerSetup.StandInMaterial("Chevron", new Color(0.92f, 0.92f, 0.88f));
            if (!AssetDatabase.IsValidFolder("Assets/_Project/Art/Generated")) AssetDatabase.CreateFolder("Assets/_Project/Art", "Generated");
            if (!AssetDatabase.IsValidFolder(MeshDir)) AssetDatabase.CreateFolder("Assets/_Project/Art/Generated", "Ramps");

            for (var i = 0; i < set.ramps.Length; i++)
            {
                ref var r = ref set.ramps[i];
                FitBase(ref r);
                var root = new GameObject($"Ramp_{r.id}");
                root.transform.SetParent(group, false);
                // Meshes are built relative to the kicker foot on the base line.
                root.transform.position = At(r, 0f, 0f) + Vector3.up * r.baseY;
                var body = Part(root.transform, "Body", MeshAssets.Save($"{MeshDir}/Ramp_{r.id}.asset", BodyMesh(r)), new[] { top, side }, true);
                var landing = Part(root.transform, "Landing", MeshAssets.Save($"{MeshDir}/Ramp_{r.id}_Landing.asset", PadMesh(r)), new[] { pad, side }, true);
                Part(root.transform, "Chevrons", MeshAssets.Save($"{MeshDir}/Ramp_{r.id}_Chevrons.asset", ChevronMesh(r)), new[] { chevron }, false);
                body.isStatic = landing.isStatic = true;
            }
            EditorUtility.SetDirty(set);
            AssetDatabase.SaveAssets();
            MapScene.Save();
            var msg = $"[Ramps] built {set.ramps.Length}";
            Debug.Log(msg);
            return msg;
        }

        static GameObject Part(Transform parent, string name, Mesh mesh, Material[] mats, bool collide)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterials = mats;
            if (collide) go.AddComponent<MeshCollider>().sharedMesh = mesh;
            else mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            GameObjectUtility.SetStaticEditorFlags(go, (StaticEditorFlags)~0 & ~StaticEditorFlags.ContributeGI);
            return go;
        }

        static Vector3 At(RampSet.Ramp r, float s, float w)
        {
            var f = r.Forward;
            var right = new Vector3(f.z, 0f, -f.x);
            return new Vector3(r.start.x, 0f, r.start.y) + f * s + right * w;
        }

        static float Base(RampSet.Ramp r, float s) => r.baseY + r.baseSlope * s;

        /// <summary>Base line through the terrain at the start, slope by least squares along the centre (clamped).</summary>
        static void FitBase(ref RampSet.Ramp r)
        {
            r.baseY = PlaceImporter.Ground(At(r, 0f, 0f));
            double num = 0, den = 0;
            for (var s = 2f; s <= r.Length; s += 2f)
            {
                var dy = PlaceImporter.Ground(At(r, s, 0f)) - r.baseY;
                num += s * dy;
                den += s * s;
            }
            r.baseSlope = Mathf.Clamp(den > 0 ? (float)(num / den) : 0f, -MaxBaseSlope, MaxBaseSlope);
        }

        /// <summary>Height of the driving surface above the base line at s (kicker, table, down-slope).</summary>
        public static float Profile(RampSet.Ramp r, float s)
        {
            if (s <= r.riseLength)
            {
                var t = Mathf.Clamp01(s / r.riseLength);
                return r.height * (0.5f * t + 0.5f * t * t); // launch angle ≈ atan(1.5 h / L)
            }
            s -= r.riseLength;
            if (s <= r.tableLength) return r.height;
            s -= r.tableLength;
            if (r.downLength <= 0f) return r.height;
            var u = Mathf.Clamp01(s / r.downLength);
            return r.height * (1f - u * u * (3f - 2f * u));
        }

        /// <summary>Lowest ground across the width at s, minus the foundation depth.</summary>
        static float Bottom(RampSet.Ramp r, float s, float halfWidth)
        {
            var low = float.PositiveInfinity;
            for (var w = -halfWidth; w <= halfWidth + 0.01f; w += halfWidth * 0.5f) low = Mathf.Min(low, PlaceImporter.Ground(At(r, s, w)));
            return Mathf.Min(low, Base(r, s)) - FoundationDepth;
        }

        /// <summary>Kicker (+ table + down-slope): top surface (sub-mesh 0) and walls to the foundation (sub-mesh 1).</summary>
        static Mesh BodyMesh(RampSet.Ramp r)
        {
            var end = r.riseLength + r.tableLength + r.downLength;
            var hw = r.width * 0.5f;
            var ss = new List<float>();
            for (var s = 0f; s < end; s += 1f) ss.Add(s);
            ss.Add(end);
            var v = new List<Vector3>();
            var topTris = new List<int>();
            var sideTris = new List<int>();
            var origin = At(r, 0f, 0f);
            Vector3 L(float s, float w, float y) { var p = At(r, s, w) - origin; p.y = y - r.baseY; return p; }

            for (var i = 0; i < ss.Count - 1; i++)
            {
                float s0 = ss[i], s1 = ss[i + 1];
                float y0 = Base(r, s0) + Profile(r, s0), y1 = Base(r, s1) + Profile(r, s1);
                float b0 = Bottom(r, s0, hw), b1 = Bottom(r, s1, hw);
                Quad(v, topTris, L(s0, -hw, y0), L(s1, -hw, y1), L(s1, hw, y1), L(s0, hw, y0));
                Quad(v, sideTris, L(s0, hw, b0), L(s0, hw, y0), L(s1, hw, y1), L(s1, hw, b1));
                Quad(v, sideTris, L(s1, -hw, b1), L(s1, -hw, y1), L(s0, -hw, y0), L(s0, -hw, b0));
            }
            // Front face (usually a sliver: the kicker starts at the ground) and back face down to the foundation.
            var yb = Base(r, 0f);
            var bb = Bottom(r, 0f, hw);
            Quad(v, sideTris, L(0f, -hw, bb), L(0f, -hw, yb), L(0f, hw, yb), L(0f, hw, bb));
            var ye = Base(r, end) + Profile(r, end);
            var be = Bottom(r, end, hw);
            Quad(v, sideTris, L(end, hw, be), L(end, hw, ye), L(end, -hw, ye), L(end, -hw, be));
            return Finish($"Ramp_{r.id}", v, topTris, sideTris);
        }

        /// <summary>Flat landing pad on the base line, 5 cm proud, walls to the foundation.</summary>
        static Mesh PadMesh(RampSet.Ramp r)
        {
            var s0 = r.riseLength + r.tableLength + r.downLength;
            var s1 = s0 + r.landingLength;
            var hw = r.landingWidth * 0.5f;
            var origin = At(r, 0f, 0f);
            Vector3 L(float s, float w, float y) { var p = At(r, s, w) - origin; p.y = y - r.baseY; return p; }
            var v = new List<Vector3>();
            var topTris = new List<int>();
            var sideTris = new List<int>();
            for (var s = s0; s < s1 - 0.01f; s += 2f)
            {
                var e = Mathf.Min(s + 2f, s1);
                float y0 = Base(r, s) + 0.05f, y1 = Base(r, e) + 0.05f;
                float b0 = Bottom(r, s, hw), b1 = Bottom(r, e, hw);
                Quad(v, topTris, L(s, -hw, y0), L(e, -hw, y1), L(e, hw, y1), L(s, hw, y0));
                Quad(v, sideTris, L(s, hw, b0), L(s, hw, y0), L(e, hw, y1), L(e, hw, b1));
                Quad(v, sideTris, L(e, -hw, b1), L(e, -hw, y1), L(s, -hw, y0), L(s, -hw, b0));
            }
            var ye = Base(r, s1) + 0.05f;
            var be = Bottom(r, s1, hw);
            Quad(v, sideTris, L(s1, hw, be), L(s1, hw, ye), L(s1, -hw, ye), L(s1, -hw, be));
            return Finish($"Ramp_{r.id}_Landing", v, topTris, sideTris);
        }

        /// <summary>Three white chevrons on the pad, pointing along the jump — the landing target seen from the lip.</summary>
        static Mesh ChevronMesh(RampSet.Ramp r)
        {
            var s0 = r.riseLength + r.tableLength + r.downLength;
            var origin = At(r, 0f, 0f);
            Vector3 L(float s, float w) { var p = At(r, s, w) - origin; p.y = Base(r, s) + 0.08f - r.baseY; return p; }
            var v = new List<Vector3>();
            var tris = new List<int>();
            var arm = Mathf.Min(3f, r.landingWidth * 0.3f);
            for (var k = 0; k < 3; k++)
            {
                var s = s0 + r.landingLength * (0.3f + 0.2f * k);
                // Two bars meeting at the tip (s + arm), each 0.6 m wide.
                Quad(v, tris, L(s, -arm), L(s + arm, 0f), L(s + arm - 0.6f, 0f), L(s - 0.6f, -arm));
                Quad(v, tris, L(s + arm - 0.6f, 0f), L(s + arm, 0f), L(s, arm), L(s - 0.6f, arm));
            }
            return Finish($"Ramp_{r.id}_Chevrons", v, tris, null);
        }

        static void Quad(List<Vector3> v, List<int> t, Vector3 a, Vector3 b, Vector3 c, Vector3 d)
        {
            var i = v.Count;
            v.Add(a); v.Add(b); v.Add(c); v.Add(d);
            t.Add(i); t.Add(i + 1); t.Add(i + 2);
            t.Add(i); t.Add(i + 2); t.Add(i + 3);
        }

        static Mesh Finish(string name, List<Vector3> v, List<int> top, List<int> sides)
        {
            var m = new Mesh { name = name };
            m.SetVertices(v);
            m.subMeshCount = sides == null ? 1 : 2;
            m.SetTriangles(top, 0);
            if (sides != null) m.SetTriangles(sides, 1);
            // Planar UVs in metres (the road materials tile per metre).
            var uv = new Vector2[v.Count];
            for (var i = 0; i < v.Count; i++) uv[i] = new Vector2(v[i].x + v[i].y * 0.3f, v[i].z + v[i].y * 0.3f) * 0.25f;
            m.uv = uv;
            m.RecalculateNormals();
            m.RecalculateBounds();
            return m;
        }

        /// <summary>
        /// The six ramps of ASTRA §4, moved by a site search (flat within 3.5 m, no road, paddy or building
        /// in the footprint and a 40 m run-up, a road within 45 m of the run-up) — the anchors of the
        /// design were on the ring road, in paddies or on slopes. Created once; the asset owns the values.
        /// </summary>
        public static RampSet LoadOrCreate()
        {
            var set = AssetDatabase.LoadAssetAtPath<RampSet>(Path);
            if (set != null) return set;
            set = ScriptableObject.CreateInstance<RampSet>();
            set.ramps = new[]
            {
                new RampSet.Ramp { id = "petal-hop", title = "Petal Hop", start = new Vector2(685f, -607f), yaw = 180f, width = 10f, height = 1f,
                    riseLength = 14f, landingLength = 30f, landingWidth = 14f, speedHint = "55–75 km/h",
                    note = "ASTRA: S + (95, 45) launching south; that spot is the ring road. Moved 69 m south-east, still south." },
                new RampSet.Ramp { id = "breakyard-table", title = "Breakyard Table", start = new Vector2(-1110f, -650f), yaw = 135f, width = 12f, height = 2.2f,
                    riseLength = 18f, tableLength = 16f, downLength = 18f, landingLength = 20f, landingWidth = 16f, speedHint = "70–95 km/h",
                    note = "ASTRA (−1030, 580) launching east; paddies there. Moved 106 m, launching south-east." },
                new RampSet.Ramp { id = "needle-service-bank", title = "Needle Service Bank", start = new Vector2(-792f, -614f), yaw = -90f, width = 12f, height = 3f,
                    riseLength = 24f, landingLength = 30f, landingWidth = 18f, speedHint = "90–120 km/h",
                    note = "ASTRA (−800, 590) launching west; moved 25 m off the pit entry road." },
                new RampSet.Ramp { id = "terrace-roller", title = "Terrace Roller", start = new Vector2(-740f, -550f), yaw = 90f, width = 9f, height = 1.4f,
                    riseLength = 16f, landingLength = 22f, landingWidth = 13f, speedHint = "60–85 km/h",
                    note = "ASTRA (−680, 380) eastbound off Terrace Track (never built); paddies there. Moved 180 m to the dry field east of the circuit." },
                new RampSet.Ramp { id = "market-loading-bank", title = "Market Loading Bank", start = new Vector2(326f, -574f), yaw = 0f, width = 10f, height = 1.8f,
                    riseLength = 16f, landingLength = 24f, landingWidth = 14f, speedHint = "65–90 km/h",
                    note = "ASTRA (390, 590) northbound; slope there. Moved 66 m west, still northbound." },
                new RampSet.Ramp { id = "harbour-slip", title = "Harbour Slip", start = new Vector2(700f, -896f), yaw = 135f, width = 8f, height = 0.9f,
                    riseLength = 12f, landingLength = 30f, landingWidth = 18f, speedHint = "45–65 km/h",
                    note = "ASTRA (700, 920) south-east toward a 30 × 18 m pad; moved 24 m inland." },
            };
            AssetDatabase.CreateAsset(set, Path);
            return set;
        }
    }
}
