using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using JapanMap.Vehicles;
using NUnit.Framework;
using UnityEngine;
using static JapanMap.Tests.Vehicles.VehicleRig;

namespace JapanMap.Tests.Vehicles
{
    /// <summary>
    /// Tuning test bench (Phase 8.2): the car with a given part set on the physics rig — 0–100 km/h, top speed,
    /// braking from 100, skidpad grip and steering response. Each category is measured alone against stock,
    /// so a part that changes the wrong number shows up (one knob per measurement).
    /// </summary>
    public static class TuningBench
    {
        public struct Sheet
        {
            public float hundred, top, brake, grip, response;
        }

        public static TuningSettings LoadTuning()
        {
#if UNITY_EDITOR
            return UnityEditor.AssetDatabase.LoadAssetAtPath<TuningSettings>("Assets/_Project/Data/Vehicles/Tuning.asset");
#else
            return null;
#endif
        }

        public static Sheet Measure(VehicleFleet fleet, TuningSettings t, string id, CarTune tune)
        {
            var def = fleet.Get(id);
            var spec = t.Apply(def, tune);
            VehicleRig Rig() => new(def, fleet.tuning, Ground.Asphalt, 0f, spec);
            var s = new Sheet();

            using (var r = Rig())
            {
                s.hundred = -1f;
                var n = Steps(90f);
                for (var i = 0; i < n; i++)
                {
                    r.Step(Cmd(throttle: 1));
                    if (s.hundred < 0 && r.Kmh >= 100f) s.hundred = r.Time;
                }
                s.top = r.Kmh;
            }

            using (var r = Rig())
            {
                var guard = 0;
                while (r.T.forwardSpeed < 27.78f && guard++ < 10000) r.Step(Cmd(throttle: 1));
                var from = r.Position.z;
                guard = 0;
                while (r.T.forwardSpeed > 0.5f && guard++ < 10000) r.Step(Cmd(brake: 1));
                s.brake = r.Position.z - from;
            }

            // Skidpad: full lock at a held speed; the most lateral acceleration any speed sustains (v · yaw rate).
            foreach (var kmh in new[] { 40f, 55f, 70f, 85f, 100f })
            {
                using var r = Rig();
                r.AccelerateTo(kmh);
                var sum = 0f;
                var count = 0;
                r.Run(6f, () => r.HoldSmooth(kmh, 1f));
                r.Run(2f, () =>
                {
                    sum += Mathf.Abs(r.T.speed * r.T.yawRate) / ArcadeTuning.Gravity;
                    count++;
                    return r.HoldSmooth(kmh, 1f);
                });
                s.grip = Mathf.Max(s.grip, sum / count);
            }

            // Steering response: from straight at 60 km/h, half lock — time to 63 % of the settled yaw rate.
            using (var r = Rig())
            {
                r.AccelerateTo(60f);
                var trace = new float[Steps(3f)];
                for (var i = 0; i < trace.Length; i++)
                {
                    r.Step(r.HoldSmooth(60f, 0.5f));
                    trace[i] = Mathf.Abs(r.T.yawRate);
                }
                var settled = trace.Skip(trace.Length - Steps(0.5f)).Average();
                // Interpolate the crossing between two steps: whole steps (20 ms) hid Street vs Sport.
                var goal = settled * 0.63f;
                var at = System.Array.FindIndex(trace, y => y >= goal);
                var before = at > 0 ? trace[at - 1] : 0f;
                var frac = at >= 0 && trace[at] > before ? (goal - before) / (trace[at] - before) : 1f;
                s.response = (at + frac) * Dt * 1000f;
            }
            return s;
        }

        public static CarTune Only(TuneCategory c, int tier)
        {
            var t = new CarTune();
            t[c] = tier;
            return t;
        }

        public static CarTune All(int tier) => new() { engine = tier, brakes = tier, steering = tier, tyres = tier };

