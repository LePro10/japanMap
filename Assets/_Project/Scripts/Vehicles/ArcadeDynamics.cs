using System;

namespace JapanMap.Vehicles
{
    /// <summary>
    /// Planar driving dynamics of the arcade model, ported from legacy src/game/arcadeDynamics.ts.
    /// It computes accelerations and the yaw rate; it never moves anything — the Rigidbody does
    /// (see <see cref="VehicleController"/>). No Unity physics here, so EditMode tests run it fast.
    ///
    /// Order per step:
    ///   δ     ← steering input, rate limited
    ///   ω*    ← v·tan(δ)/L, capped at a_lat/v           (kinematics + grip)
    ///   drift ← handbrake + steering opens it, throttle·steer or lift-off keeps it
    ///   ω*   += push towards the drift angle            (the rear comes round)
    ///   ω     ← ω + (ω* − ω)(1 − e^(−yawResponse·dt))   (the nose follows)
    ///   a_lat ← −v_lat·k(drift), capped                 (tyres catch the slide)
    ///   a_lng ← drive − brake − resistances
    /// The slip angle is not computed here: when the nose turns, the world-space velocity stays
    /// put, so lateral speed appears by itself. A drift is the same expression with a lower k.
    ///
    /// Sign convention inside this class is the legacy one (ω &gt; 0 = turning left); the public
    /// surface (<see cref="YawRate"/>, <see cref="PlanarResult.yawRate"/>) is Unity's (ω &gt; 0 = right).
    /// </summary>
    public sealed class ArcadeDynamics
    {
        // Guard against P/v → ∞ at standstill; launchForce is smaller from here anyway.
        const float PowerSpeedFloor = 4f;

        ArcadeSpec _spec;
        readonly ArcadeTuning _t;
        float _looseBonus;
        float _crawlShare;
        float _driveRetain;
        float _wheelbase = 2.4f;
        float _mass = 1150f;

        float _gripSmoothed = float.NaN;
        bool _wasAirborne;
        float _landTimer;
        float _steerInput;
        float _steerAngle;
        float _throttle;
        float _lift;
        float _offTime;
        bool _liftArmed;
        float _drift;
        float _driftArm;
        float _boost = 1f;
        float _yawRate; // legacy sign
        float _pitchRate;
        float _driftSign;
        float _stuntBlend;
        float _spin;
        float _trickRemain;
        float _trickSign;
        bool _trickAir, _trickFlip, _hopPulse;
        float _kickflipWait, _kickflipSign = 1f;
        float _rollRate, _flipRate;
        float _burstT, _burstLen, _burstCharge;

        public ArcadeDynamics(ArcadeSpec spec, ArcadeTuning tuning, float looseBonus, float crawlShare = 0.5f, float driveRetain = 0.65f)
        {
            _spec = spec;
            _t = tuning;
            _looseBonus = looseBonus;
            _crawlShare = crawlShare;
            _driveRetain = driveRetain;
        }

        public ArcadeSpec Spec => _spec;
        public float Boost => _boost;
        /// <summary>A nitro burst is running.</summary>
        public bool Bursting => _burstLen > 0f;
        public float Drift => _drift;
        public float SteerAngle => _steerAngle;
        public float Grip => _gripSmoothed;

        /// <summary>Yaw rate in Unity convention (positive = right). Set it after a collision changed it.</summary>
        public float YawRate
        {
            get => -_yawRate;
            set => _yawRate = -value;
        }

        public void SetSpec(ArcadeSpec spec, float looseBonus)
        {
            _spec = spec;
            _looseBonus = looseBonus;
        }

        public void SetChassis(float wheelbase, float mass)
        {
            _wheelbase = Math.Max(1f, wheelbase);
            _mass = Math.Max(1f, mass);
        }

        public void AddBoost(float amount) => _boost = Math.Min(1f, _boost + amount);

