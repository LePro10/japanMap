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
    }
}
