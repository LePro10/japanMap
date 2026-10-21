using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using JapanMap.Editor.Content;
using JapanMap.Editor.Map;
using JapanMap.Gameplay.Menu;
using JapanMap.Gameplay.Races;
using JapanMap.World;
using UnityEditor;
using UnityEditor.AddressableAssets.Settings;
using UnityEditor.AddressableAssets.Settings.GroupSchemas;
using UnityEngine;

namespace JapanMap.Editor.Ui
{
    /// <summary>
    /// Bakes the postcards of the menu tiles (<see cref="PostcardSet"/>): Game.unity with every place open, one
    /// 768 × 432 frame per race (at its real start, looking down the route) and per travel point (on the road the
    /// player arrives on, looking along it), through the game camera with its look (Core.CameraShot, bloom included).
    /// PNGs in Art/UI/Postcards (crunched by TextureImportRules), the set in Data/UI/Postcards.asset, streamed from its
    /// own Addressables group — the start download does not grow.
    ///   Batch: node Tools/unity-run.mjs JapanMap.Editor.Ui.Postcards.Bake
    /// </summary>
    public static class Postcards
    {
        public const string Dir = "Assets/_Project/Art/UI/Postcards";
        public const string SetPath = "Assets/_Project/Data/UI/Postcards.asset";
        public const string Group = "Postcards";
        public const int Width = 768, Height = 432;

        // Framing: a chase view along the road; the bake tries these around each spot and keeps the best-scored frame.
        const float Back = 10f, LookAhead = 32f, Fov = 52f, Reach = 150f;
        // Races: anywhere on the route (the card shows the race, not its start line) — the passes start in the shade.
        const float EventStep = 40f, EventSpan = 800f;
        static readonly float[] PlaceOffsets = { -45f, -30f, -15f, 0f, 15f, 30f, 45f };
        static readonly float[] Yaws = { -18f, 0f, 18f };
        static readonly float[] Pitches = { 0f, 5f };
        static readonly float[] Heights = { 1.8f, 3.2f };
        const int ProbeW = 192, ProbeH = 108;
        /// <summary>Places: score lost per metre away from the spot (the card must show that place, not a nicer one).</summary>
        const float PlaceDrift = 0.003f;
        /// <summary>Two cards from (almost) the same spot look alike (the pass descent and drift share a road): penalty inside this radius, m.</summary>
        const float Apart = 80f, ApartPenalty = 1.5f;