        /// <summary>Back to rest when the car is placed. Nitro stays: a respawn should not punish twice.</summary>
        public void Reset()
        {
            _steerInput = _steerAngle = _throttle = _lift = _offTime = 0f;
            _liftArmed = false;
            _drift = _driftArm = _yawRate = _pitchRate = _driftSign = 0f;
            _gripSmoothed = float.NaN;
            _wasAirborne = false;
            _landTimer = _stuntBlend = _spin = _trickRemain = _trickSign = _rollRate = _flipRate = 0f;
            _trickAir = _trickFlip = _hopPulse = false;
            _kickflipWait = 0f;
            _burstT = _burstLen = _burstCharge = 0f;
        }

        public PlanarResult Step(float dt, in DriveInput input, in PlanarEnv env)
        {
            var spec = _spec;
            var t = _t;
            var speed = Hypot(env.vLong, env.vLat);

            // ── Surface ──────────────────────────────────────────────────────
            var surfaceGrip = t.surfaceGrip[env.surface];
            if (env.surface == Surface.Gravel) surfaceGrip *= _looseBonus;
            // Aquaplaning only on asphalt; in water the surface already is water.
            if (env.surface == Surface.Asphalt)
            {
                var wet = Math.Min(1f, env.waterDepth / t.aquaplaneDepth);
                surfaceGrip *= 1f - wet * t.aquaplaneLoss;
            }
            surfaceGrip = Math.Max(0.05f, surfaceGrip);
            if (float.IsNaN(_gripSmoothed)) _gripSmoothed = surfaceGrip;
            else _gripSmoothed += (surfaceGrip - _gripSmoothed) * (1f - MathF.Exp(-dt / t.gripBlend));
            var grip = Math.Max(0.05f, _gripSmoothed) * env.support;
            var latMul = 1f + (t.circuitLateral - 1f) * env.circuit;

            // ── Steering ─────────────────────────────────────────────────────
            SteerStep(dt, input.steer);
            _steerAngle = _steerInput * LockAngle(Math.Abs(env.vLong));

            // ── Throttle ramp (short: the friction circle caps it anyway) ───
            var gasStep = t.throttleRate * dt;
            _throttle += Clamp(Clamp01(input.throttle) - _throttle, -gasStep, gasStep);

            // ── Drift state: something the player triggers, not a side effect ─
            var fastEnough = speed > t.driftMinSpeed;
            _driftArm = input.handbrake ? t.driftArmWindow : Math.Max(0f, _driftArm - dt);
            // Threshold measured in legacy P22: without it every throttle-on corner became a drift.
            var provocation = fastEnough && env.vLong > 0f
                ? _throttle * Math.Abs(input.steer) * (env.surface == Surface.Asphalt ? 1f : 1.35f)
                : 0f;
            var powerSlide = Clamp01((provocation - 0.45f) / 0.45f) * spec.powerOversteer;

            // ── Lift-off: a decaying impulse triggered by a closed throttle in a bend ─
            var cornering = fastEnough && env.vLong > 0f && Math.Abs(input.steer) > t.liftMinSteer;
            if (cornering && !input.handbrake && _throttle < t.liftOffThrottle) _offTime += dt;
            else _offTime = 0f;
            if (_offTime >= t.liftOnset && !_liftArmed)
            {
                _liftArmed = true;
                _lift = Math.Abs(input.steer);
            }
            if (_throttle > t.liftRearmThrottle) _liftArmed = false;
            _lift *= MathF.Exp(-t.liftDecay * dt);
            if (_lift < 1e-3f) _lift = 0f;
            var liftSlide = _lift * spec.liftOversteer;

            var steering = Math.Abs(input.steer) >= t.driftEnterSteer;
            var armed = input.handbrake || _driftArm > 0f;
            var initiate = !env.airborne && fastEnough && armed && steering;
            var sustain = !env.airborne && fastEnough && _drift > t.driftSustain;
            var want = initiate ? 1f : sustain ? Math.Max(powerSlide, liftSlide) : 0f;

            // Double tap: remaining rotation done by motion, not by teleporting the heading.
            // Ground: steering → 360 spin, steering + brake → 180, straight → a hop (to roll from).
            // Air: barrel roll towards the steering; brake held without steering → backflip. An air trick that cannot
            // finish before touchdown is not started — no more landing on the roof or mid-roll.
            if (input.trick && (env.airborne || speed > t.stuntMinSpeed))
            {
                var steered = Math.Abs(input.steer) > 0.3f;
                var sign = Math.Abs(input.steer) > 0.1f ? Math.Sign(input.steer) : _driftSign != 0f ? _driftSign : 1f;
                // A wheel off the ground for a moment on rough grass is not a jump: tricks there are ground tricks.
                var inAir = env.airborne && !(env.timeToLand > 0f && env.timeToLand < 0.25f);
                if (inAir)
                {
                    var flip = !steered && input.brake > 0.5f;
                    var carried = _trickAir && _trickFlip == flip ? _trickRemain : 0f;
                    var total = Math.Min(carried + t.stuntTrickAngle, t.stuntTrickAngle * 2f);
                    if (AirTrickFits(total, env.timeToLand))
                    {
                        _trickSign = flip ? 1f : sign;
                        _trickAir = true;
                        _trickFlip = flip;
                        _trickRemain = total;
                        _stuntBlend = Math.Max(_stuntBlend, 0.9f);
                    }
                }
                else if (!steered)
                {
                    // Kickflip: a hop, and the barrel roll starts as soon as the wheels are off (alternating sides).
                    _hopPulse = true;
                    _kickflipWait = 0.35f;
                    _kickflipSign = -_kickflipSign;
                    _stuntBlend = Math.Max(_stuntBlend, 0.9f);
                }
                else
                {
                    _trickSign = sign;
                    _trickAir = false;
                    _trickFlip = false;
                    _trickRemain = input.brake > 0.5f ? t.stuntTrickAngle * 0.5f : t.stuntTrickAngle;
                    _drift = Math.Max(_drift, 0.62f);
                    _driftSign = sign;
                    _stuntBlend = Math.Max(_stuntBlend, 0.85f);
                }
            }
            if (_kickflipWait > 0f)
            {
                _kickflipWait -= dt;
                if (env.airborne && env.timeToLand > 0.3f && !input.trick)
                {
                    _kickflipWait = 0f;
                    if (AirTrickFits(t.stuntTrickAngle, env.timeToLand))
                    {
                        _trickAir = true;
                        _trickFlip = false;
                        _trickSign = _kickflipSign;
                        _trickRemain = t.stuntTrickAngle;
                    }
                }
            }
            var inTrick = _trickRemain > 0.12f;
            var stuntWant = (input.stunt || inTrick) && (env.airborne || steering || inTrick) &&
                            (env.airborne || _drift > 0.04f || initiate || inTrick)
                ? 1f
                : 0f;
            var exitingStunt = _stuntBlend > 0.08f && stuntWant == 0f;
            var driftRate = want > _drift ? spec.driftRise : spec.driftFall * (exitingStunt ? t.stuntExitDump : 1f);
            _drift += (want - _drift) * (1f - MathF.Exp(-driftRate * dt));
            if (_drift < 1e-3f) _drift = 0f;

            var stuntRate = stuntWant > _stuntBlend ? t.stuntEnterRate : t.stuntFall;
            _stuntBlend += (stuntWant - _stuntBlend) * (1f - MathF.Exp(-stuntRate * dt));
            if (_stuntBlend < 1e-3f) _stuntBlend = 0f;

            // ── Stunt spin: only held handbrake + steering, countersteer throws it away ─
            var spinAsk = _stuntBlend > 0.15f && !env.airborne && speed > t.stuntMinSpeed && input.handbrake &&
                          Math.Abs(input.steer) >= t.driftEnterSteer;
            var countering = _spin > 0.04f && _driftSign != 0f && Math.Abs(input.steer) >= t.driftEnterSteer &&
                             Math.Sign(input.steer) != _driftSign;
            var spinWant = spinAsk ? Math.Abs(_steerInput) : 0f;
            var spinRate = spinWant > _spin ? t.stuntSpinRise : countering ? t.stuntSpinFallCounter : t.stuntSpinFall;
            _spin += (spinWant - _spin) * (1f - MathF.Exp(-spinRate * dt));
            if (_spin < 1e-3f) _spin = 0f;

            // ── Target yaw rate ──────────────────────────────────────────────
            var aLatMax = LatAccel(grip, speed) * latMul;
            var yawTarget = YawTarget(env.vLong, env.vLat, speed, aLatMax, input);

            _rollRate = _flipRate = 0f;
            var trickFrac = _trickRemain / t.stuntTrickAngle;
            var trickEnv = MathF.Sin(MathF.PI * Math.Min(1f, Math.Max(0.07f, 1f - Math.Min(1f, trickFrac))));

            if (env.airborne)
            {
                _wasAirborne = true;
                var airYaw = t.airYaw * (1f + _stuntBlend * (t.stuntAirYaw - 1f));
                var airPitch = t.airPitch * (1f + _stuntBlend * (t.stuntAirPitch - 1f));
                _yawRate += -Math.Sign(input.steer) * Math.Abs(input.steer) * airYaw * dt;
                _yawRate *= MathF.Exp(-t.airDamping * dt);
                _pitchRate += (Clamp01(input.brake) - Clamp01(input.throttle)) * airPitch * dt;
                _pitchRate *= MathF.Exp(-t.airDamping * dt);
                if (_trickRemain > 0f && _trickAir)
                {
                    // Fast enough to finish before touchdown, never past the last degree (no overshoot to land crooked).
                    var rate = t.stuntAirRoll * (0.62f + 0.38f * trickEnv);
                    if (env.timeToLand > 0f) rate = Math.Max(rate, _trickRemain / Math.Max(0.08f, env.timeToLand - t.stuntLandMargin));
                    rate = Math.Min(Math.Min(rate, t.stuntAirRoll * t.stuntAirRateMax), _trickRemain / dt);
                    if (_trickFlip) _flipRate = rate;
                    else _rollRate = _trickSign * rate;
                    _trickRemain = Math.Max(0f, _trickRemain - rate * dt);
                    if (_trickRemain < 1e-3f) _trickRemain = 0f;
                }
            }
            else
            {
                if (_wasAirborne) _landTimer = t.gripBlend;
                _wasAirborne = false;
                _landTimer = Math.Max(0f, _landTimer - dt);
                _pitchRate *= MathF.Exp(-8f * dt);
                if (_trickRemain > 0f && !_trickAir)
                {
                    var steerHelp = 0.72f + 0.38f * Math.Abs(_steerInput);
                    var rate = t.stuntTrickYaw * (0.52f + 0.48f * trickEnv) * steerHelp;
                    // Cap the last 30° so the yaw rate does not overshoot the 360.
                    rate = Math.Min(rate, Math.Max(1.2f, _trickRemain / 0.16f));
                    if (countering)
                    {
                        _trickRemain *= MathF.Exp(-t.stuntTrickAbort * dt);
                        rate *= 0.32f;
                    }
                    yawTarget += -_trickSign * rate;
                    _trickRemain = Math.Max(0f, _trickRemain - rate * dt);
                }
                else if (_trickRemain > 0f && _trickAir)
                {
                    _trickRemain = 0f;
                }
                var landing = _landTimer > 0f;
                var spinningOut = _trickRemain > 0.4f;
                if (!landing && !spinningOut && Math.Abs(input.steer) < 0.2f && speed > 2f && !input.handbrake)
                {
                    var slipNow = MathF.Atan2(env.vLat, Math.Abs(env.vLong));
                    var catchMul = Lerp(1f, t.stuntCatch, _stuntBlend) * (1f - _spin);
                    yawTarget += -slipNow * spec.catchAssist * catchMul * Math.Min(1f, speed / 8f);
                }
                var yawFollow = landing ? spec.yawResponse * 0.25f : spec.yawResponse;
                _yawRate += (yawTarget - _yawRate) * (1f - MathF.Exp(-yawFollow * dt));
            }
            var yawCap = Lerp(spec.maxYawRate, _trickRemain > 0.2f ? t.stuntTrickYawCap : t.stuntMaxYawRate,
                Math.Max(_stuntBlend * Math.Max(_spin, 0.12f), _trickRemain > 0.2f ? 1f : 0f));
            _yawRate = Clamp(_yawRate, -yawCap, yawCap);
            _pitchRate = Clamp(_pitchRate, -2.5f, 2.5f);
            _rollRate = Clamp(_rollRate, -14f, 14f);
            _flipRate = Clamp(_flipRate, -14f, 14f);

            // ── Lateral: tyres pull lateral speed to zero, rate k, at most aLatMax ─
            var stuntK = Lerp(t.stuntLatGrip, t.stuntSpinLatGrip, _spin);
            var k = Lerp(spec.latGrip, spec.driftLatGrip, _drift) * grip * latMul * Lerp(1f, stuntK, _stuntBlend) *
                    (_burstLen > 0f ? t.burstLatGrip : 1f);
            // A spinning car keeps sliding where it went: the tyres barely pull the travel round with the nose.
            if (!env.airborne && !_trickAir && _trickRemain > 0.3f) k *= t.stuntTrickLatGrip;
            var accelLat = env.airborne ? 0f : -env.vLat * (1f - MathF.Exp(-k * dt)) / dt;
            var latBudget = aLatMax * (1f - 0.25f * _drift);
            accelLat = Clamp(accelLat, -latBudget, latBudget);

            // ── Longitudinal ─────────────────────────────────────────────────
            var lng = Longitudinal(input, env, grip, dt);
            var accelLong = lng.accel + BurstStep(dt, input, env);

            // Static friction at standstill holds the car on a slope. Not in reverse: brake at
            // standstill engages reverse, and holding against it would leave the car stuck (legacy fix).
            // Unlike legacy, the slope term is part of what is held: gravity acts on the body here.
            if (!env.airborne && !lng.reverse && _throttle <= 0.02f && (input.brake > 0.5f || input.handbrake) &&
                speed < t.staticHoldSpeed)
            {
                var hold = grip * ArcadeTuning.Gravity;
                accelLong += Clamp(-env.vLong / dt - env.slopeAccel - accelLong, -hold, hold);
            }

            // ── Readouts ─────────────────────────────────────────────────────
            var slip = speed > 1.5f ? MathF.Atan2(env.vLat, Math.Abs(env.vLong)) : 0f;
            var slipAmount = Math.Min(1f, Math.Abs(slip) / t.driftMaxAngle);
            var skid = env.airborne
                ? 0f
                : Math.Max(
                    Math.Abs(slip) > t.driftScoreAngle ? Math.Min(1f, (Math.Abs(slip) - t.driftScoreAngle) / 0.35f) : 0f,
                    Math.Max(lng.wheelspin > 1f ? Math.Min(1f, (lng.wheelspin - 1f) / 0.4f) : 0f,
                        input.handbrake && speed > t.driftMinSpeed ? 0.7f : 0f));

            // ── Nitro: burns while used, earned by drifting and airtime ────────
            if (_burstLen > 0f) { } // the tank went into the burst; nothing burns or refills until it ends
            else if (lng.boosting)
            {
                _boost = Math.Max(0f, _boost - dt / spec.boostCapacity);
            }
            else
            {
                var earn = 0f;
                if (env.airborne) earn += t.boostEarnAir;
                else if (_drift > 0.15f && slipAmount > 0.12f) earn += t.boostEarnDrift * slipAmount;
                earn += spec.boostRefill;
                _boost = Math.Min(1f, _boost + earn * dt);
            }

            return new PlanarResult
            {
                accelLong = accelLong,
                accelLat = accelLat,
                yawRate = -_yawRate,
                pitchRate = env.airborne ? _pitchRate : 0f,
                rollRate = env.airborne ? _rollRate : 0f,
                flipRate = env.airborne ? _flipRate : 0f,
                hop = TakeHop(),
                drift = _drift,
                slip = slip,
                skid = skid,
                wheelspin = lng.wheelspin,
                boosting = lng.boosting,
                boost = _boost,
                steerAngle = _steerAngle,
                stunt = _stuntBlend,
                spin = _spin,
                trick = _trickRemain / t.stuntTrickAngle,
                burst = _burstLen > 0f ? 1f - _burstT / _burstLen : 0f,
                burstCharge = _burstLen > 0f ? _burstCharge : 0f,
            };
        }

