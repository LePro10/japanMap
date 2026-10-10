using JapanMap.Gameplay.Menu;
using JapanMap.Gameplay.Regions;
using JapanMap.UI;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Editor.Content
{
    /// <summary>
    /// First fill of Data/Gameplay/TravelPoints.asset: the free-travel destinations of ASTRA §10 (seven: the lighthouse waits for its road) at the places
    /// they name (bounds of the built places, region labels for harbour/lighthouse/lookout). Each unlocks with the
    /// region its point lies in (Commons: always). Runs only when the asset is missing.
    /// </summary>
    public static class MenuSeed
    {
        public const string TravelPath = ContentSetup.Dir + "/TravelPoints.asset";

        /// <summary>Loads the asset; creates it (or refills it with <paramref name="refill"/>) from the list below.</summary>
        public static TravelPoints TravelPoints(bool refill = false)
        {
            var set = AssetDatabase.LoadAssetAtPath<TravelPoints>(TravelPath);
            if (set != null && !refill) return set;
            var created = set == null;
            if (created) set = ScriptableObject.CreateInstance<TravelPoints>();
            var regions = AssetDatabase.LoadAssetAtPath<RegionSet>(ContentSetup.Dir + "/Regions.asset");
            var roads = AssetDatabase.LoadAssetAtPath<JapanMap.World.RoadNetwork>(JapanMap.Editor.Map.RoadImporter.NetworkPath);
            // Each point sits on the nearest road (the harbour and lighthouse labels lie over the sea), facing along it;
            // it unlocks with the region of that road point.
            TravelPoints.Point P(string id, string title, float x, float z, float heading, Icon icon, bool always = false)
            {
                var at = new Vector3(x, 0f, z);
                if (roads != null && roads.TryNearest(at, Quaternion.Euler(0f, heading, 0f) * Vector3.forward, 800f, out var road, out var fwd))
                {
                    at = road;
                    heading = Mathf.Atan2(fwd.x, fwd.z) * Mathf.Rad2Deg;
                }
                return new TravelPoints.Point
                {
                    id = id, title = title, at = new Vector2(at.x, at.z), heading = heading, icon = icon,
                    region = always || regions == null ? "" : regions.regions[regions.IndexAt(at)].id,
                };
            }
            set.points = new[]
            {
                P("commons", "Sakura Commons", 552f, -500f, 180f, Icon.Wheel, always: true),
                P("rotor", "Rotor Court", 180f, -280f, 0f, Icon.Drift),
                P("needle", "Needle pits", -610f, -740f, 90f, Icon.Circuit),
                P("cinder", "Cinder Lookout", -536f, 495f, 0f, Icon.Flag),
                P("temple", "Temple forecourt", 828f, 900f, 0f, Icon.Torii),
                P("stillwater", "Stillwater Village", -1213f, -348f, 0f, Icon.Sheaf),
                P("harbour", "Harbour entrance", 810f, -1158f, 180f, Icon.Lantern),
                // "Lighthouse turnout" (ASTRA) waits for a Longshore road — the nearest road today lies 450 m inland.
            };
            if (created) AssetDatabase.CreateAsset(set, TravelPath);
            else EditorUtility.SetDirty(set);
            AssetDatabase.SaveAssets();
            return set;
        }
    }
}
