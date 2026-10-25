using JapanMap.Vehicles;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Tests
{
    /// <summary>
    /// Free fine tune (POLISH D): every knob moves the stats it claims (rule 4: no dead knob), stock stays stock,
    /// steps are clamped, and the stance carries the Dirt lift that used to be a dead value.
    /// </summary>
    public class FineTuneTests
    {
        static TuningSettings Tuning => AssetDatabase.LoadAssetAtPath<TuningSettings>("Assets/_Project/Data/Vehicles/Tuning.asset");
        static VehicleDefinition Hachi => AssetDatabase.LoadAssetAtPath<VehicleDefinition>("Assets/_Project/Data/Vehicles/hachi.asset");

        [Test]
        public void StockFine_ChangesNothing()
        {
            var a = Tuning.Apply(Hachi, default, CarSetupMode.Road);
            var b = Tuning.Apply(Hachi, default, CarSetupMode.Road, default);
            Assert.AreEqual(a.latG, b.latG);
            Assert.AreEqual(a.brakeG, b.brakeG);
            Assert.AreEqual(a.steerRate, b.steerRate);
            Assert.AreEqual(Vector3.zero, Tuning.Stance(CarSetupMode.Road, default));
        }

        [Test]
        public void EachKnob_MovesItsStats()
        {
            var t = Tuning;
            var stock = t.Apply(Hachi, default);
            var low = t.Apply(Hachi, default, CarSetupMode.Road, new CarFine { height = -t.heightSteps });
            var camber = t.Apply(Hachi, default, CarSetupMode.Road, new CarFine { camber = t.camberSteps });
            var wide = t.Apply(Hachi, default, CarSetupMode.Road, new CarFine { track = t.trackSteps });
            Assert.Greater(low.latG, stock.latG, "lower: more grip");
            Assert.Greater(camber.latG, stock.latG, "camber: more grip");
            Assert.Less(camber.brakeG, stock.brakeG, "camber: less braking");
            Assert.Greater(wide.latG, stock.latG, "wider: more grip");
            Assert.Less(wide.steerRate, stock.steerRate, "wider: slower response");
            var s = t.Stance(CarSetupMode.Road, new CarFine { height = -1, camber = 1, track = 1 });
            Assert.AreEqual(t.heightStep, s.x, 1e-6f, "one step lower drops the body");
            Assert.AreEqual(t.camberStep, s.y, 1e-6f);
            Assert.AreEqual(t.trackStep, s.z, 1e-6f);
        }

        [Test]
        public void Steps_AreClamped_AndDirtLiftsTheBody()
        {
            var t = Tuning;
            var c = t.Clamp(new CarFine { height = -99, camber = 99, track = -5 });
            Assert.AreEqual(-t.heightSteps, c.height);
            Assert.AreEqual(t.camberSteps, c.camber);
            Assert.AreEqual(0, c.track);
            Assert.AreEqual(-t.dirtLift, t.Stance(CarSetupMode.Dirt, default).x, 1e-6f, "Dirt raises the body (was a dead knob)");
        }
    }
}
