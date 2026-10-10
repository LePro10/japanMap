using System;
using JapanMap.Vehicles;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Editor.Vehicles
{
    /// <summary>
    /// Seeds the ten VehicleDefinition assets from the legacy game fleet (vehicles.config.ts identity
    /// table + arcade.config.ts ARCADE table) and the ArcadeTuning asset. The assets are the truth
    /// afterwards; run this again only to reset a car to its prototype numbers.
    /// Pairing car-lab model → legacy driving numbers: docs/DECISIONS.md D16.
    /// </summary>
    public static class FleetSeed
    {
        public const string Dir = "Assets/_Project/Data/Vehicles";
        public const string TuningPath = Dir + "/ArcadeTuning.asset";
        public const string FleetPath = Dir + "/Fleet.asset";

        const float Deg = Mathf.PI / 180f;

        // id, name, legacy id, category, mass kg, power kW, top km/h, launch N,
        // length, width, height, wheelbase, radius, cg, front, travel, clearance, ford, dirt, arcade patch
        static readonly Row[] Rows =
        {
            new("mame", "Mame K", "pip", VehicleCategory.Street, 820, 70, 160, 2578, 3.18f, 1.66f, 1.6f, 2.12f, .275f, .53f, .61f, .23f, .16f, .2f, .7f,
                a => { a.latG = .90f; a.brakeG = .961f; a.latGrip = 10; a.yawResponse = 14; a.steerAngle = 39 * Deg; a.steerRate = 6.7f; a.driftAngle = .40f; a.driftYawGain = 2.4f; a.powerOversteer = .08f; a.liftOversteer = .08f; a.driftFall = 5; a.catchAssist = 5; }),
            new("hachi", "Hachi 86", "touge", VehicleCategory.Street, 1180, 135, 205, 5062, 4.12f, 1.92f, 1.36f, 2.43f, .31f, .5f, .52f, .22f, .16f, .2f, .7f,
                a => { a.latG = .95f; a.brakeG = 1.0036f; a.steerAngle = 35 * Deg; }),
            new("hauler", "Mini Hauler", "truck", VehicleCategory.Utility, 1080, 78, 150, 3051, 3.58f, 1.76f, 1.77f, 2.24f, .29f, .62f, .57f, .32f, .24f, .3f, .75f,
                a => { a.latG = .78f; a.brakeG = .8047f; a.latGrip = 6; a.yawResponse = 5.5f; a.steerAngle = 38 * Deg; a.steerRate = 3.7f; a.steerReturn = 4.5f; a.steerFalloff = 30; a.driftAngle = .5f; a.driftYawGain = 2.3f; a.powerOversteer = .35f; a.liftOversteer = .2f; a.maxYawRate = 2.3f; a.boostAccel = 1.1f; }),
            new("yama", "Yama Cruiser 250", "offroad", VehicleCategory.Utility, 1880, 145, 180, 7068, 3.94f, 2.06f, 1.89f, 2.4f, .39f, .75f, .54f, .42f, .32f, .45f, .85f,
                a => { a.latG = .82f; a.brakeG = .8368f; a.latGrip = 6.8f; a.yawResponse = 5; a.steerAngle = 32 * Deg; a.steerRate = 3.4f; a.steerReturn = 4.2f; a.steerFalloff = 32; a.driftAngle = .5f; a.driftYawGain = 2.1f; a.powerOversteer = .15f; a.liftOversteer = .15f; a.driftFall = 3.6f; a.maxYawRate = 2.1f; a.boostAccel = 1.4f; }),
            new("kumo", "Kumo STi 22", "torrent", VehicleCategory.Sport, 1320, 205, 225, 7153, 4.02f, 1.98f, 1.47f, 2.52f, .33f, .54f, .57f, .29f, .22f, .3f, .85f,
                a => { a.latG = 1.06f; a.brakeG = 1.1008f; a.latGrip = 10.5f; a.yawResponse = 12; a.steerAngle = 33 * Deg; a.driftAngle = .58f; a.driftLatGrip = 2.7f; a.powerOversteer = .25f; a.liftOversteer = .2f; a.driftFall = 3.8f; a.catchAssist = 4.4f; }),
            new("kaze", "Kaze 35 Drift", "ribbon", VehicleCategory.Sport, 1280, 225, 235, 6713, 4.48f, 2.02f, 1.29f, 2.65f, .32f, .48f, .5f, .21f, .16f, .2f, .7f,
                a => { a.latG = .98f; a.brakeG = 1.0354f; a.latGrip = 8.5f; a.yawResponse = 10.5f; a.steerAngle = 43 * Deg; a.driftAngle = 1.0f; a.driftLatGrip = 1.4f; a.driftYawGain = 4.1f; a.powerOversteer = 1; a.liftOversteer = .65f; a.driftFall = 1.8f; a.catchAssist = 2.8f; }),
            new("raiden", "Raiden GT-R34", "meridian", VehicleCategory.Sport, 1660, 285, 270, 10526, 4.86f, 2.1f, 1.4f, 2.91f, .35f, .53f, .54f, .23f, .16f, .2f, .7f,
                a => { a.latG = 1.03f; a.brakeG = 1.0779f; a.latGrip = 11; a.yawResponse = 6.8f; a.steerAngle = 29 * Deg; a.steerRate = 4; a.steerReturn = 5; a.steerFalloff = 34; a.driftAngle = .55f; a.powerOversteer = .2f; a.liftOversteer = .15f; a.maxYawRate = 2.4f; }),
            new("suprema", "Suprema RZ", "morrow", VehicleCategory.Sport, 1740, 320, 265, 10622, 4.73f, 2.16f, 1.34f, 2.77f, .35f, .55f, .59f, .24f, .16f, .2f, .7f,
                a => { a.latG = .91f; a.brakeG = .9641f; a.latGrip = 7.5f; a.yawResponse = 6; a.steerAngle = 30 * Deg; a.steerRate = 3.8f; a.steerReturn = 4.8f; a.steerFalloff = 33; a.driftAngle = .88f; a.powerOversteer = 1.1f; a.liftOversteer = .45f; a.driftFall = 2.1f; a.maxYawRate = 2.5f; }),
            new("rotor", "Rotor FD", "gt", VehicleCategory.Track, 1240, 320, 295, 9415, 4.38f, 2.14f, 1.12f, 2.62f, .34f, .41f, .44f, .17f, .12f, .12f, .65f,
                a => { a.latG = 1.22f; a.brakeG = 1.2673f; a.latGrip = 13; a.yawResponse = 15; a.steerAngle = 28 * Deg; a.steerRate = 6; a.steerReturn = 8; a.steerFalloff = 42; a.driftAngle = .62f; a.liftOversteer = .8f; a.downforce = .08f; }),
            new("hanami", "Hanami SF-26", "needle", VehicleCategory.Track, 710, 300, 305, 6385, 4.55f, 2.2f, 1.03f, 2.88f, .32f, .32f, .44f, .13f, .1f, .1f, .65f,
                a => { a.latG = 1.35f; a.brakeG = 1.4539f; a.latGrip = 15; a.yawResponse = 18; a.steerAngle = 24 * Deg; a.steerRate = 7; a.steerReturn = 9; a.steerFalloff = 44; a.driftAngle = .48f; a.powerOversteer = .5f; a.liftOversteer = .55f; a.downforce = .222222f; a.downforceSpeed = 160 / 3.6f; a.boostAccel = 2.5f; }),
        };

        /// <summary>Order of the fleet in menus and tests (cheap to fast, as in the legacy dealer).</summary>
        public static readonly string[] Order = Array.ConvertAll(Rows, r => r.id);

        [MenuItem("JapanMap/Vehicles/Seed Fleet From Legacy")]
        public static void SeedAll()
        {
            System.IO.Directory.CreateDirectory(Dir);
            if (AssetDatabase.LoadAssetAtPath<ArcadeTuning>(TuningPath) == null)
                AssetDatabase.CreateAsset(ScriptableObject.CreateInstance<ArcadeTuning>(), TuningPath);
            foreach (var row in Rows) Seed(row);
            var fleet = AssetDatabase.LoadAssetAtPath<VehicleFleet>(FleetPath);
            if (fleet == null)
            {
                fleet = ScriptableObject.CreateInstance<VehicleFleet>();
                AssetDatabase.CreateAsset(fleet, FleetPath);
            }
            fleet.tuning = LoadTuning();
            fleet.effects = EffectsAssets();
            fleet.vehicles = Array.ConvertAll(Order, Load);
            EditorUtility.SetDirty(fleet);
            AssetDatabase.SaveAssets();
            Debug.Log($"[Fleet] seeded {Rows.Length} vehicles in {Dir}");
        }

        static void Seed(Row r)
        {
            var path = $"{Dir}/{r.id}.asset";
            var def = AssetDatabase.LoadAssetAtPath<VehicleDefinition>(path);
            var created = def == null;
            if (created) def = ScriptableObject.CreateInstance<VehicleDefinition>();
            r.Apply(def);
            LinkModel(def);
            if (created) AssetDatabase.CreateAsset(def, path);
            else EditorUtility.SetDirty(def);
        }

        public const string ModelDir = "Assets/_Project/Art/Cars";
        static readonly string[] WheelNames = { "wheel_FL", "wheel_FR", "wheel_RL", "wheel_RR" };

        /// <summary>
        /// Model reference and geometry from the car-lab GLB (Tools/convert-cars.mjs): wheel centres,
        /// wheel radius and body box. Tuning options other than 0 (names ending _o1/_o2) are left out.
        /// </summary>
        public static void LinkModel(VehicleDefinition def)
        {
            var model = AssetDatabase.LoadAssetAtPath<GameObject>($"{ModelDir}/{def.id}.glb");
            def.model = model;
            if (model == null)
            {
                Debug.LogWarning($"[Fleet] no model for {def.id} in {ModelDir}");
                return;
            }
            var wheels = new Vector3[4];
            var radius = 0f;
            for (var i = 0; i < 4; i++)
            {
                var t = VehicleVisuals.FindPrefix(model.transform, WheelNames[i]);
                if (t == null) throw new InvalidOperationException($"{def.id}: model has no {WheelNames[i]}");
                wheels[i] = model.transform.InverseTransformPoint(t.position);
                radius += wheels[i].y / 4f;
            }
            Bounds? bounds = null;
            foreach (var r in model.GetComponentsInChildren<Renderer>(true))
            {
                if (VehicleVisuals.IsTuningOption(r.transform) || r.name.StartsWith("wheel") || r.name.StartsWith("caliper") || r.transform.parent?.name.StartsWith("spin") == true) continue;
                if (bounds == null) bounds = r.bounds;
                else { var b = bounds.Value; b.Encapsulate(r.bounds); bounds = b; }
            }
            def.wheelPositions = wheels;
            def.wheelRadius = radius;
            if (bounds is { } body)
            {
                def.bodySize = new Vector3(body.size.z, body.size.x, body.max.y);
                def.bodyCenterZ = body.center.z;
            }
        }

        [MenuItem("JapanMap/Vehicles/Link Models")]
        public static void LinkAll()
        {
            foreach (var id in Order)
            {
                var def = Load(id);
                LinkModel(def);
                EditorUtility.SetDirty(def);
            }
            // Linking sets every model directly; only the starter may stay so (start download, D36).
            Content.StreamingSetup.Cars(Content.StreamingSetup.Settings());
            AssetDatabase.SaveAssets();
        }

        public const string FxDir = "Assets/_Project/Art/Vehicles/FX";

        /// <summary>Skid and smoke materials (URP Particles/Unlit, alpha blended) and the settings asset.</summary>
        static VehicleEffectsSettings EffectsAssets()
        {
            System.IO.Directory.CreateDirectory(FxDir);
            var path = Dir + "/VehicleEffects.asset";
            var fx = AssetDatabase.LoadAssetAtPath<VehicleEffectsSettings>(path);
            if (fx == null)
            {
                fx = ScriptableObject.CreateInstance<VehicleEffectsSettings>();
                AssetDatabase.CreateAsset(fx, path);
            }
            fx.skidMaterial = FxMaterial("Skid", new Color(0.04f, 0.04f, 0.04f, 0.55f), null);
            fx.smokeMaterial = FxMaterial("Smoke", Color.white, SoftDot());
            EditorUtility.SetDirty(fx);
            return fx;
        }

        static Material FxMaterial(string name, Color color, Texture2D tex)
        {
            var path = $"{FxDir}/{name}.mat";
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null)
            {
                m = new Material(Shader.Find("Universal Render Pipeline/Particles/Unlit"));
                AssetDatabase.CreateAsset(m, path);
            }
            m.SetFloat("_Surface", 1f);
            m.SetFloat("_Blend", 0f);
            m.SetFloat("_SrcBlend", (float)UnityEngine.Rendering.BlendMode.SrcAlpha);
            m.SetFloat("_DstBlend", (float)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            m.SetFloat("_ZWrite", 0f);
            m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            m.renderQueue = (int)UnityEngine.Rendering.RenderQueue.Transparent;
            m.SetColor("_BaseColor", color);
            if (tex != null) m.SetTexture("_BaseMap", tex);
            EditorUtility.SetDirty(m);
            return m;
        }

        /// <summary>A 64² soft round dot for smoke puffs, written once as a PNG asset.</summary>
        static Texture2D SoftDot()
        {
            var path = $"{FxDir}/SoftDot.png";
            var tex = AssetDatabase.LoadAssetAtPath<Texture2D>(path);
            if (tex != null) return tex;
            const int n = 64;
            var t = new Texture2D(n, n, TextureFormat.RGBA32, false);
            for (var y = 0; y < n; y++)
            for (var x = 0; x < n; x++)
            {
                var d = new Vector2(x - n / 2f + 0.5f, y - n / 2f + 0.5f).magnitude / (n / 2f);
                var a = Mathf.Clamp01(1f - d);
                t.SetPixel(x, y, new Color(1f, 1f, 1f, a * a));
            }
            System.IO.File.WriteAllBytes(path, t.EncodeToPNG());
            AssetDatabase.ImportAsset(path);
            var importer = (TextureImporter)AssetImporter.GetAtPath(path);
            importer.alphaIsTransparency = true;
            importer.mipmapEnabled = false;
            importer.SaveAndReimport();
            return AssetDatabase.LoadAssetAtPath<Texture2D>(path);
        }

        public static VehicleDefinition Load(string id) =>
            AssetDatabase.LoadAssetAtPath<VehicleDefinition>($"{Dir}/{id}.asset");

        public static ArcadeTuning LoadTuning() => AssetDatabase.LoadAssetAtPath<ArcadeTuning>(TuningPath);

        readonly struct Row
        {
            public readonly string id;
            readonly string name, legacy;
            readonly VehicleCategory category;
            readonly float mass, powerKw, topKmh, launch, length, width, height, wheelbase, radius, cg, front, travel, clearance, ford, dirt;
            readonly Action<ArcadeSpec> patch;

            public Row(string id, string name, string legacy, VehicleCategory category, float mass, float powerKw, float topKmh, float launch,
                float length, float width, float height, float wheelbase, float radius, float cg, float front, float travel,
                float clearance, float ford, float dirt, Action<ArcadeSpec> patch)
            {
                this.id = id; this.name = name; this.legacy = legacy; this.category = category;
                this.mass = mass; this.powerKw = powerKw; this.topKmh = topKmh; this.launch = launch;
                this.length = length; this.width = width; this.height = height; this.wheelbase = wheelbase;
                this.radius = radius; this.cg = cg; this.front = front; this.travel = travel;
                this.clearance = clearance; this.ford = ford; this.dirt = dirt; this.patch = patch;
            }

            public void Apply(VehicleDefinition d)
            {
                d.id = id;
                d.displayName = name;
                d.legacyId = legacy;
                d.category = category;
                d.mass = mass;
                d.wheelbase = wheelbase;
                d.frontWeight = front;
                d.cgHeight = cg;
                d.wheelRadius = radius;
                d.bodySize = new Vector3(length, width, height);
                d.clearance = clearance;
                d.ford = ford;
                d.travel = travel;
                var utility = category == VehicleCategory.Utility;
                var track = category == VehicleCategory.Track;
                d.springFrequency = utility ? 8f : track ? 13f : 10f;
                d.dampingRatio = legacy == "truck" ? .42f : .72f;
                d.bumpStopFactor = 9f;
                d.maxLoadFactor = 3.5f;
                d.rollPerLateralG = utility ? .13f : track ? .025f : .065f;
                d.pitchPerLongitudinalG = legacy == "truck" ? .12f : track ? .025f : .06f;
                d.dirtGrip = dirt;
                d.driveRetain = utility ? .85f : .65f;
                d.crawlShare = track ? .85f : .5f;

                // legacy car(): drag from the top speed, power against drag plus rolling resistance.
                var a = new ArcadeSpec();
                var v = topKmh / 3.6f;
                a.power = powerKw * 1000f;
                a.launchForce = launch;
                a.drag = (a.power / v - mass * a.rollDecel) / (v * v);
                patch(a);
                d.arcade = a;
            }
        }
    }
}