        [MenuItem("JapanMap/UI/Bake Postcards")]
        public static string Bake()
        {
            MapScene.OpenGameScene();
            PlaceScenesInEditor.OpenAll();
            var cam = Camera.main;
            if (cam == null) { Debug.LogError("[Postcards] no main camera in Game.unity"); return null; }
            var roads = AssetDatabase.LoadAssetAtPath<RoadNetwork>("Assets/_Project/Data/Roads/RoadNetwork.asset");
            var races = AssetDatabase.LoadAssetAtPath<RaceEventSet>("Assets/_Project/Data/Gameplay/RaceEvents.asset");
            var travel = AssetDatabase.LoadAssetAtPath<TravelPoints>("Assets/_Project/Data/Gameplay/TravelPoints.asset");
            Directory.CreateDirectory(Dir);

            var shots = new List<(string id, string file, RaceTrack track, float s0, float[] offsets, float drift)>();
            foreach (var e in races.events)
            {
                var track = TrackOf(roads, races, e, out var s0);
                if (track == null) { Debug.LogWarning($"[Postcards] event {e.id}: road {e.road} not found"); continue; }
                var span = Mathf.Min(EventSpan, track.Length - (track.Closed ? 0f : s0 + LookAhead));
                var offsets = Enumerable.Range(0, Mathf.Max(1, Mathf.FloorToInt(span / EventStep))).Select(i => i * EventStep).ToArray();
                shots.Add((PostcardSet.EventId(e.id), $"event_{e.id}", track, s0, offsets, 0f));
            }
            foreach (var p in travel.points)
            {
                // Where Travel puts the player: the nearest road, facing along it the way the point's heading says.
                var at = new Vector3(p.at.x, 0f, p.at.y);
                var track = NearestRoad(roads, at, Quaternion.Euler(0f, p.heading, 0f) * Vector3.forward, out var s0);
                if (track == null) { Debug.LogWarning($"[Postcards] place {p.id}: no road within {Reach} m"); continue; }
                shots.Add((PostcardSet.PlaceId(p.id), $"place_{p.id}", track, s0, PlaceOffsets, PlaceDrift));
            }

            var t = cam.transform;
            var (pos, rot, fov) = (t.position, t.rotation, cam.fieldOfView);
            var report = new StringBuilder("[Postcards]");
            var picks = new StringBuilder();
            var bytes = 0L;
            try
            {
                cam.fieldOfView = Fov;
                var taken = new List<(string kind, Vector3 eye)>();
                foreach (var s in shots)
                {
                    // Small probes of every framing, then the best one at full size.
                    var best = (score: float.NegativeInfinity, o: 0f, yaw: 0f, pitch: 0f, h: 0f);
                    foreach (var o in s.offsets)
                    foreach (var yaw in Yaws)
                    foreach (var pitch in Pitches)
                    foreach (var h in Heights)
                    {
                        Frame(t, s.track, s.s0 + o, yaw, pitch, h);
                        var probe = Core.CameraShot.Render(cam, ProbeW, ProbeH);
                        var score = Score(probe.GetPixels32(), ProbeW, ProbeH) - s.drift * Mathf.Abs(o);
                        var eye = t.position;
                        // Only within a kind: a place on a race route may show the same road as the race.
                        if (taken.Any(e => e.kind == s.file[..5] && Vector3.Distance(e.eye, eye) < Apart)) score -= ApartPenalty;
                        Object.DestroyImmediate(probe);
                        if (score > best.score) best = (score, o, yaw, pitch, h);
                    }
                    Frame(t, s.track, s.s0 + best.o, best.yaw, best.pitch, best.h);
                    taken.Add((s.file[..5], t.position));
                    var image = Core.CameraShot.Render(cam, Width, Height);
                    File.WriteAllBytes($"{Dir}/{s.file}.png", image.EncodeToPNG());
                    Object.DestroyImmediate(image);
                    picks.Append($"\n[Postcards]   {s.id}: score {best.score:0.00} · {best.o:+0;-0} m, yaw {best.yaw:+0;-0}°, pitch {best.pitch:0}°, {best.h:0.0} m");
                }
            }
            finally
            {
                t.SetPositionAndRotation(pos, rot);
                cam.fieldOfView = fov;
            }

            var set = AssetDatabase.LoadAssetAtPath<PostcardSet>(SetPath);
            if (set == null)
            {
                set = ScriptableObject.CreateInstance<PostcardSet>();
                AssetDatabase.CreateAsset(set, SetPath);
            }
            var cards = new List<PostcardSet.Card>();
            foreach (var s in shots)
            {
                var path = $"{Dir}/{s.file}.png";
                AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceUpdate);
                Configure(path);
                cards.Add(new PostcardSet.Card { id = s.id, image = AssetDatabase.LoadAssetAtPath<Texture2D>(path) });
                bytes += new FileInfo(path).Length;
            }
            set.cards = cards.ToArray();
            EditorUtility.SetDirty(set);
            AssetDatabase.SaveAssets();
            report.Append($" {cards.Count} cards ({races.events.Length} races, {travel.points.Length} places), PNG {bytes / 1024} KB · {Stream()}");
            report.Append(picks);
            Debug.Log(report.ToString());
            return report.ToString();
        }

        /// <summary>The route as RaceDirector builds it (reverse, start offset): the card shows the real start line.</summary>
        static RaceTrack TrackOf(RoadNetwork roads, RaceEventSet set, in RaceEventSet.Event e, out float s0)
        {
            s0 = 0f;
            foreach (var r in roads.roads)
            {
                if (r.id != e.road) continue;
                var pts = (Vector3[])r.points.Clone();
                if (e.reverse) System.Array.Reverse(pts);
                var track = new RaceTrack(pts, r.closed, r.width);
                s0 = r.closed ? track.Wrap(e.startOffset) : set.sprintStart + e.startOffset;
                return track;
            }
            return null;
        }

        /// <summary>The road the player arrives on (Travel snaps within 150 m), turned to run the way the heading points.</summary>
        static RaceTrack NearestRoad(RoadNetwork roads, Vector3 at, Vector3 heading, out float s0)
        {
            s0 = 0f;
            RaceTrack best = null;
            var bestDist = Reach;
            foreach (var r in roads.roads)
            {
                if (r.points == null || r.points.Length < 2) continue;
                var track = new RaceTrack(r.points, r.closed, r.width);
                var s = track.Nearest(at);
                var p = track.PointAt(s);
                var d = Vector2.Distance(new Vector2(p.x, p.z), new Vector2(at.x, at.z));
                if (d >= bestDist) continue;
                bestDist = d;
                best = track;
                s0 = s;
                if (Vector3.Dot(track.TangentAt(s), heading) < 0f)
                {
                    var pts = (Vector3[])r.points.Clone();
                    System.Array.Reverse(pts);
                    best = new RaceTrack(pts, r.closed, r.width);
                    s0 = best.Nearest(at);
                }
            }
            return best;
        }

        /// <summary>Eye on the road <see cref="Back"/> m behind the spot, looking down the route (it bends into the frame).</summary>
        static void Frame(Transform t, RaceTrack track, float s, float yaw, float pitch, float height)
        {
            s = track.Closed ? track.Wrap(s) : Mathf.Clamp(s, Back, track.Length - LookAhead);
            var eye = track.PointAt(s - Back);
            eye.y = Mathf.Max(eye.y, Ground(eye)) + height;
            var target = track.PointAt(s + LookAhead);
            target.y = eye.y - height * 0.4f;
            var dir = Quaternion.Euler(0f, yaw, 0f) * (target - eye);
            var look = Quaternion.LookRotation(dir, Vector3.up) * Quaternion.Euler(-pitch, 0f, 0f);
            t.SetPositionAndRotation(eye, look);
        }