        /// <summary>
        /// Track the hand on the wheel — a normalised input, not an angle. The yaw target is its share
        /// of what is possible right now, so steering stays proportional at every speed (legacy P22).
        /// </summary>
        void SteerStep(float dt, float request)
        {
            var target = Clamp(request, -1f, 1f);
            var rate = Math.Abs(target) < Math.Abs(_steerInput) ? _spec.steerReturn : _spec.steerRate;
            if (_drift < 0.05f && Math.Abs(request) < _t.driftEnterSteer) rate = Math.Max(rate, _spec.steerReturn * 2.2f);
            var step = rate * dt;
            _steerInput += Clamp(target - _steerInput, -step, step);
        }

        float LockAngle(float speed) => _spec.steerAngle / (1f + speed / _spec.steerFalloff);

        /// <summary>Largest lateral acceleration with downforce, m/s².</summary>
        float LatAccel(float grip, float speed)
        {
            var spec = _spec;
            var hasSpeed = spec.downforceSpeed > 0f;
            var aeroSpeed = hasSpeed ? spec.downforceSpeed : 80f;
            var ratio = speed / aeroSpeed;
            var aero = 1f + spec.downforce * Math.Min(hasSpeed ? 1f : 1.6f, ratio * ratio);
            return spec.latG * ArcadeTuning.Gravity * grip * aero;
        }

