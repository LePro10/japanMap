using System;
using UnityEngine;

namespace JapanMap.Vehicles
{
    public enum TuneCategory { Engine, Brakes, Steering, Tyres }
    public enum CarSetupMode { Road, Drift, Dirt, SafeReturn }

    /// <summary>Installed tier (0 stock, 1 Street, 2 Sport) per category of one car.</summary>
    [Serializable]
    public struct CarTune
    {
        public int engine, brakes, steering, tyres;

        public int this[TuneCategory c]
        {
            readonly get => c switch { TuneCategory.Engine => engine, TuneCategory.Brakes => brakes, TuneCategory.Steering => steering, _ => tyres };
            set
            {
                value = Mathf.Clamp(value, 0, 2);
                switch (c)
                {
                    case TuneCategory.Engine: engine = value; break;
                    case TuneCategory.Brakes: brakes = value; break;
                    case TuneCategory.Steering: steering = value; break;
                    default: tyres = value; break;
                }
            }
        }

        /// <summary>"E1 B0 S2 T1" — the key records are compared under (ASTRA §6: by car and installed tiers).</summary>
        public readonly string Code => $"E{engine} B{brakes} S{steering} T{tyres}";
        public static readonly TuneCategory[] All = { TuneCategory.Engine, TuneCategory.Brakes, TuneCategory.Steering, TuneCategory.Tyres };
    }

    /// <summary>
    /// Tuning tiers, their prices and what each changes, plus the free setups and cosmetic prices.
    /// Values from legacy src/config/tuning.config.ts (tunedArcade, TUNE_PRICE, applySetup) and ASTRA §6
    /// "Tuning is a set of decisions". Always applied to the car's own stock spec, never stacked.
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Vehicles/Tuning Settings", fileName = "Tuning")]
    public sealed class TuningSettings : ScriptableObject
    {
        [Serializable]
        public struct Category
        {
            public TuneCategory id;
            public string title;
            [TextArea] public string blurb;
            [Tooltip("Incremental Sparks for Street and Sport (Sport is paid on top of Street).")]
            public int streetPrice, sportPrice;
        }

        public Category[] categories =
        {
            new() { id = TuneCategory.Engine, title = "Engine", blurb = "Drive force and top speed. Mass stays this car's.", streetPrice = 900, sportPrice = 2700 },
            new() { id = TuneCategory.Brakes, title = "Brakes", blurb = "Shorter stops. The heavy cars still need room.", streetPrice = 600, sportPrice = 1800 },
            new() { id = TuneCategory.Steering, title = "Steering", blurb = "Quicker turn-in. High-speed lock is unchanged.", streetPrice = 600, sportPrice = 1800 },
            new() { id = TuneCategory.Tyres, title = "Tyres", blurb = "More road grip. Handbrake still breaks the rear.", streetPrice = 900, sportPrice = 2700 },
        };

        [Header("Effect per tier (stock, Street, Sport)")]
        [Tooltip("Drive force and power (legacy 1 / 1.06 / 1.12).")]
        public Vector3 engineForce = new(1f, 1.06f, 1.12f);
        [Tooltip("Non-nitro top speed; drag is solved so the car reaches exactly this (legacy 1 / 1.02 / 1.04).")]
        public Vector3 engineTopSpeed = new(1f, 1.02f, 1.04f);
        [Tooltip("Straight-line stopping distance (legacy 1 / 0.94 / 0.89): brake deceleration divides by it.")]
        public Vector3 brakeDistance = new(1f, 0.94f, 0.89f);
        [Tooltip("Steering response delay (legacy 1 / 0.92 / 0.85): steer rates and yaw response divide by it.")]
        public Vector3 steeringDelay = new(1f, 0.92f, 0.85f);
        [Tooltip("Road lateral grip (legacy 1 / 1.04 / 1.08).")]
        public Vector3 tyreGrip = new(1f, 1.04f, 1.08f);

        [Header("Free setups (legacy applySetup)")]
        [Tooltip("Drift: catch assist × this (rear yaw damping −15 %).")]
        public float driftCatch = 0.85f;
        [Tooltip("Drift: wheel lock × this (recoverable steering range +10 %).")]
        public float driftLock = 1.1f;
        [Tooltip("Dirt: high-speed steering falloff × this (−5 %).")]
        public float dirtFalloff = 0.95f;
        [Tooltip("Dirt: ride height raise, m (ASTRA: +20 mm).")]
        public float dirtLift = 0.02f;
        [Tooltip("Safe Return (Needle only): crawl share on loose ground.")]
        public float safeCrawl = 0.9f;

