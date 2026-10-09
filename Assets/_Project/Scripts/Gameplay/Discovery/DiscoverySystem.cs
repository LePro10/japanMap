using System;
using System.Collections.Generic;
using JapanMap.Gameplay.Economy;
using JapanMap.Gameplay.Hud;
using JapanMap.Gameplay.Progress;
using UnityEngine;
using UnityEngine.InputSystem;

namespace JapanMap.Gameplay.Discovery
{
    /// <summary>
    /// The discovery cards in the world: a glowing token at each card, labelled buttons for the
    /// puzzles, a "E  Inspect …" prompt when the player is close, and the reward once per card.
    /// PROVISIONAL look: amber stand-in tokens and posts until the asset session delivers the props.
    /// The found set is saved (PlayerProgress).
    /// </summary>
    public sealed class DiscoverySystem : MonoBehaviour
    {
        [SerializeField] DiscoverySet set;
        [SerializeField] PlayerModeController player;
        [SerializeField] SparksWallet wallet;
        [SerializeField] GameplayHud hud;
        [Tooltip("Saved progress: found cards survive a reload and pay once (claim card:id).")]
        [SerializeField] PlayerProgress progress;
        [SerializeField] InputActionAsset actions;
        [Tooltip("Lit material the stand-in token and buttons are tinted from.")]
        [SerializeField] Material template;

        readonly HashSet<string> _found = new();
        readonly List<Transform> _tokens = new();
        readonly List<List<Transform>> _buttons = new();
        DiscoveryPuzzle[] _puzzles;
        InputAction _use;
        Mesh _tokenMesh;
        int _target = -1, _targetButton = -1;
        float _spin;

        public DiscoverySet Set => set;
        public IReadOnlyCollection<string> Found => _found;
        /// <summary>Card index, found count — for HUD, map and tests.</summary>
        public event Action<int, int> CardFound;
        /// <summary>What Use would do now ("" when nothing is in reach).</summary>
        public string Prompt { get; private set; } = "";

        void Awake()
        {
            _use = actions.FindActionMap("Player", true).FindAction("Use", true);
            _puzzles = new DiscoveryPuzzle[set.cards.Length];
            for (var i = 0; i < set.cards.Length; i++) _puzzles[i] = new DiscoveryPuzzle(set.cards[i]);
            Build();
            // Cards found in an earlier session: no token, no prompt, no second payment.
            if (progress != null && progress.Data != null)
                foreach (var id in progress.Data.discoveries) _found.Add(id);
        }

        void OnEnable()
        {
            _use.Enable();
            _use.performed += OnUse;
            if (hud != null) hud.UsePressed += Use;
        }

        void OnDisable()
        {
            _use.performed -= OnUse;
            if (hud != null) hud.UsePressed -= Use;
        }

        void OnUse(InputAction.CallbackContext _) => Use();

        void Build()
        {
            _tokenMesh = Octahedron();
            var amber = Tint(new Color(1f, 0.62f, 0.2f), 0.6f); // stronger glows white through bloom
            var post = Tint(new Color(0.85f, 0.85f, 0.8f), 0f);
            for (var i = 0; i < set.cards.Length; i++)
            {
                var c = set.cards[i];
                var token = new GameObject($"Discovery_{c.id}");
                token.transform.SetParent(transform, false);
                token.transform.position = Ground(new Vector3(c.position.x, c.ground, c.position.y)) + Vector3.up * 1.2f;
                token.transform.localScale = Vector3.one * 0.45f;
                token.AddComponent<MeshFilter>().sharedMesh = _tokenMesh;
                var mr = token.AddComponent<MeshRenderer>();
                mr.sharedMaterial = amber;
                mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                _tokens.Add(token.transform);
                var buttons = new List<Transform>();
                if (c.trigger == DiscoverySet.Trigger.Sequence)
                    for (var b = 0; b < c.buttons.Length; b++)
                    {
                        var p = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                        Destroy(p.GetComponent<Collider>());
                        p.name = $"Button_{c.id}_{c.buttons[b].label}";
                        p.transform.SetParent(token.transform.parent, false);
                        p.transform.position = Ground(set.ButtonPosition(c, b) + Vector3.up * c.ground) + Vector3.up * 0.5f;
                        p.transform.localScale = new Vector3(0.35f, 0.5f, 0.35f);
                        p.GetComponent<MeshRenderer>().sharedMaterial = post;
                        buttons.Add(p.transform);
                    }
                _buttons.Add(buttons);
            }
        }