        /// <summary>
        /// Kinematic yaw (v·tan δ / L), capped by grip (understeer), plus the drift push that may
        /// exceed the cap — that excess is the drift.
        /// </summary>
        float YawTarget(float vLong, float vLat, float speed, float aLatMax, in DriveInput input)
        {
            var spec = _spec;
            var t = _t;
            var kinMax = vLong * MathF.Tan(LockAngle(Math.Abs(vLong))) / _wheelbase;
            var cap = aLatMax / Math.Max(speed, t.yawCapSpeed);
            var target = -_steerInput * Math.Min(Math.Abs(kinMax), cap) * (vLong < 0f ? -1f : 1f);

            if (_drift > 0.01f && speed > t.driftMinSpeed)
            {
                // The sign comes from the steering, not the yaw rate (that would be positive feedback).
                if (Math.Abs(input.steer) > 0.1f)
                {
                    float next = Math.Sign(input.steer);
                    var againstSpin = _spin > 0.04f && _driftSign != 0f && next != _driftSign;
                    if (!againstSpin) _driftSign = next;
                }
                // Regulate the angle, not the rate: push only while below the target angle.
                var beta = -_driftSign * MathF.Atan2(vLat, Math.Max(1f, Math.Abs(vLong)));
                var holdAngle = spec.driftAngle + t.stuntExtraAngle * _stuntBlend * (1f - _spin);
                var missing = Math.Max(0f, holdAngle * _drift - beta);
                target += -_driftSign * missing * spec.driftYawGain * Math.Min(1f, speed / 12f);
            }
            else
            {
                _driftSign = 0f;
            }

            if (_spin > 0.01f && _driftSign != 0f && speed > t.stuntMinSpeed)
                target += -_driftSign * _spin * _stuntBlend * t.stuntSpinYaw;
            if (_stuntBlend > 0.05f && _spin > 0.04f && _driftSign != 0f && Math.Abs(input.steer) >= t.driftEnterSteer &&
                Math.Sign(input.steer) != _driftSign)
            {
                var slip = MathF.Atan2(vLat, Math.Max(1f, Math.Abs(vLong)));
                target += -slip * t.stuntCounterCatch * _stuntBlend;
            }
            return target;
        }

