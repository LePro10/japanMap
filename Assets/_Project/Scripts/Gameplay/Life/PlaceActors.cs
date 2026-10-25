using System.Collections.Generic;
using JapanMap.Core;
using JapanMap.OnFoot;
using UnityEngine;
using UnityEngine.AI;

namespace JapanMap.Gameplay.Life
{
    /// <summary>
    /// Brings the place actors to life near the player (legacy: updated only while the village is
    /// near): people from the asset sprint playing their role's clip (work with a hammer, fish, sit,
    /// stand with a phone, sweep), animals as static models that nod and turn a little. People can be
    /// knocked over like pedestrians (they come back to their spot). Built at start, shown within a radius.
    /// </summary>
    public sealed class PlaceActors : MonoBehaviour
    {
        [SerializeField] ActorSet data;
        [SerializeField] PedestrianSettings pedestrians;
        [SerializeField] PlayerModeController player;
        FigureSet figures; // streamed (LifeContent.Figures): looks per actor kind and the animal models
        [Tooltip("Actors farther than this from the player are switched off, m.")]
        [SerializeField] float showRadius = 220f;
        [Tooltip("A seated actor stands up when something breaks this close to it (its bench), m.")]
        [SerializeField] float standUpRadius = 2.5f;

        sealed class Live
        {
            public ActorSet.Actor actor;
            public GameObject go;
            public HitoFigure figure;
            public string clip;
            public Transform animal;
            public Pedestrian person;
            public float phase;
            public Renderer[] renderers;
            public bool stood; // its seat broke: standing on the ground until the player comes back
        }

        readonly List<Live> _live = new();
        int _cursor;

        public int Count => _live.Count;
        public ActorSet Data => data;
        public int Active { get { var n = 0; foreach (var l in _live) if (l.go.activeSelf) n++; return n; } }

        void OnEnable() => Smash.SmashSystem.Broke += OnBroke;
        void OnDisable() => Smash.SmashSystem.Broke -= OnBroke;

        /// <summary>A bench broke under a seated actor: it stands up (sitting, it hung in the air where the seat was).</summary>
        void OnBroke(string kind, Vector3 at, float speed)
        {
            var r2 = standUpRadius * standUpRadius;
            foreach (var l in _live)
            {
                if (l.stood || l.figure == null || l.person != null || l.actor.kind != "seated" || !l.go.activeSelf) continue;
                var p = l.go.transform.position;
                if ((new Vector3(p.x - at.x, 0f, p.z - at.z)).sqrMagnitude > r2) continue;
                l.stood = true;
                // Facing what hit the bench.
                var away = new Vector3(at.x - p.x, 0f, at.z - p.z);
                if (away.sqrMagnitude > 0.01f) l.go.transform.rotation = Quaternion.LookRotation(away);
                l.figure.Play("Idle");
            }
        }

        /// <summary>Something solid at seat height over the spot (the actor stands on the ground, the seat is in front of its hips).</summary>
        public static bool SeatAt(Vector3 spot) =>
            Physics.CheckSphere(spot + Vector3.up * 0.4f, 0.25f, ~Core.GameLayers.NotGround, QueryTriggerInteraction.Ignore);

        void Start() => StartCoroutine(LifeContent.Load<FigureSet>(LifeContent.Figures, f =>
        {
            figures = f;
            Build();
        }));

