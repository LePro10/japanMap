using System;
using System.Collections.Generic;
using JapanMap.Core;

namespace JapanMap.Gameplay.Career
{
    /// <summary>
    /// The career's rules without the game (EditMode tests use it as is): which step is current, what is open, what a
    /// locked feature waits for. State is nothing but claims in the save (career:&lt;id&gt;), so a reload, a crash or a
    /// second device continues at the same step. A feature no step opens is open from the start (nitro, stunts).
    /// </summary>
    public sealed class CareerChain : IUnlockQuery
    {
        public const string On = "career:on";
        public const string Done = "career:done";

        readonly CareerSettings _s;
        readonly Func<string, bool> _claimed;

        public CareerChain(CareerSettings settings, Func<string, bool> claimed)
        {
            _s = settings;
            _claimed = claimed;
        }

        public CareerSettings Settings => _s;
        public int Count => _s.steps.Length;

        public static string Claim(in CareerSettings.Step s) => "career:" + s.id;

        /// <summary>The goal as the player reads it ({0} = amount).</summary>
        public static string Title(in CareerSettings.Step s) => string.Format(System.Globalization.CultureInfo.InvariantCulture, s.title ?? "", s.amount);

        /// <summary>Finished or skipped: everything open.</summary>
        public bool Complete => _claimed(Done) || Index >= Count;

        /// <summary>First step not done yet (steps finish in order); <see cref="Count"/> when all are.</summary>
        public int Index
        {
            get
            {
                for (var i = 0; i < _s.steps.Length; i++) if (!_claimed(Claim(_s.steps[i]))) return i;
                return _s.steps.Length;
            }
        }

        public CareerSettings.Step? Current => Index < Count && !_claimed(Done) ? _s.steps[Index] : null;

        /// <summary>Chapter number (1-based) and count of the step at <paramref name="index"/>; position inside the chapter.</summary>
        public void Chapter(int index, out int chapter, out int chapters, out int first, out int size)
        {
            chapter = 0;
            chapters = 0;
            first = 0;
            size = 0;
            string last = null;
            for (var i = 0; i < _s.steps.Length; i++)
            {
                if (_s.steps[i].chapter != last)
                {
                    chapters++;
                    last = _s.steps[i].chapter;
                    if (i <= index) { chapter = chapters; first = i; }
                }
            }
            if (index >= _s.steps.Length) { chapter = chapters; return; }
            for (var i = first; i < _s.steps.Length && _s.steps[i].chapter == _s.steps[first].chapter; i++) size++;
        }

        /// <summary>The step that opens <paramref name="id"/>, or -1 when nothing does (open from the start).</summary>
        public int Opener(FeatureId id)
        {
            for (var i = 0; i < _s.steps.Length; i++)
                if (_s.steps[i].unlocks != null && Array.IndexOf(_s.steps[i].unlocks, id) >= 0) return i;
            return -1;
        }

        public bool IsUnlocked(FeatureId id)
        {
            if (Complete) return true;
            var i = Opener(id);
            return i < 0 || _claimed(Claim(_s.steps[i]));
        }

        public string Requirement(FeatureId id)
        {
            var i = Opener(id);
            return i < 0 ? "" : Title(_s.steps[i]);
        }

        public event Action Changed;

        /// <summary>A step was ticked off or the career ended: menus rebuild.</summary>
        public void Raise() => Changed?.Invoke();

        /// <summary>Sparks the career pays in all (steps + the end).</summary>
        public int TotalReward()
        {
            var n = _s.completeReward;
            foreach (var s in _s.steps) n += s.reward;
            return n;
        }

        /// <summary>What a goal needs open to be reachable at all (the chain check: no step may wait on a locked feature).</summary>
        public static FeatureId[] Needs(CareerGoal g) => g switch
        {
            CareerGoal.GarageOpen => new[] { FeatureId.Garage },
            CareerGoal.BuyTune => new[] { FeatureId.Garage, FeatureId.Tuning },
            CareerGoal.BuyPaint => new[] { FeatureId.Garage, FeatureId.Paint },
            CareerGoal.Stunt => new[] { FeatureId.Stunts },
            CareerGoal.Burst => new[] { FeatureId.Nitro },
            CareerGoal.MapOpen => new[] { FeatureId.Map },
            CareerGoal.AutoDrive => new[] { FeatureId.AutoDrive, FeatureId.Waypoints },
            CareerGoal.ReachEvent => new[] { FeatureId.Races },
            CareerGoal.FinishEvents => new[] { FeatureId.Races },
            CareerGoal.MedalTier => new[] { FeatureId.Races },
            CareerGoal.MenuPlay => new[] { FeatureId.Daily },
            CareerGoal.MenuRecords => new[] { FeatureId.Records },
            CareerGoal.Photo => new[] { FeatureId.Photo },
            CareerGoal.FastTravel => new[] { FeatureId.FastTravel, FeatureId.Map },
            CareerGoal.TestDrive => new[] { FeatureId.TestDrive, FeatureId.Garage },
            CareerGoal.OwnCars => new[] { FeatureId.CarShop, FeatureId.Garage },
            _ => Array.Empty<FeatureId>(),
        };

        /// <summary>Everything wrong with the chain: duplicate ids, a feature opened twice, a step that waits on a feature
        /// only a later step opens (a dead end), empty texts. Empty = sound.</summary>
        public List<string> Problems()
        {
            var p = new List<string>();
            var ids = new HashSet<string>();
            var opened = new Dictionary<FeatureId, int>();
            for (var i = 0; i < _s.steps.Length; i++)
            {
                var s = _s.steps[i];
                if (string.IsNullOrEmpty(s.id) || !ids.Add(s.id)) p.Add($"step {i}: id '{s.id}' empty or twice");
                if (string.IsNullOrEmpty(s.title) || string.IsNullOrEmpty(s.chapter)) p.Add($"{s.id}: title or chapter empty");
                if (s.goal != CareerGoal.IntroDone && (string.IsNullOrEmpty(s.hint) || string.IsNullOrEmpty(s.touchHint)))
                    p.Add($"{s.id}: needs a key hint and a touch hint");
                if (s.reward < 0) p.Add($"{s.id}: negative reward");
                foreach (var f in Needs(s.goal))
                {
                    var o = Opener(f);
                    if (o >= i) p.Add($"{s.id}: needs {f}, which only step {o} ({_s.steps[o].id}) opens — dead end");
                }
                if (s.unlocks == null) continue;
                foreach (var f in s.unlocks)
                {
                    if (opened.TryGetValue(f, out var before)) p.Add($"{f} opened twice ({_s.steps[before].id}, {s.id})");
                    else opened[f] = i;
                    if (_s.Info(f) == null) p.Add($"{f}: no banner text in features");
                }
            }
            return p;
        }
    }
}