        bool TakeHop()
        {
            var h = _hopPulse;
            _hopPulse = false;
            return h;
        }

        /// <summary>An air trick of <paramref name="angle"/> rad fits when it can end stuntLandMargin before touchdown at
        /// no more than stuntAirRateMax × the normal rate. Unknown landing time (0): it fits.</summary>
        bool AirTrickFits(float angle, float timeToLand)
        {
            if (timeToLand <= 0f) return true;
            var left = timeToLand - _t.stuntLandMargin;
            return left > 0.1f && angle / left <= _t.stuntAirRoll * _t.stuntAirRateMax;
        }

        /// <summary>
        /// Nitro burst: a boost double tap dumps the whole tank into a near-instant kick (Δv over
        /// burstKickTime) and a fading push. Same total Δv budget as burning the tank slowly, but now — for
        /// the run-up to a ramp. Needs burstMinTank; scales with the tank share.
        /// </summary>
        float BurstStep(float dt, in DriveInput input, in PlanarEnv env)
        {
            var t = _t;
            if (input.burst && _burstLen <= 0f && _boost >= t.burstMinTank && env.vLong > -0.5f && input.brake < 0.5f)
            {
                _burstCharge = _boost;
                _boost = 0f;
                _burstT = 0f;
                _burstLen = t.burstDuration * (0.5f + 0.5f * _burstCharge);
            }
            if (_burstLen <= 0f) return 0f;
            _burstT += dt;
            if (_burstT >= _burstLen)
            {
                _burstT = _burstLen = _burstCharge = 0f;
                return 0f;
            }
            var frac = _burstT / _burstLen;
            var accel = _burstT <= t.burstKickTime ? t.burstKickSpeed * _burstCharge / t.burstKickTime : 0f;
            accel += t.burstAccel * _burstCharge * (1f - frac) * (1f - frac);
            return accel * (env.airborne ? t.burstAirShare : Math.Max(0.3f, env.support));
        }