        void Build()
        {
            if (data == null) return;
            var i = 0;
            foreach (var a in data.actors)
            {
                var l = new Live { actor = a, phase = i * 0.73f };
                // Repeatable per actor: the same fisher stands at the same quay every visit.
                var rng = new System.Random(i * 7919 + 17);
                if (IsPerson(a.kind) && figures.TryLook(a.kind, (float)rng.NextDouble(), out var look))
                {
                    var body = look.bodies[rng.Next(look.bodies.Length)];
                    l.clip = string.IsNullOrEmpty(look.clip) ? "Idle" : look.clip;
                    if (NavMesh.SamplePosition(a.position, out var hit, 1.5f, 1 << 0) && a.kind != "seated")
                    {
                        // On the pavement NavMesh: a full pedestrian that just stays (and can be knocked over).
                        l.person = Pedestrian.Build(transform, pedestrians, figures, look, body, 1.1f);
                        l.go = l.person.gameObject;
                        l.go.transform.position = hit.position;
                        l.go.SetActive(true);
                        l.person.Spawn(hit.position, a.yaw, stay: true);
                        l.person.OwnPose = false;
                        l.figure = l.person.Figure;
                    }
                    else
                    {
                        l.go = new GameObject(a.kind);
                        l.go.transform.SetParent(transform, false);
                        l.go.transform.SetPositionAndRotation(a.position, Quaternion.Euler(0f, a.yaw, 0f));
                        l.figure = HitoFigure.Spawn(figures, body, l.go.transform);
                        l.figure.Hold(look.prop);
                    }
                }
                else
                {
                    l.go = new GameObject(a.kind);
                    l.go.transform.SetParent(transform, false);
                    l.go.transform.SetPositionAndRotation(a.position, Quaternion.Euler(0f, a.yaw, 0f));
                    var prefab = figures.Animal(a.kind, (float)rng.NextDouble());
                    if (prefab != null)
                    {
                        l.animal = Instantiate(prefab, l.go.transform, false).transform;
                        foreach (var c in l.animal.GetComponentsInChildren<Collider>(true)) Destroy(c);
                    }
                }
                l.renderers = l.go.GetComponentsInChildren<Renderer>(true);
                l.go.name = $"{a.place} {a.kind}";
                l.go.SetActive(false);
                _live.Add(l);
                i++;
            }
        }

        static bool IsPerson(string kind) => kind is "worker" or "fisher" or "visitor" or "seated";

        Vector3 Focus()
        {
            if (player == null) return transform.position;
            return player.Current == PlayerModeController.Mode.Walking && player.Walker != null
                ? player.Walker.transform.position
                : player.Car != null ? player.Car.transform.position : transform.position;
        }

        void Update()
        {
            if (_live.Count == 0) return;
            // Visibility: a slice per frame.
            var focus = Focus();
            var r2 = showRadius * showRadius;
            for (var k = 0; k < 8; k++)
            {
                var l = _live[_cursor];
                _cursor = (_cursor + 1) % _live.Count;
                var near = (l.actor.position - focus).sqrMagnitude < r2;
                if (near != l.go.activeSelf)
                {
                    if (near && l.person != null && !l.person.Knocked)
                    {
                        // Back to the own spot when the player returns.
                        l.go.transform.position = l.actor.position;
                        l.go.SetActive(true);
                        if (NavMesh.SamplePosition(l.actor.position, out var hit, 1.5f, 1 << 0)) l.person.Spawn(hit.position, l.actor.yaw, stay: true);
                    }
                    else
                    {
                        // Back on its bench when the player returns — once the bench is back.
                        if (near && l.stood && SeatAt(l.actor.position))
                        {
                            l.stood = false;
                            l.go.transform.SetPositionAndRotation(l.actor.position, Quaternion.Euler(0f, l.actor.yaw, 0f));
                        }
                        l.go.SetActive(near);
                    }
                }
            }

            var t = Time.time;
            var shadow2 = pedestrians.shadowDistance * pedestrians.shadowDistance;
            foreach (var l in _live)
            {
                if (!l.go.activeSelf) continue;
                // Same rule as the crowd: shadows only close by (each one costs a draw call per cascade).
                var near = (l.go.transform.position - focus).sqrMagnitude < shadow2;
                if (l.figure != null) l.figure.CastShadows(near);
                else
                {
                    var mode = near ? UnityEngine.Rendering.ShadowCastingMode.On : UnityEngine.Rendering.ShadowCastingMode.Off;
                    foreach (var r in l.renderers)
                        if (r.shadowCastingMode != mode) r.shadowCastingMode = mode;
                }
                var s = t + l.phase;
                if (l.animal != null)
                {
                    // Nod and turn a little (legacy: bob ± 2 cm, sway ± 0.12 rad; chickens peck).
                    var peck = l.actor.kind == "chicken" ? Mathf.Max(0f, Mathf.Sin(s * 3f)) * 12f : Mathf.Sin(s * 1.3f) * 3f;
                    l.animal.localRotation = Quaternion.Euler(peck, Mathf.Sin(s * 0.6f) * 7f, 0f);
                }
                else if (l.figure != null && (l.person == null || !l.person.Knocked)) l.figure.Play(l.stood ? "Idle" : l.clip);
            }
        }
    }
}
