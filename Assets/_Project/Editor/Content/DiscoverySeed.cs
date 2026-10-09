using JapanMap.Gameplay.Discovery;
using UnityEditor;
using UnityEngine;
using T = JapanMap.Gameplay.Discovery.DiscoverySet.Trigger;

namespace JapanMap.Editor.Content
{
    /// <summary>
    /// First fill of Data/Gameplay/Discoveries.asset: the 24 cards of ASTRA_PLAN.md §9, anchors converted
    /// to Unity (z mirrored; "S + (a, b)" = Sakura spawn (550, −506) + (a, −b)) and moved to what the map
    /// actually has where the design named a place that was never built. Runs only when the asset is missing.
    /// </summary>
    public static class DiscoverySeed
    {
        public const string Path = ContentSetup.Dir + "/Discoveries.asset";

        static DiscoverySet.Card Card(string id, string region, string title, float x, float z, T trigger, string note) => new()
        {
            id = id, region = region, title = title, position = new Vector2(x, z), trigger = trigger, note = note,
            buttons = System.Array.Empty<DiscoverySet.Button>(), answer = System.Array.Empty<int>(), gaps = System.Array.Empty<Vector2>(),
        };

        static DiscoverySet.Card Seq(DiscoverySet.Card c, string hint, string reward, float yaw, string[] labels, int[] answer)
        {
            c.hint = hint;
            c.reward = reward;
            c.yaw = yaw;
            c.answer = answer;
            c.buttons = new DiscoverySet.Button[labels.Length];
            for (var i = 0; i < labels.Length; i++)
                c.buttons[i] = new DiscoverySet.Button { label = labels[i], offset = new Vector2((i - (labels.Length - 1) * 0.5f) * 2.4f, 2.5f) };
            return c;
        }

        static DiscoverySet.Card Rhythm(DiscoverySet.Card c, string hint, string reward, params Vector2[] gaps)
        {
            c.hint = hint;
            c.reward = reward;
            c.gaps = gaps;
            return c;
        }

