using System.IO;
using System.Text;
using NUnit.Framework;
using UnityEngine;

namespace JapanMap.Tests.Vehicles
{
    /// <summary>Step-by-step trace of one run to Captures/vehicle-trace.txt — for debugging the rig.</summary>
    [Explicit("Debug trace, start by name")]
    public class VehicleTrace
    {
        [Test]
        public void Trace()
        {
            VehicleProbes.Fleet = VehicleBenchReport.LoadFleet();
            using var r = new VehicleRig(VehicleProbes.Fleet.Get("hachi"), VehicleProbes.Fleet.tuning);
            var sb = new StringBuilder();
            void Line(string tag)
            {
                var b = r.Car.Body;
                var t = r.T;
                sb.AppendLine($"{tag} t={r.Time:F2} pos={b.position:F3} rot={b.rotation.eulerAngles:F1} v={b.linearVelocity:F2} w={b.angularVelocity:F2} " +
                              $"vL={t.forwardSpeed:F2} vLat={t.lateralSpeed:F2} gw={t.groundedWheels} aL={t.accelLong:F2} aLat={t.accelLat:F2} yaw={t.yawRate:F2} " +
                              $"x=[{r.Car.Wheels[0].compression:F3},{r.Car.Wheels[1].compression:F3},{r.Car.Wheels[2].compression:F3},{r.Car.Wheels[3].compression:F3}]");
            }
            Line("settled");
            for (var i = 0; i < 150; i++)
            {
                r.Step(VehicleRig.Cmd(throttle: 1));
                if (i % 5 == 0) Line("gas");
            }
            for (var i = 0; i < 100; i++)
            {
                r.Step(VehicleRig.Cmd(throttle: 1, steer: 1));
                if (i % 5 == 0) Line("steer");
            }
            File.WriteAllText("Captures/vehicle-trace.txt", sb.ToString());
        }

        [Test]
        public void TraceLanding()
        {
            VehicleProbes.Fleet = VehicleBenchReport.LoadFleet();
            var def = VehicleProbes.Fleet.Get("hachi");
            using var r = new VehicleRig(def, VehicleProbes.Fleet.tuning);
            r.Car.transform.position = new Vector3(0f, 6f, 0f);
            r.Car.Body.position = new Vector3(0f, 6f, 0f);
            Physics.SyncTransforms();
            var sb = new StringBuilder();
            for (var i = 0; i < 90; i++)
            {
                r.Step(default);
                var t = r.Car.transform;
                var low = float.MaxValue;
                for (var cx = -1; cx <= 1; cx += 2)
                for (var cz = -1; cz <= 1; cz += 2)
                    low = Mathf.Min(low, t.TransformPoint(new Vector3(cx * def.bodySize.y * 0.5f, def.clearance, def.bodyCenterZ + cz * def.bodySize.x * 0.5f)).y);
                if (i > 45 && i < 80) sb.AppendLine($"{i} y={r.Position.y:F3} vy={r.Car.Body.linearVelocity.y:F2} low={low:F3} pitch={t.eulerAngles.x:F1} roll={t.eulerAngles.z:F1} x=[{r.Car.Wheels[0].compression:F2},{r.Car.Wheels[2].compression:F2}] load={r.Car.Wheels[0].load:F0}");
            }
            File.WriteAllText("Captures/vehicle-trace-landing.txt", sb.ToString());
        }
    }
}