        void Update()
        {
            if (!TryPose(out var pos, out var onFoot))
            {
                SetPrompt(-1, -1, "");
                return;
            }
            // Spin and bob the tokens near the player; hide the far ones (draw calls).
            _spin += Time.deltaTime;
            var show = set.showDistance * set.showDistance;
            for (var i = 0; i < _tokens.Count; i++)
            {
                var t = _tokens[i];
                var near = !_found.Contains(set.cards[i].id) && (t.position - pos).sqrMagnitude < show;
                if (t.gameObject.activeSelf != near) t.gameObject.SetActive(near);
                foreach (var b in _buttons[i]) if (b.gameObject.activeSelf != near) b.gameObject.SetActive(near);
                if (near) t.rotation = Quaternion.Euler(0f, _spin * 60f, 0f);
            }

            var bestCard = -1;
            var bestButton = -1;
            var best = float.PositiveInfinity;
            for (var i = 0; i < set.cards.Length; i++)
            {
                var c = set.cards[i];
                if (_found.Contains(c.id)) continue;
                var d = Flat(_tokens[i].position, pos);
                if (c.trigger == DiscoverySet.Trigger.Approach)
                {
                    if (d < (onFoot ? set.approachReach : set.approachReachCar)) Collect(i);
                    continue;
                }
                if (!onFoot) continue;
                if (d < set.useReach && d < best) { best = d; bestCard = i; bestButton = -1; }
                for (var b = 0; b < _buttons[i].Count; b++)
                {
                    var db = Flat(_buttons[i][b].position, pos);
                    if (db < set.useReach * 0.8f && db < best) { best = db; bestCard = i; bestButton = b; }
                }
            }
            if (bestCard < 0) { SetPrompt(-1, -1, ""); return; }
            var card = set.cards[bestCard];
            var text = bestButton >= 0 ? $"E  Press {card.buttons[bestButton].label}"
                : card.trigger == DiscoverySet.Trigger.Rhythm ? $"E  {card.title}"
                : card.trigger == DiscoverySet.Trigger.Sequence ? $"E  Read {card.title}"
                : $"E  Inspect {card.title}";
            SetPrompt(bestCard, bestButton, text);
        }

        void SetPrompt(int card, int button, string text)
        {
            _target = card;
            _targetButton = button;
            Prompt = text;
            if (hud != null) hud.SetPrompt(this, text);
        }

        /// <summary>Use (E, d-pad up, touch USE): inspect, read a puzzle hint, press a button.</summary>
        public void Use()
        {
            if (_target < 0) return;
            if (hud != null && hud.PromptOwner != (object)this) return; // E belongs to another prompt now
            var c = set.cards[_target];
            switch (c.trigger)
            {
                case DiscoverySet.Trigger.Inspect:
                    Collect(_target);
                    break;
                case DiscoverySet.Trigger.Sequence when _targetButton < 0:
                    Flash(c.hint);
                    break;
                case DiscoverySet.Trigger.Sequence:
                case DiscoverySet.Trigger.Rhythm:
                    var step = _puzzles[_target].Press(_targetButton, Time.time);
                    if (step == PuzzleStep.Solved) Collect(_target);
                    else if (step == PuzzleStep.Wrong) Flash($"Not quite. {c.hint}");
                    else if (c.trigger == DiscoverySet.Trigger.Rhythm) Flash($"{c.title} · {_puzzles[_target].Done}/{c.gaps.Length + 1}");
                    else Flash($"{c.buttons[_targetButton].label} · {_puzzles[_target].Done}/{c.answer.Length}");
                    break;
            }
        }