        [Header("Cosmetics, Sparks per car (ASTRA §6)")]
        public string[] palette = { "Cloud", "Ink", "Silver", "Sand", "Jade", "Deep Teal", "Navy", "Plum", "Rose", "Persimmon", "Amber", "Ice" };
        public Color[] paletteColors =
        {
            new(0.86f, 0.87f, 0.88f), new(0.09f, 0.1f, 0.12f), new(0.62f, 0.64f, 0.66f), new(0.76f, 0.68f, 0.52f),
            new(0.33f, 0.6f, 0.47f), new(0.08f, 0.38f, 0.4f), new(0.1f, 0.16f, 0.33f), new(0.4f, 0.2f, 0.36f),
            new(0.85f, 0.5f, 0.58f), new(0.88f, 0.4f, 0.18f), new(0.95f, 0.65f, 0.15f), new(0.75f, 0.88f, 0.95f),
        };
        [Tooltip("Any colour other than the factory paint, once per car.")]
        public int paintPrice = 120;
        [Tooltip("Each optional rim set (the car lab's wheel options 1 and 2).")]
        public int wheelPrice = 450;
        [Tooltip("Each optional body kit (the car lab's aero options 1 and 2).")]
        public int kitPrice = 900;

        public int Price(TuneCategory c, int tier)
        {
            foreach (var k in categories)
                if (k.id == c) return tier == 1 ? k.streetPrice : tier == 2 ? k.sportPrice : 0;
            return 0;
        }

        /// <summary>Sparks to move one category from <paramref name="from"/> to <paramref name="to"/>; downgrades are free.</summary>
        public int Cost(TuneCategory c, int from, int to)
        {
            var sum = 0;
            for (var t = from + 1; t <= to; t++) sum += Price(c, t);
            return sum;
        }

        public Category Info(TuneCategory c)
        {
            foreach (var k in categories) if (k.id == c) return k;
            return default;
        }

        public Color PaintColor(string name)
        {
            var i = Array.IndexOf(palette, name);
            return i >= 0 && i < paletteColors.Length ? paletteColors[i] : Color.white;
        }

        public static CarSetupMode[] SetupsFor(VehicleDefinition car) =>
            car != null && car.category == VehicleCategory.Track && car.legacyId == "needle"
                ? new[] { CarSetupMode.Road, CarSetupMode.Drift, CarSetupMode.SafeReturn }
                : new[] { CarSetupMode.Road, CarSetupMode.Drift, CarSetupMode.Dirt };

        static float Tier(Vector3 v, int t) => t <= 0 ? v.x : t == 1 ? v.y : v.z;

        /// <summary>
        /// The car's handling with these parts and setup, always from its own stock spec (legacy tunedArcade:
        /// repeated application never stacks). Engine raises force and power and solves drag so the flat top
        /// speed rises by exactly the tier's share.
        /// </summary>
        public ArcadeSpec Apply(VehicleDefinition car, CarTune tune, CarSetupMode setup = CarSetupMode.Road)
        {
            var b = car.arcade;
            var s = b.Clone();
            var force = Tier(engineForce, tune.engine);
            s.launchForce = b.launchForce * force;
            s.power = b.power * force;
            if (tune.engine > 0)
            {
                var target = b.TopSpeed(car.mass) * Tier(engineTopSpeed, tune.engine);
                s.drag = (s.power / target - car.mass * b.rollDecel) / (target * target);
            }
            s.brakeG = b.brakeG / Tier(brakeDistance, tune.brakes);
            var response = Tier(steeringDelay, tune.steering);
            s.steerRate = b.steerRate / response;
            s.steerReturn = b.steerReturn / response;
            s.yawResponse = b.yawResponse / response;
            s.latG = b.latG * Tier(tyreGrip, tune.tyres);
            switch (setup)
            {
                case CarSetupMode.Drift:
                    s.catchAssist *= driftCatch;
                    s.steerAngle *= driftLock;
                    break;
                case CarSetupMode.Dirt:
                    s.steerFalloff *= dirtFalloff;
                    break;
            }
            return s;
        }
    }
}