        /// <summary>The whole fleet: stock, each part alone at Street/Sport, full packages — markdown.</summary>
        public static string Report(VehicleFleet fleet, TuningSettings t, string[] ids)
        {
            var ci = CultureInfo.GetCultureInfo("de-DE");
            string F(float v, string f) => v.ToString(f, ci);
            string D(float v, float b, string f, bool lowerIsBetter)
            {
                var pct = (v / b - 1f) * 100f;
                var sign = pct >= 0 ? "+" : "−";
                var mark = Mathf.Abs(pct) < 0.5f ? "" : $" ({sign}{F(Mathf.Abs(pct), "0.0")} %)";
                return F(v, f) + mark;
            }
            var sb = new StringBuilder();
            sb.AppendLine("# Tuning-Prüfstand");
            sb.AppendLine();
            sb.AppendLine("> Erzeugt vom PlayMode-Test `TuningBenchReport.WriteSheet` (auf Abruf). Physik-Prüfstand wie die Fahrzeug-Benches");
            sb.AppendLine($"> (ebener Asphalt, dt {F(Dt, "0.0000")} s, ohne Nitro). Werte aus `Data/Vehicles/Tuning.asset` (legacy tuning.config.ts).");
            sb.AppendLine("> Jede Zeile ändert **ein** Teil; Klammer = Änderung gegen Serie. Kurvengrip = höchste gehaltene Querbeschleunigung");
            sb.AppendLine("> bei Volleinschlag (40–100 km/h), Lenkansprache = Zeit bis 63 % der Gierrate bei 60 km/h, halber Einschlag.");
            foreach (var id in ids)
            {
                var def = fleet.Get(id);
                var stock = Measure(fleet, t, id, default);
                sb.AppendLine();
                sb.AppendLine($"## {def.displayName} ({def.mass:0} kg)");
                sb.AppendLine();
                sb.AppendLine("| Teile | 0–100 s | Spitze km/h | Bremsweg 100–0 m | Kurvengrip g | Lenkansprache ms |");
                sb.AppendLine("|---|---:|---:|---:|---:|---:|");
                void Row(string name, Sheet s) => sb.AppendLine(
                    $"| {name} | {D(s.hundred, stock.hundred, "0.00", true)} | {D(s.top, stock.top, "0.0", false)} | {D(s.brake, stock.brake, "0.0", true)} | {D(s.grip, stock.grip, "0.000", false)} | {D(s.response, stock.response, "0", true)} |");
                Row("Serie", stock);
                foreach (var c in CarTune.All)
                for (var tier = 1; tier <= 2; tier++)
                    Row($"{t.Info(c).title} {(tier == 1 ? "Street" : "Sport")}", Measure(fleet, t, id, Only(c, tier)));
                Row("**alles Street**", Measure(fleet, t, id, All(1)));
                Row("**alles Sport**", Measure(fleet, t, id, All(2)));
            }
            return sb.ToString();
        }
    }

    /// <summary>
    /// What each part must do, measured on the bench (Phase 8.2), for a light starter and the heavy utility car:
    /// each category moves its own number by about the legacy factor and leaves the others alone.
    /// </summary>
    public class TuningBenchTests
    {
        VehicleFleet _fleet;
        TuningSettings _t;

        [OneTimeSetUp]
        public void Load()
        {
            _fleet = VehicleBenchReport.LoadFleet();
            _t = TuningBench.LoadTuning();
            Assert.NotNull(_t, "Tuning.asset missing — run JapanMap/Economy/Seed Prices And Times");
        }

        [TestCase("hachi"), TestCase("yama")]
        public void EachPart_MovesItsOwnNumber(string id)
        {
            var stock = TuningBench.Measure(_fleet, _t, id, default);
            var engine = TuningBench.Measure(_fleet, _t, id, TuningBench.Only(TuneCategory.Engine, 2));
            var brakes = TuningBench.Measure(_fleet, _t, id, TuningBench.Only(TuneCategory.Brakes, 2));
            var steering = TuningBench.Measure(_fleet, _t, id, TuningBench.Only(TuneCategory.Steering, 2));
            var tyres = TuningBench.Measure(_fleet, _t, id, TuningBench.Only(TuneCategory.Tyres, 2));

            Assert.That(engine.top / stock.top, Is.EqualTo(_t.engineTopSpeed.z).Within(0.012f), "engine Sport: top speed");
            Assert.Less(engine.hundred, stock.hundred * 0.97f, "engine Sport: 0–100 faster");
            Assert.That(engine.brake, Is.EqualTo(stock.brake).Within(2).Percent, "engine leaves braking alone");

            Assert.That(brakes.brake / stock.brake, Is.EqualTo(_t.brakeDistance.z).Within(0.03f), "brakes Sport: stopping distance");
            Assert.That(brakes.top, Is.EqualTo(stock.top).Within(0.5f), "brakes leave top speed alone");

            Assert.Greater(tyres.grip, stock.grip * 1.02f, "tyres Sport: more skidpad grip");
            Assert.That(tyres.top, Is.EqualTo(stock.top).Within(0.5f), "tyres leave top speed alone");

            Assert.Less(steering.response, stock.response, "steering Sport: quicker response");
            Assert.That(steering.brake, Is.EqualTo(stock.brake).Within(2).Percent, "steering leaves braking alone");
        }

        [Test]
        public void Apply_NeverStacks_AndStockIsTheDefinition()
        {
            var def = _fleet.Get("hachi");
            var once = _t.Apply(def, TuningBench.All(2));
            var again = _t.Apply(def, TuningBench.All(2));
            Assert.AreEqual(once.power, again.power);
            Assert.AreEqual(def.arcade.latG, _t.Apply(def, default).latG);
            Assert.AreEqual(def.arcade.power, _t.Apply(def, default).power);
        }
    }

    [Explicit("Report, start by name")]
    public class TuningBenchReport
    {
        [Test]
        public void WriteSheet()
        {
            var fleet = VehicleBenchReport.LoadFleet();
            var ids = System.Environment.GetEnvironmentVariable("JM_BENCH_IDS");
            var list = string.IsNullOrEmpty(ids) ? fleet.vehicles.Select(v => v.id).ToArray() : ids.Split(',');
            var md = TuningBench.Report(fleet, TuningBench.LoadTuning(), list);
            File.WriteAllText("docs/TUNING.md", md);
            Debug.Log(md);
        }
    }
}