        void Collect(int i)
        {
            var c = set.cards[i];
            if (!_found.Add(c.id)) return;
            _tokens[i].gameObject.SetActive(false);
            foreach (var b in _buttons[i]) b.gameObject.SetActive(false);
            var reward = wallet != null ? wallet.Settings.discoveryReward : 0;
            var extra = string.IsNullOrEmpty(c.reward) ? "" : $" · {c.reward} unlocked";
            Toast($"Discovery {_found.Count}/{set.cards.Length} · {c.title} · +{reward} Sparks{extra}");
            if (progress != null)
            {
                progress.Data.discoveries.Add(c.id);
                if (!string.IsNullOrEmpty(c.reward)) progress.Data.decals.Add(c.reward);
                progress.Grant($"card:{c.id}", reward, c.title);
            }
            else if (wallet != null) wallet.Add(reward, c.title);
            var inRegion = 0;
            var regionTotal = 0;
            foreach (var other in set.cards)
                if (other.region == c.region)
                {
                    regionTotal++;
                    if (_found.Contains(other.id)) inRegion++;
                }
            if (inRegion == regionTotal) Toast($"Album row complete · {regionTotal}/{regionTotal} in this region");
            if (_found.Count == set.cards.Length) Toast("All discoveries · Lantern Pearl paint unlocked");
            CardFound?.Invoke(i, _found.Count);
        }

        /// <summary>Puzzle feedback: shown at once, not queued behind other toasts.</summary>
        void Flash(string text)
        {
            if (hud != null) hud.Flash(text);
        }

        void Toast(string text)
        {
            if (hud != null) hud.ShowToast(text);
        }

        bool TryPose(out Vector3 p, out bool onFoot)
        {
            onFoot = false;
            p = default;
            if (player == null) return false;
            if (player.Current == PlayerModeController.Mode.Driving && player.Car != null)
            {
                p = player.Car.transform.position;
                return true;
            }
            var w = player.Walker;
            if (w == null || !w.gameObject.activeInHierarchy) return false;
            p = w.transform.position;
            onFoot = true;
            return true;
        }

        static float Flat(Vector3 a, Vector3 b) => new Vector2(a.x - b.x, a.z - b.z).magnitude;

        static Vector3 Ground(Vector3 p)
        {
            var mask = ~JapanMap.Core.GameLayers.NotGround;
            // From just above the terrain: catches pavements and plates, never a roof.
            return Physics.Raycast(p + Vector3.up * 4f, Vector3.down, out var hit, 10f, mask, QueryTriggerInteraction.Ignore)
                ? hit.point
                : p;
        }

        Material Tint(Color color, float emission)
        {
            var m = new Material(template) { name = "StandIn_Discovery", enableInstancing = true };
            m.SetColor("_BaseColor", color);
            if (emission > 0f)
            {
                m.EnableKeyword("_EMISSION");
                m.SetColor("_EmissionColor", color * emission);
            }
            return m;
        }

        /// <summary>A small diamond: the "lantern-like token" of ASTRA §9 until the real prop exists.</summary>
        static Mesh Octahedron()
        {
            var v = new[] { Vector3.up, Vector3.down, Vector3.left * 0.6f, Vector3.right * 0.6f, Vector3.forward * 0.6f, Vector3.back * 0.6f };
            var tris = new[] { 0, 4, 3, 0, 3, 5, 0, 5, 2, 0, 2, 4, 1, 3, 4, 1, 5, 3, 1, 2, 5, 1, 4, 2 };
            var verts = new Vector3[tris.Length];
            var idx = new int[tris.Length];
            for (var i = 0; i < tris.Length; i++) { verts[i] = v[tris[i]]; idx[i] = i; }
            var m = new Mesh { name = "DiscoveryToken", vertices = verts, triangles = idx };
            m.RecalculateNormals();
            m.RecalculateBounds();
            return m;
        }
    }
}
