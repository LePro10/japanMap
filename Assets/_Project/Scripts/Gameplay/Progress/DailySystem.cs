using System;
using JapanMap.Gameplay.Hud;
using UnityEngine;

namespace JapanMap.Gameplay.Progress
{
    /// <summary>
    /// The daily bonus and the daily challenge (<see cref="DailySettings"/>). The bonus is paid once per local calendar
    /// day, after the first drive and a few seconds of play, growing while the player comes back day after day. The
    /// challenge is picked from the date, so everyone has the same one; progress counts only in the player's own car.
    /// </summary>
    public sealed class DailySystem : MonoBehaviour
    {
        [SerializeField] DailySettings settings;
        [SerializeField] PlayerProgress progress;
        [SerializeField] PlayerModeController player;
        [SerializeField] GameplayHud hud;
        [SerializeField] Drift.DriftScorer drift;
        [SerializeField] Stunts.StuntScorer stunts;
        [SerializeField] Races.RaceDirector races;
        [SerializeField] Discovery.DiscoverySystem discovery;

        public static DailySystem Instance { get; private set; }

        float _since;
        bool _bonusChecked;
        float _metres;

        /// <summary>False: the bonus is never paid by itself (tests that count Sparks; CheckBonus still works).</summary>
        public static bool AutoBonus = true;

        /// <summary>Overrides today's date (tests).</summary>
        public static Func<DateTime> Now = () => DateTime.Now;

        public static string Day(DateTime d) => d.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
        public string Today => Day(Now());
        public DailySettings Settings => settings;
        public DailySettings.Challenge Challenge => settings.challenges[Index(Today, settings.challenges.Length)];
        public float ChallengeProgress => Data.challengeDay == Today ? Data.challengeProgress : 0f;
        public bool ChallengeDone => Data.challengeDay == Today && Data.challengeDone;
        public int Streak => Data.dailyStreak;
        /// <summary>Time left today (the next challenge and bonus come at local midnight).</summary>
        public TimeSpan Left => Now().Date.AddDays(1) - Now();
        ProgressData Data => progress.Data;

        /// <summary>The same challenge for everyone on a day: a stable hash of the date.</summary>
        public static int Index(string day, int count)
        {
            unchecked
            {
                var h = 17;
                foreach (var c in day) h = h * 31 + c;
                return Mathf.Abs(h % Mathf.Max(1, count));
            }
        }

        void Awake() => Instance = this;
        void OnDestroy() { if (Instance == this) Instance = null; }

        void OnEnable()
        {
            if (drift != null) drift.ChainEnded += OnChain;
            if (stunts != null) stunts.Scored += OnStunt;
            if (races != null) races.Finished += OnRace;
            if (discovery != null) discovery.CardFound += OnCard;
        }

        void OnDisable()
        {
            if (drift != null) drift.ChainEnded -= OnChain;
            if (stunts != null) stunts.Scored -= OnStunt;
            if (races != null) races.Finished -= OnRace;
            if (discovery != null) discovery.CardFound -= OnCard;
        }

        bool OwnCar => player != null && player.Current == PlayerModeController.Mode.Driving && player.Car != null
                       && player.Car.Definition.id == Data.selectedCar
                       && (Garage.GarageSystem.Instance == null || !Garage.GarageSystem.Instance.TestDriving);

        void Update()
        {
            if (progress == null || Data == null || settings == null) return;
            if (Data.challengeDay != Today)
            {
                Data.challengeDay = Today;
                Data.challengeProgress = 0f;
                Data.challengeDone = false;
                progress.MarkDirty();
            }
            _since += Time.unscaledDeltaTime;
            if (AutoBonus && !_bonusChecked && _since > settings.delay && !Busy()) CheckBonus();
            if (!OwnCar || Time.timeScale <= 0f) return;
            var kmh = player.Car.Telemetry.speed * 3.6f;
            if (Challenge.goal == DailyGoal.TopSpeed) Report(kmh, max: true);
            if (Challenge.goal == DailyGoal.Distance)
            {
                _metres += player.Car.Telemetry.speed * Time.deltaTime;
                if (_metres >= 100f) { Report(_metres / 1000f, max: false); _metres = 0f; }
            }
        }

        /// <summary>The title, the intro, a menu or an event card hold the bonus back: one voice at a time.</summary>
        bool Busy()
        {
            // The wipe from START GAME into the intro too: the toast lay over the intro's title (Round 4).
            if (Core.Ui.StartFlow.Holding) return true;
            var intro = FindAnyObjectByType<Intro.FirstDrive>();
            if (intro != null && (intro.Current != Intro.FirstDrive.Beat.Off || intro.WillRun)) return true;
            return Menu.GameMenu.Instance != null && Menu.GameMenu.Instance.IsOpen;
        }

        /// <summary>Pays today's bonus if not yet paid; the streak grows when yesterday was paid too.</summary>
        public bool CheckBonus()
        {
            _bonusChecked = true;
            var today = Today;
            if (Data.dailyDay == today) return false;
            var yesterday = Day(Now().AddDays(-1));
            Data.dailyStreak = Data.dailyDay == yesterday ? Data.dailyStreak + 1 : 1;
            Data.dailyDay = today;
            var rewards = settings.streakRewards;
            var reward = rewards[Mathf.Clamp(Data.dailyStreak - 1, 0, rewards.Length - 1)];
            // Toast first: it names the reward, so the HUD skips its own "+300 Sparks · Daily drive" line (both showed at once).
            hud?.ShowToast(Data.dailyStreak > 1
                ? $"Day {Data.dailyStreak} in a row · Daily drive +{reward:N0} Sparks"
                : $"Daily drive · +{reward:N0} Sparks · come back tomorrow for more");
            progress.Grant($"daily:{today}", reward, "Daily drive");
            progress.MarkDirty();
            return true;
        }

        void OnChain(Drift.ChainEnd reason, float credit, float chain)
        {
            if (Challenge.goal == DailyGoal.DriftChain && reason != Drift.ChainEnd.Crash && OwnCar) Report(credit, max: true);
        }

        void OnStunt(Stunts.StuntResult r)
        {
            if (!OwnCar) return;
            if (Challenge.goal == DailyGoal.JumpDistance) Report(r.distance, max: true);
            if (Challenge.goal == DailyGoal.Airtime) Report(r.airtime, max: true);
        }

        void OnRace(Races.RaceDirector.Result r)
        {
            if (Challenge.goal == DailyGoal.FinishEvent && r.completed) Report(1f, max: false);
        }

        void OnCard(int index, int total)
        {
            if (Challenge.goal == DailyGoal.Discovery) Report(1f, max: false);
        }

        /// <summary>Progress towards today's challenge: the best value (max) or a running sum.</summary>
        public void Report(float value, bool max)
        {
            if (ChallengeDone || Data.challengeDay != Today) return;
            var c = Challenge;
            var before = Data.challengeProgress;
            Data.challengeProgress = max ? Mathf.Max(before, value) : before + value;
            if (Data.challengeProgress >= c.target)
            {
                Data.challengeDone = true;
                hud?.ShowToast($"Daily challenge complete · {string.Format(c.title, c.target)} · +{c.reward:N0} Sparks");
                progress.Grant($"challenge:{Today}", c.reward, "Daily challenge");
                Core.Platform.GamePlatform.Current?.HappyTime();
            }
            if (Mathf.Abs(Data.challengeProgress - before) > 0.001f) progress.MarkDirty();
        }
    }
}
