using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AI;

namespace JapanMap.Gameplay.Life
{
    /// <summary>
    /// Keeps a small crowd around the player (legacy CityPedestrians: "die Leute sind dort, wo der
    /// Spieler ist"): whoever is farther than <c>far</c> reappears on a pavement between <c>pop</c> and
    /// <c>near</c>, so a few dozen people fill every street the player sees. Where there is no
    /// pavement NavMesh (open country), they simply stay away.
    /// </summary>
    public sealed class PedestrianCrowd : MonoBehaviour
    {
        [SerializeField] PedestrianSettings settings;
        [SerializeField] PlayerModeController player;
        [SerializeField] Material skin;
        [Tooltip("One look per material; the crowd cycles through them.")]
        [SerializeField] Material[] tops = { };
        [SerializeField] Material[] bottoms = { };
        [Tooltip("Relocations tried per frame (spreads the NavMesh queries).")]
        [SerializeField] int relocationsPerFrame = 3;

        readonly List<Pedestrian> _people = new();
        int _next;

        public IReadOnlyList<Pedestrian> People => _people;
        public PedestrianSettings Settings => settings;

        void Start()
        {
            var tier = QualitySettings.names[QualitySettings.GetQualityLevel()];
            var count = tier == "Low" ? settings.countLow : settings.countHigh;
            for (var i = 0; i < count; i++)
            {
                var speed = Mathf.Lerp(settings.speed.x, settings.speed.y, Random.value);
                var p = Pedestrian.Build(transform, settings, skin, tops[i % tops.Length], bottoms[(i / tops.Length) % bottoms.Length], speed);
                p.gameObject.SetActive(false);
                _people.Add(p);
            }
        }

        Vector3 Focus()
        {
            if (player == null) return transform.position;
            return player.Current == PlayerModeController.Mode.Walking && player.Walker != null
                ? player.Walker.transform.position
                : player.Car != null ? player.Car.transform.position : transform.position;
        }

        void Update()
        {
            if (_people.Count == 0) return;
            var focus = Focus();
            var shadow = settings.shadowDistance * settings.shadowDistance;
            foreach (var q in _people)
                if (q.gameObject.activeSelf) q.CastShadows((q.transform.position - focus).sqrMagnitude < shadow);
            var tries = relocationsPerFrame;
            for (var n = 0; n < _people.Count && tries > 0; n++)
            {
                var p = _people[_next];
                _next = (_next + 1) % _people.Count;
                if (p.gameObject.activeSelf && (p.Knocked || Flat(p.transform.position, focus) < settings.far)) continue;
                tries--;
                if (TryPlace(focus, out var at))
                {
                    // Move first: an agent that wakes up off the NavMesh fails to attach.
                    p.transform.position = at;
                    p.gameObject.SetActive(true);
                    p.Spawn(at, Random.value * 360f);
                }
                else p.gameObject.SetActive(false);
            }
        }

        bool TryPlace(Vector3 focus, out Vector3 at)
        {
            for (var i = 0; i < 3; i++)
            {
                var r = Random.insideUnitCircle.normalized * Random.Range(settings.pop, settings.near);
                var probe = focus + new Vector3(r.x, 0f, r.y);
                // Sample from above the probe: the NavMesh may be on a terrace far above or below the focus.
                if (!NavMesh.SamplePosition(probe, out var hit, 12f, 1 << 0)) continue;
                var d = Flat(hit.position, focus);
                if (d < settings.pop || d > settings.near) continue;
                at = hit.position;
                return true;
            }
            at = default;
            return false;
        }

        static float Flat(Vector3 a, Vector3 b) => new Vector2(a.x - b.x, a.z - b.z).magnitude;
    }
}
