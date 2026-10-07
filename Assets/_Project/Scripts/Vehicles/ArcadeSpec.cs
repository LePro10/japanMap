using System;
using UnityEngine;

namespace JapanMap.Vehicles
{
    /// <summary>
    /// Per-car handling identity of the arcade model. Field meanings and starting values come from
    /// legacy arcade.config.ts (ArcadeSpec, ARCADE table); values live in the VehicleDefinition assets.
    /// </summary>
    [Serializable]
    public sealed class ArcadeSpec
    {
        [Header("Grip")]
        [Tooltip("Peak lateral acceleration in g on asphalt.")]
        public float latG = 0.95f;
        [Tooltip("Rate (1/s) at which tyres pull lateral speed to zero when gripping.")]
        public float latGrip = 9f;
        [Tooltip("Same rate while fully drifting.")]
        public float driftLatGrip = 1.8f;
        [Tooltip("How fast the yaw rate follows its target, 1/s.")]
        public float yawResponse = 10f;
        [Tooltip("Max yaw rate, rad/s.")]
        public float maxYawRate = 3.2f;
        [Tooltip("Extra grip at downforceSpeed as a fraction (0.08 = +8 %).")]
        public float downforce;
        [Tooltip("Speed (m/s) at which downforce is reached; 0 = legacy default (80 m/s, may grow to 1.6×).")]
        public float downforceSpeed;

        [Header("Drift")]
        [Tooltip("Target slip angle of a full drift, rad.")]
        public float driftAngle = 0.75f;
        [Tooltip("Yaw push per rad of missing drift angle.")]
        public float driftYawGain = 3.5f;
        [Tooltip("How much throttle × steering holds an open drift.")]
        public float powerOversteer = 0.7f;
        [Tooltip("Lift-off oversteer impulse strength.")]
        public float liftOversteer = 0.4f;
        public float driftRise = 7f;
        public float driftFall = 2.6f;
        [Tooltip("Self-straightening when the steering is released.")]
        public float catchAssist = 3.4f;

        [Header("Engine and brakes")]
        [Tooltip("Drive force at low speed, N.")]
        public float launchForce = 5400f;
        [Tooltip("Engine power, W. Top speed follows from power against drag.")]
        public float power = 135000f;
        [Tooltip("Brake deceleration in g.")]
        public float brakeG = 0.98f;
        [Tooltip("Air drag coefficient, N/(m/s)².")]
        public float drag = 0.6f;
        [Tooltip("Rolling resistance, m/s².")]
        public float rollDecel = 0.25f;

        [Header("Nitro")]
        public float boostAccel = 2f;
        [Tooltip("Seconds of full burn from a full tank.")]
        public float boostCapacity = 5f;
        [Tooltip("Passive refill per second (fraction of tank).")]
        public float boostRefill = 0.04f;

        [Header("Steering")]
        [Tooltip("Full wheel lock at standstill, rad.")]
        public float steerAngle = 0.61f;
        public float steerRate = 5.2f;
        public float steerReturn = 7f;
        [Tooltip("Speed (m/s) at which the lock halves.")]
        public float steerFalloff = 40f;

        public ArcadeSpec Clone() => (ArcadeSpec)MemberwiseClone();

        /// <summary>Top speed on flat asphalt, m/s: power = drag·v³ + mass·rollDecel·v.</summary>
        public float TopSpeed(float mass)
        {
            double low = 0, high = Math.Cbrt(power / drag);
            for (var i = 0; i < 40; i++)
            {
                var v = (low + high) / 2;
                if (drag * v * v * v + mass * rollDecel * v < power) low = v;
                else high = v;
            }
            return (float)((low + high) / 2);
        }
    }
}
