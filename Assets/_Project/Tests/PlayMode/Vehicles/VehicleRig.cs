using System;
using JapanMap.Vehicles;
using UnityEngine;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace JapanMap.Tests.Vehicles
{
    /// <summary>
    /// A car on an ideal test ground in its own physics scene — the Unity form of the legacy benches
    /// (tools/bench/fleet.mts, arcade.mts, hill.mts). Steps are the game's own: the controller's
    /// Simulate() and a physics step of Time.fixedDeltaTime, just thousands of them per frame.
    /// </summary>
    public sealed class VehicleRig : IDisposable
    {
        public enum Ground { Asphalt, Gravel, Terrain }

        public readonly VehicleController Car;
        readonly Scene _scene;
        readonly PhysicsScene _physics;
        public float Time;
        public static float Dt => UnityEngine.Time.fixedDeltaTime;

        static int _count;

        public VehicleRig(VehicleDefinition def, ArcadeTuning tuning, Ground ground = Ground.Asphalt, float slopeDeg = 0f, ArcadeSpec spec = null)
        {
            _scene = SceneManager.CreateScene($"VehicleRig{_count++}", new CreateSceneParameters(LocalPhysicsMode.Physics3D));
            _physics = _scene.GetPhysicsScene();
            var g = MakeGround(ground, slopeDeg);
            SceneManager.MoveGameObjectToScene(g, _scene);

            var go = new GameObject(def.id);
            SceneManager.MoveGameObjectToScene(go, _scene);
            go.AddComponent<Rigidbody>();
            Car = go.AddComponent<VehicleController>();
            Car.Configure(def, tuning, spec);
            Car.Place(Vector3.zero, 0f);
            // Let the springs settle before anything is measured.
            for (var i = 0; i < 60; i++) Step(default);
            Time = 0f;
        }

        public Vector3 Position => Car.Body.position;
        public VehicleTelemetry T => Car.Telemetry;
        public float Kmh => Car.Telemetry.speed * 3.6f;
        /// <summary>Heading in radians, unwrapped by the caller.</summary>
        public float Yaw => Car.Body.rotation.eulerAngles.y * Mathf.Deg2Rad;

        public void Step(DriveInput input)
        {
            Car.Input = input;
            Car.Simulate(Dt);
            _physics.Simulate(Dt);
            Time += Dt;
        }

        public void Run(float seconds, DriveInput input)
        {
            var n = Steps(seconds);
            for (var i = 0; i < n; i++) Step(input);
        }

        public void Run(float seconds, Func<DriveInput> input)
        {
            var n = Steps(seconds);
            for (var i = 0; i < n; i++) Step(input());
        }

        public static int Steps(float seconds) => Mathf.RoundToInt(seconds / Dt);

        /// <summary>Full throttle until the speed is reached (no measuring on the way).</summary>
        public void AccelerateTo(float kmh, float maxSeconds = 40f)
        {
            var t = 0f;
            while (Kmh < kmh && t < maxSeconds)
            {
                Step(new DriveInput { throttle = 1f });
                t += Dt;
            }
        }

        /// <summary>Bang-bang speed hold, as in legacy arcade.mts (it chops the throttle — the lift probe must survive it).</summary>
        public float HoldBang(float kmh) => Kmh < kmh ? 1f : 0f;

        /// <summary>Proportional speed hold from legacy fleet.mts.</summary>
        public DriveInput HoldSmooth(float kmh, float steer)
        {
            var e = kmh / 3.6f - T.forwardSpeed;
            return e > 0
                ? new DriveInput { throttle = Mathf.Min(1f, e * 0.5f), steer = steer }
                : new DriveInput { brake = Mathf.Min(1f, -e * 0.4f), steer = steer };
        }

        public static DriveInput Cmd(float throttle = 0f, float steer = 0f, bool handbrake = false, float brake = 0f,
            bool boost = false, bool stunt = false, bool trick = false) =>
            new() { throttle = throttle, steer = steer, handbrake = handbrake, brake = brake, boost = boost, stunt = stunt, trick = trick };

        static GameObject MakeGround(Ground ground, float slopeDeg)
        {
            switch (ground)
            {
                case Ground.Terrain:
                {
                    // A plane tilted uphill along +Z, height 0 at the origin.
                    const float size = 3000f;
                    var rise = Mathf.Max(1f, size * Mathf.Tan(slopeDeg * Mathf.Deg2Rad));
                    var data = new TerrainData { heightmapResolution = 33 };
                    data.size = new Vector3(size, rise, size);
                    var res = data.heightmapResolution;
                    var h = new float[res, res];
                    for (var z = 0; z < res; z++)
                    for (var x = 0; x < res; x++)
                        h[z, x] = slopeDeg > 0f ? (float)z / (res - 1) : 0f;
                    data.SetHeights(0, 0, h);
                    var go = Terrain.CreateTerrainGameObject(data);
                    go.transform.position = new Vector3(-size / 2, slopeDeg > 0f ? -rise / 2 : 0f, -size / 2);
                    return go;
                }
                case Ground.Gravel:
                {
                    // Sub-mesh 1 is gravel, as on the imported road meshes.
                    var mesh = new Mesh { subMeshCount = 2 };
                    const float s = 20000f;
                    mesh.vertices = new[] { new Vector3(-s, 0, -s), new Vector3(-s, 0, s), new Vector3(s, 0, s), new Vector3(s, 0, -s) };
                    mesh.SetTriangles(Array.Empty<int>(), 0);
                    mesh.SetTriangles(new[] { 0, 1, 2, 0, 2, 3 }, 1);
                    var go = new GameObject("Gravel");
                    go.AddComponent<MeshCollider>().sharedMesh = mesh;
                    go.transform.rotation = Quaternion.Euler(-slopeDeg, 0f, 0f);
                    return go;
                }
                default:
                {
                    var go = new GameObject("Asphalt");
                    var box = go.AddComponent<BoxCollider>();
                    box.size = new Vector3(40000f, 1f, 40000f); // 90 s at 305 km/h is 7.6 km
                    box.center = new Vector3(0f, -0.5f, 0f);
                    // Uphill along +Z.
                    go.transform.rotation = Quaternion.Euler(-slopeDeg, 0f, 0f);
                    return go;
                }
            }
        }

        public void Dispose()
        {
            if (_scene.IsValid()) SceneManager.UnloadSceneAsync(_scene);
            if (Car != null) Object.Destroy(Car.gameObject);
        }
    }
}