        struct Longitudinal_
        {
            public float accel, wheelspin;
            public bool boosting, reverse;
        }

        Longitudinal_ Longitudinal(in DriveInput input, in PlanarEnv env, float grip, float dt)
        {
            var spec = _spec;
            var t = _t;
            if (env.airborne)
                return new Longitudinal_ { accel = -spec.drag * env.vLong * Math.Abs(env.vLong) / _mass };

            var throttle = _throttle;
            var brake = Clamp01(input.brake);
            // Brake at standstill = reverse. Handbrake + brake means "hold", never reverse (legacy fix:
            // AI cars waiting at a start line reversed off the road).
            var reverse = false;
            if (brake > 0f && !input.handbrake && env.vLong < 0.6f && throttle <= 0.02f)
            {
                reverse = true;
                throttle = brake;
                brake = 0f;
            }

            var force = 0f;
            if (throttle > 0f)
            {
                if (reverse)
                {
                    var gearing = env.surface == Surface.Asphalt ? t.reverseGearing : t.offroadReverseForce;
                    force = env.vLong > -t.reverseMaxSpeed ? -throttle * spec.launchForce * gearing : 0f;
                }
                else
                {
                    // F = min(F_launch, P/v); top speed follows from drag.
                    var v = Math.Max(Math.Abs(env.vLong), PowerSpeedFloor);
                    force = throttle * Math.Min(spec.launchForce, spec.power / v);
                }
            }

            // Support scales the nitro: on a wall it does nothing (no gluing a coupe to a cliff).
            var boosting = input.boost && _boost > 0f && _burstLen <= 0f && !reverse && env.vLong > -0.5f && throttle > 0.02f &&
                           brake < 0.05f && !input.handbrake && env.support > 0.05f;
            var boostAccel = boosting ? spec.boostAccel * env.support : 0f;

            // The brake may exceed the grip limit — a player who brakes wants to stop.
            var preparedBrake = 1f + (t.circuitBrake - 1f) * env.circuit;
            var handbrakeBrake = Lerp(t.handbrakeBrake, t.stuntHandbrakeBrake, _stuntBlend);
            var brakeDecel = Math.Min(Math.Abs(env.vLong) / dt,
                (brake * spec.brakeG + (input.handbrake ? handbrakeBrake : 0f)) * ArcadeTuning.Gravity *
                (0.4f + 0.6f * grip) * preparedBrake);
            var brakeSign = env.vLong > 0f ? -1f : env.vLong < 0f ? 1f : 0f;

            var drag = -spec.drag * env.vLong * Math.Abs(env.vLong) / _mass;
            var rollSign = Math.Sign(env.vLong) * Math.Min(1f, Math.Abs(env.vLong) / 0.6f);
            // Ground drag proportional to speed (a fixed amount stopped cars dead in grass, legacy).
            var surfaceK = env.waterDepth > 0.05f
                ? t.surfaceDrag.water * Math.Min(1f, env.waterDepth / 0.5f)
                : t.surfaceDrag[env.surface];
            var ability = Clamp01((_looseBonus - 0.65f) / 0.2f);
            var loose = env.surface == Surface.Terrain || env.surface == Surface.Gravel;
            var dragScale = loose ? 1f - ability * t.capableDragReduction : 1f;
            var roll = -rollSign * spec.rollDecel - env.vLong * surfaceK * dragScale;

            var speed = Hypot(env.vLong, env.vLat);
            var assistFade = 1f - Clamp01((speed - t.assistFadeStart) / (t.assistFadeEnd - t.assistFadeStart));
            var direction = reverse ? -1f : 1f;
            // Low gearing on loose slopes, through the same slope-scaled traction limit.
            var gradeAssist = env.surface != Surface.Asphalt
                ? Math.Max(0f, -env.slopeAccel * direction) * throttle * assistFade *
                  Lerp(t.gradeAssist, t.capableGradeAssist, ability) * direction
                : 0f;
            var handbrakeDrive = Lerp(t.handbrakeDrive, t.stuntHandbrakeDrive, _stuntBlend);
            var driveAccel = (force / _mass + gradeAssist) * (input.handbrake ? handbrakeDrive : 1f);
            var tractionLimit = grip * ArcadeTuning.Gravity * t.tractionG;
            // Loose ground below 50 km/h keeps a share of asphalt traction, so a road car does not stall in a meadow.
            if (env.surface != Surface.Asphalt && speed < t.driveRetainSpeed)
            {
                var floor = ArcadeTuning.Gravity * t.tractionG * _driveRetain * env.support;
                if (floor > tractionLimit) tractionLimit = floor;
            }
            var wheelspin = tractionLimit > 0.1f ? Math.Abs(driveAccel) / tractionLimit : 0f;
            var used = Clamp(driveAccel, -tractionLimit, tractionLimit);

            // Crawl assist after the traction clamp, times support: out of a meadow, not up a wall.
            var crawlAccel = 0f;
            if (env.surface != Surface.Asphalt && throttle > 0f)
            {
                var crawlT = 1f - Math.Min(1f, speed / t.crawlSpeed);
                crawlAccel = throttle * (spec.launchForce / _mass) * _crawlShare * t.crawlExtra *
                             (input.handbrake ? handbrakeDrive : 1f) * crawlT * env.support * direction;
            }

            return new Longitudinal_
            {
                accel = used + crawlAccel + boostAccel + brakeDecel * brakeSign + drag + roll,
                wheelspin = wheelspin,
                boosting = boosting,
                reverse = reverse,
            };
        }

        static float Hypot(float a, float b) => MathF.Sqrt(a * a + b * b);
        static float Clamp(float v, float min, float max) => v < min ? min : v > max ? max : v;
        static float Clamp01(float v) => v < 0f ? 0f : v > 1f ? 1f : v;
        static float Lerp(float a, float b, float t) => a + (b - a) * t;
    }
}
