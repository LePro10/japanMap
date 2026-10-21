using System;
using System.Collections.Generic;
using JapanMap.Core.Save;
using JapanMap.Gameplay.Drift;
using JapanMap.Gameplay.Economy;
using JapanMap.Gameplay.Hud;
using JapanMap.Gameplay.Progress;
using JapanMap.Gameplay.Regions;
using JapanMap.Gameplay.Stunts;
using JapanMap.Vehicles;
using UnityEngine;

namespace JapanMap.Gameplay.Records
{
    /// <summary>
    /// The player's driving records (ASTRA §11, owner's TODO "Analytics"): top road speed held 0.5 s, valid airtime
    /// and jump distance (clean landing only), longest banked drift chain, driving distance. Each record is saved at
    /// once; the milestones pay 100 Sparks once each (ASTRA §9). A new headline record also gets a 320 × 180 card
    /// picture — taken at the next safe moment (car standing still), never at the record frame itself.
    /// Only the player's own selected car counts: event loans and test drives make no records (ASTRA §9).
    /// </summary>
    public sealed class RecordKeeper : MonoBehaviour
    {
        public static readonly MilestoneKind[] Headline =
            { MilestoneKind.TopSpeedKmh, MilestoneKind.AirtimeSeconds, MilestoneKind.JumpMetres, MilestoneKind.BankedChain, MilestoneKind.DistanceKm };

        [SerializeField] PlayerProgress progress;
        [SerializeField] PlayerModeController player;
        [SerializeField] StuntScorer stunts;
        [SerializeField] DriftScorer drift;
        [SerializeField] RegionWatch regions;
        [SerializeField] GameplayHud hud;
        [Tooltip("Card picture size (ASTRA §11: 320 × 180).")]
        [SerializeField] Vector2Int cardSize = new(320, 180);
        [Tooltip("JPEG quality of a card picture (≈ 10–15 KB each in the save store).")]
        [SerializeField] int cardQuality = 75;
        [Tooltip("A higher top speed is announced only this much above the last announcement, km/h (no toast flood).")]
        [SerializeField] float speedToastStep = 10f;
        [Tooltip("A record is announced (toast, card picture) only from: top speed km/h, airtime s, jump m, drift chain " +
                 "points — \"New record · Top speed 10 km/h\" in the first seconds was noise (2026-10-13). Still saved below.")]
        [SerializeField] Vector4 announceFrom = new(80f, 1f, 12f, 1500f);

        readonly Queue<(float t, float kmh)> _speeds = new();
        readonly HashSet<MilestoneKind> _pendingCards = new();
        float _still, _lastSpeedToast;
        float _distanceMetres;

        public const string CardKeyPrefix = "japanmap.card.";
        /// <summary>kind, value — after a record is saved (tests, HUD).</summary>
        public event Action<MilestoneKind, float> NewRecord;
        public int CardsTaken { get; private set; }

        EconomySettings Economy => progress != null && progress.Wallet != null ? progress.Wallet.Settings : null;
        DrivingRecords Data => progress.Data.records;

        void OnEnable()
        {
            if (stunts != null) stunts.Scored += OnStunt;
            if (drift != null) drift.ChainEnded += OnChain;
        }

        void OnDisable()
        {
            if (stunts != null) stunts.Scored -= OnStunt;
            if (drift != null) drift.ChainEnded -= OnChain;
        }

        void Start()
        {
            if (progress != null && progress.Data != null) _lastSpeedToast = Data.topKmh;
        }

        /// <summary>The player drives their own selected car (not a loan, not in a menu).</summary>
        bool Counting(out VehicleController car)
        {
            car = player != null && player.Current == PlayerModeController.Mode.Driving ? player.Car : null;
            return car != null && progress != null && progress.Data != null && !player.Suspended
                   && car.Definition.id == progress.Data.selectedCar && Time.timeScale > 0f;
        }

        void FixedUpdate()
        {
            if (!Counting(out var car)) { _speeds.Clear(); return; }
            var t = car.Telemetry;
            var kmh = t.speed * 3.6f;
            var onRoad = !t.airborne && t.groundedWheels >= 3;
            if (onRoad) _distanceMetres += t.speed * Time.fixedDeltaTime;
            // Held speed: the lowest speed of the last 0.5 s on the ground (ASTRA: 0.5 s on a traversable surface).
            var hold = Economy != null ? Economy.speedHoldSeconds : 0.5f;
            var now = Time.fixedTime;
            if (!onRoad) _speeds.Clear();
            else _speeds.Enqueue((now, kmh));
            while (_speeds.Count > 0 && now - _speeds.Peek().t > hold) _speeds.Dequeue();
            if (_speeds.Count > 0 && now - _speeds.Peek().t >= hold - Time.fixedDeltaTime * 1.5f)
            {
                var held = float.MaxValue;
                foreach (var s in _speeds) held = Mathf.Min(held, s.kmh);
                if (held > Data.topKmh + 0.5f) Set(MilestoneKind.TopSpeedKmh, held, held >= _lastSpeedToast + speedToastStep);
            }
        }

        void Update()
        {
            if (progress == null || progress.Data == null) return;
            // Distance is booked every 500 m: a record, but not a save every few seconds.
            if (_distanceMetres >= 500f)
            {
                var km = Data.distanceKm + _distanceMetres / 1000f;
                _distanceMetres = 0f;
                Set(MilestoneKind.DistanceKm, km, false);
            }
            // Card pictures wait for a calm moment: car standing still for a second.
            if (_pendingCards.Count == 0) return;
            if (!Counting(out var car)) return;
            _still = car.Telemetry.speed < 0.8f ? _still + Time.deltaTime : 0f;
            if (_still < 1f) return;
            foreach (var kind in _pendingCards) TakeCard(kind, car);
            _pendingCards.Clear();
            progress.MarkDirty();
        }