        public static DiscoverySet LoadOrCreate()
        {
            var set = AssetDatabase.LoadAssetAtPath<DiscoverySet>(Path);
            if (set != null) return set;
            set = ScriptableObject.CreateInstance<DiscoverySet>();
            set.cards = new[]
            {
                Card("SC1", "commons", "Founder's Plaque", 538f, -496f, T.Inspect, "ASTRA SC1 S + (−12, −10)."),
                Seq(Card("SC2", "commons", "Open Bay light board", 582f, -488f, T.Sequence, "ASTRA SC2 S + (32, −18); tyre stacks as stand-in posts."),
                    "Read the tyre stacks: two, one, three.", "Petal Stripe decal", 0f, new[] { "stack 1", "stack 2", "stack 3" }, new[] { 1, 0, 2 }),
                Card("SC3", "commons", "Petal Hop bench", 660f, -556f, T.Approach, "ASTRA SC3 S + (110, 50), beside the Petal Hop ramp (Phase 7.4)."),

                Card("NB1", "neon", "Diner window", 407f, -28f, T.Inspect, "ASTRA NB1 diner window ledge (495, 35) — the diner as built stands at (420, −28), door on its west side."),
                Seq(Card("NB2", "neon", "Corner Mart shelf", 578f, -48f, T.Sequence, "ASTRA NB2 vending alcove (644, 145) — the mart as built: door at (578, −44)."),
                    "Bottle. Carton. Can.", "Night Grid decal", 180f, new[] { "can", "bottle", "carton" }, new[] { 1, 2, 0 }),
                Card("NB3", "neon", "Crossing viewer", 642f, -142f, T.Inspect, "ASTRA NB3 Beacon forecourt — no Beacon tower; a viewing frame at the scramble crossing (620, −120) instead."),

                Seq(Card("NW1", "needle", "Retired start board", -350f, -570f, T.Sequence, "ASTRA NW1 pit scoreboard (−350, 570); 'set panels 3/2/1' as pressing them in that order."),
                    "Count them home.", "Pit Chevron decal", 0f, new[] { "panel 1", "panel 2", "panel 3" }, new[] { 2, 1, 0 }),
                Card("NW2", "needle", "Spectator stand", -620f, -885f, T.Inspect, "ASTRA NW2 pedestrian stand (−620, 885), behind the straight."),
                Card("NW3", "needle", "Toy shed", -1090f, -555f, T.Inspect, "ASTRA NW3 Breakyard booth (−1090, 555); Breakyard itself is not built."),

                Card("ST1", "stillwater", "Rice tray", -480f, -31f, T.Inspect, "ASTRA ST1 produce farmhouse (−483.77, 25.28), porch toward the village road."),
                Seq(Card("ST2", "stillwater", "Mill sluice", -1255f, -405f, T.Sequence, "ASTRA ST2 outer sluice (−1255, 405). The timed paddle puzzle became three gates in order (no timing on touch)."),
                    "Water runs downhill: upper, middle, lower.", "Mill Spoke decal", 90f, new[] { "lower gate", "middle gate", "upper gate" }, new[] { 2, 1, 0 }),
                Card("ST3", "stillwater", "Shallow Run bank", -900f, -320f, T.Approach, "ASTRA ST3 dry north bank (−900, 320)."),

                Card("CP1", "cinder", "Roadside map panel", -715f, 1161f, T.Inspect, "ASTRA CP1 small shrine (−718, −1161), beside it."),
                Seq(Card("CP2", "cinder", "Ridge panel", -620f, 1205f, T.Sequence, "ASTRA CP2 lookout (−620, −1205)."),
                    "Left peak, tall centre, right saddle.", "Ridge Line decal", 0f, new[] { "left peak", "tall centre", "right saddle" }, new[] { 0, 1, 2 }),
                Card("CP3", "cinder", "Red thermos", -1340f, 1328f, T.Approach, "ASTRA CP3: 60 % of the pass from its foot, 6 m outside the right shoulder (measured on the toge road)."),

                Card("BW1", "bellwood", "Lantern plaque", 843f, 806f, T.Inspect, "ASTRA BW1: first torii of the approach (846, −806 legacy), 3 m west."),
                Rhythm(Card("BW2", "bellwood", "Temple bell", 817f, 918f, T.Rhythm, "ASTRA BW2 bell alcove — at the bell tower (814, 922) that exists."),
                    "Two rings, pause, one ring.", "Bell Arc decal", new Vector2(0.05f, 2f), new Vector2(2f, 6f)),
                Card("BW3", "bellwood", "Viewing bench", 840f, 964f, T.Approach, "ASTRA BW3: 20 m east and 10 m north of the hall (820, 954)."),

                Seq(Card("TH1", "tideglass", "Net House ropes", 784f, -1006f, T.Sequence, "ASTRA TH1 Net House loft (784, 1006), among the fish huts."),
                    "Match the net diagram: two, one, three.", "Net Weave decal", 0f, new[] { "1 knot", "2 knots", "3 knots" }, new[] { 1, 0, 2 }),
                Card("TH2", "tideglass", "Tide board", 795f, -1025f, T.Inspect, "ASTRA TH2 working quay (795, 1025)."),
                Card("TH3", "tideglass", "Harbour card", 830f, -977f, T.Approach, "ASTRA TH3 fish-market bench (830, 977)."),

                Rhythm(Card("LS1", "longshore", "Lamp panel", -180f, -1145f, T.Rhythm, "ASTRA LS1: 15 m north of the lighthouse (−180, 1160)."),
                    "Three flashes: press three times, about a second apart.", "Lightkeeper decal", new Vector2(0.6f, 1.6f), new Vector2(0.6f, 1.6f)),
                Card("LS2", "longshore", "Driftwood marker", -1359f, -1024f, T.Approach, "ASTRA LS2: 10 m inland from the river mouth (−1338, −1034), west bank (half width 17 m)."),
                Card("LS3", "longshore", "Lifering sign", 400f, -1058f, T.Approach, "ASTRA LS3: beach at x 400, 8 m inland from the shoreline (measured: sea level at z −1066)."),
            };
            AssetDatabase.CreateAsset(set, Path);
            return set;
        }
    }
}
