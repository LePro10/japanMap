using System.Collections.Generic;
using JapanMap.Core;
using JapanMap.OnFoot;
using UnityEngine;
using UnityEngine.AI;

namespace JapanMap.Gameplay.Life
{
    /// <summary>
    /// Brings the place actors to life near the player (legacy: updated only while the village is
    /// near): people as stand-in figures that work (arms), sit or stand and shift their weight;
    /// animals as PROVISIONAL box stand-ins that nod and turn a little. People can be knocked over
    /// like pedestrians (they come back to their spot). Built at start, shown within a radius.
    /// </summary>
    public sealed class PlaceActors : MonoBehaviour
    {
        [SerializeField] ActorSet data;
        [SerializeField] PedestrianSettings pedestrians;
        [SerializeField] PlayerModeController player;
        [SerializeField] Material skin;
        [SerializeField] Material[] tops = { };
        [SerializeField] Material bottom;
        [Tooltip("Actors farther than this from the player are switched off, m.")]
        [SerializeField] float showRadius = 220f;

        sealed class Live
        {
            public ActorSet.Actor actor;
            public GameObject go;
            public StandInFigure figure;
            public Transform animal;
            public Pedestrian person;
            public float phase;
            public Renderer renderer;
        }

        readonly List<Live> _live = new();
        int _cursor;

        public int Count => _live.Count;
        public ActorSet Data => data;
        public int Active { get { var n = 0; foreach (var l in _live) if (l.go.activeSelf) n++; return n; } }

        void Start()
        {
            if (data == null) return;
            var i = 0;
            foreach (var a in data.actors)
            {
                var l = new Live { actor = a, phase = i * 0.73f };
                if (IsPerson(a.kind))
                {
                    var top = tops[i % tops.Length];
                    if (NavMesh.SamplePosition(a.position, out var hit, 1.5f, 1 << 0) && a.kind != "seated")
                    {
                        // On the pavement NavMesh: a full pedestrian that just stays (and can be knocked over).
                        l.person = Pedestrian.Build(transform, pedestrians, skin, top, bottom, 1.1f);
                        l.go = l.person.gameObject;
                        l.go.transform.position = hit.position;
                        l.go.SetActive(true);
                        l.person.Spawn(hit.position, a.yaw, stay: true);
                        l.person.OwnPose = false;
                        l.figure = l.go.GetComponentInChildren<StandInFigure>();
                    }
                    else
                    {
                        l.go = new GameObject(a.kind);
                        l.go.transform.SetParent(transform, false);
                        l.go.transform.SetPositionAndRotation(a.position, Quaternion.Euler(0f, a.yaw, 0f));
                        l.figure = StandInFigure.Build(l.go.transform, pedestrians.height, skin, top, bottom);
                    }
                }
                else
                {
                    l.go = new GameObject(a.kind);
                    l.go.transform.SetParent(transform, false);
                    l.go.transform.SetPositionAndRotation(a.position, Quaternion.Euler(0f, a.yaw, 0f));
                    l.animal = Animal(a.kind, l.go.transform);
                }
                l.go.name = $"{a.place} {a.kind}";
                l.go.SetActive(false);
                _live.Add(l);
                i++;
            }
        }

        static bool IsPerson(string kind) => kind is "worker" or "fisher" or "visitor" or "seated";

        Transform Animal(string kind, Transform parent)
        {
            // PROVISIONAL: boxes in the animal's proportions until the asset session delivers animals.
            var palette = StandInPalette.For(skin);
            var b = new BoxMeshBuilder();
            switch (kind)
            {
                case "cat":
                {
                    var fur = palette.Uv(new Color(0.45f, 0.35f, 0.25f));
                    b.Box(0, new Vector3(0f, 0.18f, 0f), new Vector3(0.16f, 0.16f, 0.42f), fur);
                    b.Box(0, new Vector3(0f, 0.3f, 0.24f), new Vector3(0.13f, 0.13f, 0.13f), fur);
                    b.Box(0, new Vector3(0f, 0.27f, -0.3f), new Vector3(0.04f, 0.2f, 0.04f), fur);
                    foreach (var x in new[] { -0.06f, 0.06f }) foreach (var z in new[] { -0.15f, 0.15f })
                        b.Box(0, new Vector3(x, 0.05f, z), new Vector3(0.04f, 0.1f, 0.04f), fur);
                    break;
                }
                case "goat":
                {
                    var fur = palette.Uv(new Color(0.85f, 0.83f, 0.78f));
                    var horn = palette.Uv(new Color(0.3f, 0.27f, 0.22f));
                    b.Box(0, new Vector3(0f, 0.62f, 0f), new Vector3(0.36f, 0.4f, 0.95f), fur);
                    b.Box(0, new Vector3(0f, 0.9f, 0.55f), new Vector3(0.2f, 0.26f, 0.3f), fur);
                    b.Box(0, new Vector3(0f, 1.07f, 0.5f), new Vector3(0.18f, 0.12f, 0.05f), horn);
                    foreach (var x in new[] { -0.12f, 0.12f }) foreach (var z in new[] { -0.35f, 0.35f })
                        b.Box(0, new Vector3(x, 0.22f, z), new Vector3(0.08f, 0.44f, 0.08f), fur);
                    break;
                }
                default: // chicken
                {
                    var feather = palette.Uv(new Color(0.9f, 0.88f, 0.82f));
                    var comb = palette.Uv(new Color(0.75f, 0.12f, 0.1f));
                    b.Box(0, new Vector3(0f, 0.2f, 0f), new Vector3(0.18f, 0.18f, 0.26f), feather);
                    b.Box(0, new Vector3(0f, 0.34f, 0.12f), new Vector3(0.09f, 0.12f, 0.09f), feather);
                    b.Box(0, new Vector3(0f, 0.42f, 0.12f), new Vector3(0.03f, 0.05f, 0.07f), comb);
                    break;
                }
            }
            var go = new GameObject("Body (provisional)");
            go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = b.ToMesh(kind, skinned: false);
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = palette.Material;
            return go.transform;
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
                    else l.go.SetActive(near);
                }
            }

            var t = Time.time;
            var shadow2 = pedestrians.shadowDistance * pedestrians.shadowDistance;
            foreach (var l in _live)
            {
                if (!l.go.activeSelf) continue;
                // Same rule as the crowd: shadows only close by (each one costs a draw call per cascade).
                var mode = (l.go.transform.position - focus).sqrMagnitude < shadow2 ? UnityEngine.Rendering.ShadowCastingMode.On : UnityEngine.Rendering.ShadowCastingMode.Off;
                l.renderer ??= l.go.GetComponentInChildren<Renderer>();
                if (l.renderer != null && l.renderer.shadowCastingMode != mode) l.renderer.shadowCastingMode = mode;
                var s = t + l.phase;
                if (l.animal != null)
                {
                    // Nod and turn a little (legacy: bob ± 2 cm, sway ± 0.12 rad; chickens peck).
                    var peck = l.actor.kind == "chicken" ? Mathf.Max(0f, Mathf.Sin(s * 3f)) * 25f : Mathf.Sin(s * 1.3f) * 4f;
                    l.animal.localRotation = Quaternion.Euler(peck, Mathf.Sin(s * 0.6f) * 7f, 0f);
                }
                else if (l.figure != null && (l.person == null || !l.person.Knocked))
                {
                    switch (l.actor.kind)
                    {
                        case "seated": l.figure.PoseSeated(); break;
                        case "worker":
                        case "fisher": l.figure.PoseWork(s); break;
                        default: l.figure.PoseIdle(s); break;
                    }
                }
            }
        }
    }
}