        void OnStunt(StuntResult r)
        {
            if (!Counting(out _) || r.airtime <= 0f) return;
            if (r.airtime > Data.airtime) Set(MilestoneKind.AirtimeSeconds, r.airtime, true);
            if (r.distance > Data.jumpMetres) Set(MilestoneKind.JumpMetres, r.distance, true);
        }

        void OnChain(ChainEnd reason, float credit, float chain)
        {
            if (!Counting(out _)) return;
            if (credit > Data.bankedChain) Set(MilestoneKind.BankedChain, credit, true);
        }

        public static float Value(DrivingRecords r, MilestoneKind k) => k switch
        {
            MilestoneKind.TopSpeedKmh => r.topKmh,
            MilestoneKind.AirtimeSeconds => r.airtime,
            MilestoneKind.JumpMetres => r.jumpMetres,
            MilestoneKind.BankedChain => r.bankedChain,
            _ => r.distanceKm,
        };

        public static string Title(MilestoneKind k) => k switch
        {
            MilestoneKind.TopSpeedKmh => "Top speed",
            MilestoneKind.AirtimeSeconds => "Airtime",
            MilestoneKind.JumpMetres => "Jump distance",
            MilestoneKind.BankedChain => "Drift chain",
            _ => "Distance driven",
        };

        public static string Format(MilestoneKind k, float v) => k switch
        {
            MilestoneKind.TopSpeedKmh => $"{v:0} km/h",
            MilestoneKind.AirtimeSeconds => $"{v:0.0} s",
            MilestoneKind.JumpMetres => $"{v:0} m",
            MilestoneKind.BankedChain => $"{v:N0} pts",
            _ => $"{v:0.0} km",
        };

        /// <summary>Saves a record value, pays crossed milestones once, queues a card picture.</summary>
        void Set(MilestoneKind kind, float value, bool announce)
        {
            var before = Value(Data, kind);
            switch (kind)
            {
                case MilestoneKind.TopSpeedKmh: Data.topKmh = value; break;
                case MilestoneKind.AirtimeSeconds: Data.airtime = value; break;
                case MilestoneKind.JumpMetres: Data.jumpMetres = value; break;
                case MilestoneKind.BankedChain: Data.bankedChain = value; break;
                default: Data.distanceKm = value; break;
            }
            announce &= value >= kind switch
            {
                MilestoneKind.TopSpeedKmh => announceFrom.x,
                MilestoneKind.AirtimeSeconds => announceFrom.y,
                MilestoneKind.JumpMetres => announceFrom.z,
                MilestoneKind.BankedChain => announceFrom.w,
                _ => 0f,
            };
            if (announce && hud != null)
            {
                hud.ShowToast($"New record · {Title(kind)} {Format(kind, value)}");
                if (kind == MilestoneKind.TopSpeedKmh) _lastSpeedToast = value;
            }
            if (kind != MilestoneKind.DistanceKm && announce) _pendingCards.Add(kind);
            progress.MarkDirty();
            var e = Economy;
            if (e != null)
                foreach (var m in e.milestones)
                    if (m.kind == kind && before < m.threshold && value >= m.threshold)
                    {
                        var label = $"{Title(kind)} {Format(kind, m.threshold)}";
                        var claim = $"milestone:{kind}:{m.threshold}";
                        if (progress.Claimed(claim)) continue;
                        // Toast before the grant: it names the reward, so the HUD adds no second Sparks line.
                        hud?.ShowToast($"Milestone · {label} · +{m.reward} Sparks");
                        progress.Grant(claim, m.reward, label);
                    }
            NewRecord?.Invoke(kind, value);
        }

        /// <summary>320 × 180 picture of the main camera (no HUD — UI Toolkit draws over, not into it), as a JPEG in its own key.</summary>
        void TakeCard(MilestoneKind kind, VehicleController car)
        {
            var cam = Camera.main;
            if (cam == null) return;
            // Same picture as the game view, bloom included (Core.CameraShot).
            var tex = Core.CameraShot.Render(cam, cardSize.x, cardSize.y);
            var jpg = tex.EncodeToJPG(cardQuality);
            Destroy(tex);
            SaveStores.Current.Write(CardKeyPrefix + kind, Convert.ToBase64String(jpg));
            var cards = Data.cards;
            cards.RemoveAll(c => c.kind == kind.ToString());
            var place = regions != null && regions.Current >= 0 ? regions.Regions.regions[regions.Current].title : "";
            cards.Add(new RecordCard
            {
                kind = kind.ToString(), value = Value(Data, kind), car = car.Definition.displayName, place = place,
                at = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            });
            CardsTaken++;
        }

        /// <summary>The saved card picture of a record, or null.</summary>
        public static Texture2D LoadCard(MilestoneKind kind)
        {
            if (!SaveStores.Current.TryRead(CardKeyPrefix + kind, out var b64) || string.IsNullOrEmpty(b64)) return null;
            try
            {
                var tex = new Texture2D(2, 2);
                return tex.LoadImage(Convert.FromBase64String(b64)) ? tex : null;
            }
            catch (FormatException)
            {
                return null;
            }
        }
    }
}
