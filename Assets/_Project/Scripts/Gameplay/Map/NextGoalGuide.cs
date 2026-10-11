using JapanMap.Gameplay.Hud;
using JapanMap.Gameplay.Progress;
using JapanMap.Gameplay.Races;
using UnityEngine;

namespace JapanMap.Gameplay.Map
{
    /// <summary>
    /// New players should always know what to do next (CrazyGames quality guide: "Set clear goals"). The events were only
    /// named in the pause menu; while driving nothing pointed at them. After a short free drive the nearest event without
    /// a medal becomes the waypoint — the HUD arrow points there — once per finished event, until the player has finished
    /// <see cref="untilFinished"/> events. A waypoint the player set or cleared on the map wins for the rest of the session.
    /// </summary>
    public sealed class NextGoalGuide : MonoBehaviour
    {
        [SerializeField] PlayerModeController player;
        [SerializeField] PlayerProgress progress;
        [SerializeField] RaceDirector races;
        [SerializeField] MapSystem map;
        [SerializeField] GameplayHud hud;
        [Tooltip("Seconds in the car (outside events) before the next event becomes the waypoint; 0 = never.")]
        [SerializeField] float afterDriving = 25f;
        [Tooltip("Guide until the player has finished this many events.")]
        [SerializeField] int untilFinished = 2;

        float _driven;
        Vector2? _set;
        int _guidedAt = -1;
        bool _playerChose;

        /// <summary>Title of the event the guide last pointed at ("" = none yet) — tests, play scripts.</summary>
        public string LastGoal { get; private set; } = "";

        void Update()
        {
            if (afterDriving <= 0f || player == null || progress == null || progress.Data == null || races == null || map == null) return;
            // A waypoint that is not ours was the player's choice.
            if (map.Waypoint.HasValue && map.Waypoint != _set) _playerChose = true;
            if (_playerChose || map.Waypoint.HasValue) return;
            var finished = Finished();
            if (finished >= untilFinished || finished == _guidedAt) return; // one nudge per step: arriving is enough
            var car = player.Current == PlayerModeController.Mode.Driving ? player.Car : null;
            if (car == null || player.Suspended || races.Current != RaceDirector.State.Idle) return;
            _driven += Time.deltaTime;
            if (_driven < afterDriving) return;
            var index = races.Recommend(car.transform.position, progress.Data);
            if (index < 0) return;
            foreach (var (at, i) in races.Markers)
            {
                if (i != index) continue;
                _set = new Vector2(at.x, at.z);
                map.Waypoint = _set;
                _guidedAt = finished;
                _driven = 0f;
                LastGoal = races.Set.events[index].title;
                if (hud != null) hud.Flash($"Next: {LastGoal} · follow the arrow");
                Debug.Log($"[Guide] next goal {LastGoal}");
                return;
            }
        }

        int Finished()
        {
            var n = 0;
            foreach (var e in progress.Data.events) if (e.finishes > 0) n++;
            return n;
        }
    }
}
