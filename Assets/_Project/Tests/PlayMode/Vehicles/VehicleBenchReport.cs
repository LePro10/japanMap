using System.IO;
using System.Text;
using JapanMap.Vehicles;
using NUnit.Framework;
using UnityEngine;
using static JapanMap.Tests.Vehicles.VehicleProbes;

namespace JapanMap.Tests.Vehicles
{
    /// <summary>
    /// Prints the legacy-style bench sheet for the fleet to Captures/bench-vehicles.txt — the numbers
    /// to compare with the prototype (SourceData/bench/legacy-*.txt). Explicit: not part of
    /// the normal run, start it by name.
    /// </summary>
    [Explicit("Report, start by name")]
    public class VehicleBenchReport
    {
        public static VehicleFleet LoadFleet()
        {
#if UNITY_EDITOR
            return UnityEditor.AssetDatabase.LoadAssetAtPath<VehicleFleet>("Assets/_Project/Data/Vehicles/Fleet.asset");
#else
            return null;
#endif
        }

        [Test]
        public void WriteSheet()
        {
            Fleet = LoadFleet();
            Assert.NotNull(Fleet, "Fleet.asset missing — run JapanMap/Vehicles/Seed Fleet From Legacy");
            var ids = System.Environment.GetEnvironmentVariable("JM_BENCH_IDS");
            var list = string.IsNullOrEmpty(ids) ? System.Array.ConvertAll(Fleet.vehicles, v => v.id) : ids.Split(',');
            var sb = new StringBuilder();
            sb.AppendLine($"Fahrzeug-Prüfstand (Unity, dt {VehicleRig.Dt:F4} s) — Maßstab: SourceData/bench/legacy-*.txt\n");
            foreach (var id in list) Sheet(id, sb);
            Directory.CreateDirectory("Captures");
            File.WriteAllText("Captures/bench-vehicles.txt", sb.ToString());
            Debug.Log(sb.ToString());
        }

        static void Sheet(string id, StringBuilder sb)
        {
            var def = Fleet.Get(id);
            sb.AppendLine($"── {def.displayName}  ({id} ← legacy {def.legacyId}, {def.mass} kg)  Endtempo gerechnet {def.TopSpeed * 3.6f:F0} km/h");
            var a = Acceleration(id);
            var b = Braking(id);
            sb.AppendLine($"   0–100 {a.hundred:F2} s   Endtempo {a.top:F0} km/h   Bremsweg 100→0 {b.metres:F1} m in {b.seconds:F2} s   Versatz geradeaus {a.offset:F3} m");
            var s = Symmetry(id);
            var c = Coast(id);
            sb.AppendLine($"   Lenksymmetrie rechts {s.right:F2} m links {s.left:F2} m (Abweichung {Mathf.Abs(s.right + s.left):F3})   Ausrollen {c.rises} Anstiege (max {c.maxRise:E1}), {c.from:F0}→halb in {c.toHalf:F1} s");
            sb.AppendLine($"   Lenkantwort 40 km/h: {string.Join(" ", System.Array.ConvertAll(SteerResponse(id, 40), x => x.ToString("F1")))} °/s");
            sb.AppendLine($"   Lenkantwort 90 km/h: {string.Join(" ", System.Array.ConvertAll(SteerResponse(id, 90), x => x.ToString("F1")))} °/s");
            var hand = Drift(id, 80, true, 0.8f, 0.6f);
            sb.AppendLine($"   Handbremsdrift 80: Spitze {hand.peak:F1}° gehalten {hand.held:F1}° Tempo {hand.speed:F0} km/h fängt nach {(hand.catchTime < 0 ? "nie" : hand.catchTime.ToString("F2") + " s")}{(hand.spun ? "  ⚠ DREHER" : "")}");
            var power = Drift(id, 70, false, 0.85f, 1f);
            sb.AppendLine($"   Gasstoß im Bogen:  Spitze {power.peak:F1}° gehalten {power.held:F1}°");
            sb.AppendLine($"   Tippen, dann lenken: Spitze {TapThenSteer(id):F1}°   Handbremse geradeaus: Restgier {HandbrakeOnStraight(id):F1}°   Saubere Kurve 90: {CleanCorner(id):F1}°");
            var nitro = Nitro(id);
            sb.AppendLine($"   Nitro +{nitro.gain:F0} km/h über {nitro.seconds:F1} s");
            sb.AppendLine($"   12 s aus dem Stand: asphalt {SurfaceRun(id, VehicleRig.Ground.Asphalt):F0} m  kies {SurfaceRun(id, VehicleRig.Ground.Gravel):F0} m  gelaende {SurfaceRun(id, VehicleRig.Ground.Terrain):F0} m");
            var h15 = Hill(id, VehicleRig.Ground.Asphalt, 15);
            var h20 = Hill(id, VehicleRig.Ground.Terrain, 20);
            sb.AppendLine($"   Hang: asphalt 15° {h15.kmh:F0} km/h (+{h15.climbed:F0} m)   gelaende 20° {h20.kmh:F0} km/h (+{h20.climbed:F0} m)");
            sb.AppendLine();
        }
    }
}
