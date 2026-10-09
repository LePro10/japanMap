using JapanMap.Editor.Content;
using JapanMap.Editor.Map;
using JapanMap.Gameplay.Stunts;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Tests
{
    /// <summary>
    /// Ramps (Phase 7.4): seen from above, the ramp and its landing pad are the surface everywhere —
    /// no ground pokes through (the first build had grass on the Terrace Roller kicker, and the wheels
    /// drove on the field instead of the ramp).
    /// </summary>
    public class RampPlacementTests
    {
        [Test]
        public void NoGroundPokesThroughARamp()
        {
            MapScene.OpenGameScene();
            var set = AssetDatabase.LoadAssetAtPath<RampSet>(RampBuilder.Path);
            Assert.IsNotNull(set);
            var bad = "";
            foreach (var r in set.ramps)
            {
                var right = new Vector3(r.Forward.z, 0f, -r.Forward.x);
                var hw = r.width * 0.5f - 0.3f;
                var poke = 0;
                for (var s = 0f; s < r.Length; s += 1.5f)
                for (var w = -hw; w <= hw; w += hw / 3f)
                {
                    var p = new Vector3(r.start.x, 0f, r.start.y) + r.Forward * s + right * w;
                    if (Physics.Raycast(p + Vector3.up * 500f, Vector3.down, out var h, 1000f) && h.collider is TerrainCollider) poke++;
                }
                if (poke > 0) bad += $"\n{r.id}: ground on top at {poke} probes — rebuild (Content/Build Ramps)";
            }
            Assert.IsEmpty(bad, bad);
        }
    }
}