        /// <summary>
        /// How good a probe frame looks, by numbers: not too dark, colourful (neon, sky glow), a few bright lights, detail
        /// in the picture — and not half of it flat grey road. Weights picked by looking at the bakes of 2026-10-21.
        /// </summary>
        public static float Score(Color32[] px, int w, int h)
        {
            var n = px.Length;
            var luma = new float[n];
            double sum = 0, rg = 0, yb = 0, rg2 = 0, yb2 = 0;
            var lights = 0;
            for (var i = 0; i < n; i++)
            {
                float r = px[i].r / 255f, g = px[i].g / 255f, b = px[i].b / 255f;
                var l = 0.2126f * r + 0.7152f * g + 0.0722f * b;
                luma[i] = l;
                sum += l;
                if (l > 0.75f) lights++;
                double a = r - g, c = 0.5 * (r + g) - b;
                rg += a; yb += c; rg2 += a * a; yb2 += c * c;
            }
            var mean = (float)(sum / n);
            rg /= n; yb /= n;
            // Hasler & Süsstrunk colourfulness.
            var colour = (float)(System.Math.Sqrt(rg2 / n - rg * rg + yb2 / n - yb * yb) + 0.3 * System.Math.Sqrt(rg * rg + yb * yb));
            double detail = 0;
            int flat = 0, bottom = 0;
            for (var y = 1; y < h; y++)
            for (var x = 1; x < w; x++)
            {
                var i = y * w + x;
                var gr = Mathf.Abs(luma[i] - luma[i - 1]) + Mathf.Abs(luma[i] - luma[i - w]);
                detail += gr;
                // Rows are bottom-up (ReadPixels): y < 40 % is the lower part of the picture.
                if (y >= h * 0.4f) continue;
                bottom++;
                if (gr < 0.012f) flat++;
            }
            var detailN = (float)(detail / n) / 0.05f;
            return Mathf.Min(mean, 0.32f) / 0.32f
                   + 0.8f * Mathf.Min(colour / 0.25f, 1.5f)
                   + 0.6f * Mathf.Min(lights / (n * 0.015f), 1f)
                   + 0.8f * Mathf.Min(detailN, 1.5f)
                   - 0.8f * flat / Mathf.Max(1f, bottom);
        }

        static float Ground(Vector3 p)
        {
            var best = float.NegativeInfinity;
            foreach (var terrain in Terrain.activeTerrains)
            {
                var b = terrain.terrainData.bounds;
                var local = p - terrain.transform.position;
                if (local.x < b.min.x || local.x > b.max.x || local.z < b.min.z || local.z > b.max.z) continue;
                best = Mathf.Max(best, terrain.SampleHeight(p) + terrain.transform.position.y);
            }
            return float.IsNegativeInfinity(best) ? p.y : best;
        }

        static void Configure(string path)
        {
            var importer = (TextureImporter)AssetImporter.GetAtPath(path);
            importer.textureType = TextureImporterType.Default;
            importer.sRGBTexture = true;
            importer.mipmapEnabled = false; // UI picture, shown at its size
            importer.npotScale = TextureImporterNPOTScale.None;
            importer.wrapMode = TextureWrapMode.Clamp;
            importer.alphaSource = TextureImporterAlphaSource.None;
            importer.maxTextureSize = 1024;
            importer.textureCompression = TextureImporterCompression.Compressed; // crunched by TextureImportRules
            importer.SaveAndReimport();
        }

        /// <summary>
        /// The set by address in its own group (one bundle: the menu wants all cards at once). Same group settings as
        /// Editor/Content/StreamingSetup (LZ4, bundle cache, in the build).
        /// </summary>
        public static string Stream()
        {
            var s = StreamingSetup.Settings();
            var guid = AssetDatabase.AssetPathToGUID(SetPath);
            if (string.IsNullOrEmpty(guid)) return "postcards: no set";
            var g = s.FindGroup(Group) ?? s.CreateGroup(Group, false, false, false, null, typeof(BundledAssetGroupSchema), typeof(ContentUpdateGroupSchema));
            var b = g.GetSchema<BundledAssetGroupSchema>();
            b.BundleMode = BundledAssetGroupSchema.BundlePackingMode.PackTogether;
            b.Compression = BundledAssetGroupSchema.BundleCompressionMode.LZ4;
            b.UseAssetBundleCache = true;
            b.IncludeInBuild = true;
            s.CreateOrMoveEntry(guid, g, false, false).address = PostcardSet.Address;
            s.SetDirty(AddressableAssetSettings.ModificationEvent.BatchModification, null, true, true);
            AssetDatabase.SaveAssets();
            return $"streamed as {PostcardSet.Address} (group {Group})";
        }
    }
}
