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
    }
}
