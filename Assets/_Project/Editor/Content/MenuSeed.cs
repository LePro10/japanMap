using JapanMap.Gameplay.Menu;
using JapanMap.Gameplay.Regions;
using JapanMap.UI;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Editor.Content
{
    /// <summary>
    /// First fill of Data/Gameplay/TravelPoints.asset: the eight free-travel destinations of ASTRA §10 at the places
    /// they name (bounds of the built places, region labels for harbour/lighthouse/lookout). Each unlocks with the
    /// region its point lies in (Commons: always). Runs only when the asset is missing.
    /// </summary>
    public static class MenuSeed
    {
        public const string TravelPath = ContentSetup.Dir + "/TravelPoints.asset";

        public static TravelPoints TravelPoints()
        {
            var set = AssetDatabase.LoadAssetAtPath<TravelPoints>(TravelPath);
            if (set != null) return set;
            set = ScriptableObject.CreateInstance<TravelPoints>();
            var regions = AssetDatabase.LoadAssetAtPath<RegionSet>(ContentSetup.Dir + "/Regions.asset");
            TravelPoints.Point P(string id, string title, float x, float z, float heading, Icon icon, bool always = false) => new()
            {
                id = id, title = title, at = new Vector2(x, z), heading = heading, icon = icon,
                region = always || regions == null ? "" : regions.regions[regions.IndexAt(new Vector3(x, 0f, z))].id,
            };
            set.points = new[]
            {
                P("commons", "Sakura Commons", 552f, -500f, 180f, Icon.Wheel, always: true),
                P("rotor", "Rotor Court", 180f, -280f, 0f, Icon.Drift),
                P("needle", "Needle pits", -610f, -740f, 90f, Icon.Circuit),
                P("cinder", "Cinder Lookout", -536f, 495f, 0f, Icon.Flag),
                P("temple", "Temple forecourt", 828f, 900f, 0f, Icon.Torii),
                P("stillwater", "Stillwater Village", -1213f, -348f, 0f, Icon.Sheaf),
                P("harbour", "Harbour entrance", 810f, -1158f, 180f, Icon.Lantern),
                P("lighthouse", "Lighthouse turnout", 80f, -1280f, 90f, Icon.Lighthouse),
            };
            AssetDatabase.CreateAsset(set, TravelPath);
            AssetDatabase.SaveAssets();
            return set;
        }
    }
}
