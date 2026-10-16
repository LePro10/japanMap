using System;

namespace JapanMap.Vehicles
{
    /// <summary>What the car is driving on. Order matches the legacy surface table.</summary>
    public enum Surface
    {
        Asphalt,
        /// <summary>Gravel road ("kies"): carries the per-car dirt factor.</summary>
        Gravel,
        /// <summary>Open ground, grass, fields ("gelaende").</summary>
        Terrain,
        Water,
    }

    /// <summary>One frame of driver intent. Same shape for player, touch, gamepad and AI.</summary>
    [Serializable]
    public struct DriveInput
    {
        public float throttle;
        public float brake;
        /// <summary>−1 … 1, positive = right.</summary>
        public float steer;
        public bool handbrake;
        public bool boost;
        /// <summary>Stunt mode held (double-tap handbrake arms it).</summary>
        public bool stunt;
        /// <summary>Edge: double tap in this step starts a 360 (ground yaw / air roll).</summary>
        public bool trick;
        /// <summary>Edge: boost double tap in this step dumps the whole tank into one burst.</summary>
        public bool burst;
    }

    /// <summary>What the planar dynamics needs to know about ground and attitude.</summary>
    public struct PlanarEnv
    {
        /// <summary>Speed along the car's forward axis, m/s (signed).</summary>
        public float vLong;
        /// <summary>Speed across, m/s, positive = right.</summary>
        public float vLat;
        public Surface surface;
        /// <summary>Prepared-circuit blend 0…1 (more grip and brake on the race track).</summary>
        public float circuit;
        public float waterDepth;
        public bool airborne;
        /// <summary>How much wheel load the slope still carries, 0…1 (a wall carries none).</summary>
        public float support;
        /// <summary>Signed downhill acceleration along forward, m/s².</summary>
        public float slopeAccel;
        /// <summary>Air only: estimated seconds until the wheels touch down (0 = unknown).</summary>
        public float timeToLand;
    }

    /// <summary>What one planar step reports.</summary>
    public struct PlanarResult
    {
        public float accelLong;
        /// <summary>Positive = to the right, m/s².</summary>
        public float accelLat;
        /// <summary>rad/s about the car's up axis, positive = turning right (Unity convention).</summary>
        public float yawRate;
        /// <summary>Air only, rad/s, positive = nose up.</summary>
        public float pitchRate;
        /// <summary>Air only, rad/s, positive = rolling right side down.</summary>
        public float rollRate;
        /// <summary>Air only: flip trick, rad/s, positive = nose up (a backflip).</summary>
        public float flipRate;
        /// <summary>Edge: a ground hop starts in this step (the body gets an upward kick).</summary>
        public bool hop;
        public float drift;
        /// <summary>Slip angle, rad. Positive = velocity points right of the nose.</summary>
        public float slip;
        /// <summary>0…1 how hard the tyres mark (skid marks, smoke, sound).</summary>
        public float skid;
        public float wheelspin;
        public bool boosting;
        public float boost;
        /// <summary>Display wheel angle, rad, positive = right.</summary>
        public float steerAngle;
        public float stunt;
        public float spin;
        public float trick;
        /// <summary>Nitro burst: 1 at the kick, fading to 0 at its end (effects, camera, sound).</summary>
        public float burst;
        /// <summary>Tank share that went into the running burst, 0…1.</summary>
        public float burstCharge;
    }
}
