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

        [UnityEngine.TestTools.UnityTest]
        public System.Collections.IEnumerator TraceRingCrest()
        {
            UnityEngine.SceneManagement.SceneManager.LoadScene(JapanMap.Core.Bootstrapper.BootSceneName);
            for (var f = 0; f < 60 && UnityEngine.SceneManagement.SceneManager.GetActiveScene().name != "Game"; f++) yield return null;
            for (var f = 0; f < 10; f++) yield return null;
            var respawn = Object.FindAnyObjectByType<JapanMap.Vehicles.VehicleRespawn>();
            var road = ((JapanMap.World.RoadNetwork)respawn.Locator).roads.Find(r => r.id == "ring");
            var car = Object.FindAnyObjectByType<JapanMap.Vehicles.PlayerCarSpawner>().Current;
            Object.FindAnyObjectByType<JapanMap.Vehicles.DriverInput>().Vehicle = null;
            var p = road.points;
            var start = 0;
            for (var i = 0; i < p.Length; i++)
                if ((new Vector2(p[i].x + 545f, p[i].z + 529f)).sqrMagnitude < (new Vector2(p[start].x + 545f, p[start].z + 529f)).sqrMagnitude) start = i;
            car.Place(p[start], Mathf.Atan2(p[start + 1].x - p[start].x, p[start + 1].z - p[start].z) * Mathf.Rad2Deg, fromAbove: 3f);
            car.Body.linearVelocity = (p[start + 1] - p[start]).normalized * (118f / 3.6f);
            var pilot = car.gameObject.AddComponent<JapanMap.Vehicles.PathFollower>();
            pilot.maxSpeedKmh = 120f;
            pilot.Begin(car, p, true, start);
            var sb = new StringBuilder();
            var t0 = Time.time;
            var log = car.gameObject.AddComponent<BodyContactLog>();
            log.sb = sb;
            log.time = () => Time.time - t0;
            for (var i = 0; i < 200; i++)
            {
                yield return new WaitForFixedUpdate();
                var t = car.Telemetry;
                sb.AppendLine($"{Time.time - t0:F2} pos {car.transform.position:F2} kmh {t.speed * 3.6f:F1} vy {car.Body.linearVelocity.y:F2} wheels {t.groundedWheels} x=[{car.Wheels[0].compression:F2},{car.Wheels[1].compression:F2},{car.Wheels[2].compression:F2},{car.Wheels[3].compression:F2}] pitch {car.transform.eulerAngles.x:F1} slip {t.slip * Mathf.Rad2Deg:F1} steer {car.Input.steer:F2} off {pilot.Offset:F2}");
            }
            File.WriteAllText("Captures/vehicle-trace-crest.txt", sb.ToString());
            if (JapanMap.Core.Bootstrapper.Instance != null) Object.Destroy(JapanMap.Core.Bootstrapper.Instance.gameObject);
        }
    }
}
