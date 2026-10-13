using System;
using System.Collections.Generic;
using JapanMap.Core;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace JapanMap.World
{
    /// <summary>
    /// Street lamps light the street (they were dark decorations, 2026-10-13; legacy NeonSystem kept 10/6/2 point lights
    /// on the nearest signs). Finds lamps by name in every place scene as it streams in, draws a soft pool of light under
    /// each (one instanced draw call, all tiers) and moves a few real point lights to the nearest ones.
    /// </summary>
    public sealed class LampLights : MonoBehaviour
    {
        [SerializeField] LampLightSettings settings;
        [SerializeField] Material poolMaterial;

        struct Lamp { public Vector3 head; public Vector3 ground; public int kind; public Scene scene; }

        readonly List<Lamp> _lamps = new();
        readonly List<Light> _lights = new();
        readonly List<List<Matrix4x4>> _pools = new();
        readonly Dictionary<int, Material> _poolMats = new();
        Mesh _quad;
        float _nextPick;
        int _lightCount;

        public int LampCount => _lamps.Count;
        public int ActiveLights { get; private set; }

        void OnEnable()
        {
            SceneManager.sceneLoaded += OnLoaded;
            SceneManager.sceneUnloaded += OnUnloaded;
            QualitySystem.TierChanged += OnTier;
            OnTier(QualitySystem.Current);
            for (var i = 0; i < SceneManager.sceneCount; i++) Scan(SceneManager.GetSceneAt(i));
        }

        void OnDisable()
        {
            SceneManager.sceneLoaded -= OnLoaded;
            SceneManager.sceneUnloaded -= OnUnloaded;
            QualitySystem.TierChanged -= OnTier;
        }

        void OnTier(string tier)
        {
            var i = Array.IndexOf(QualitySystem.Tiers, tier);
            _lightCount = settings == null ? 0 : i == 0 ? settings.lights.x : i == 2 ? settings.lights.z : settings.lights.y;
            while (_lights.Count > _lightCount)
            {
                Destroy(_lights[^1].gameObject);
                _lights.RemoveAt(_lights.Count - 1);
            }
            _nextPick = 0f;
        }

        void OnLoaded(Scene scene, LoadSceneMode _) => Scan(scene);

        void OnUnloaded(Scene scene) => _lamps.RemoveAll(l => l.scene == scene);

        void Scan(Scene scene)
        {
            if (!scene.isLoaded || settings == null) return;
            foreach (var root in scene.GetRootGameObjects())
            foreach (var t in root.GetComponentsInChildren<Transform>(true))
            {
                var kind = KindOf(t.name);
                if (kind < 0) continue;
                var k = settings.kinds[kind];
                var p = t.position;
                _lamps.Add(new Lamp { head = p + Vector3.up * k.height, ground = p, kind = kind, scene = scene });
            }
        }

        int KindOf(string name)
        {
            for (var i = 0; i < settings.kinds.Length; i++)
            {
                var prefix = settings.kinds[i].prefix;
                // Only numbered lamps (streetLamp_3405): the bare name is the group root at the origin.
                if (name.Length > prefix.Length && name[prefix.Length] == '_' && name.StartsWith(prefix, StringComparison.Ordinal)) return i;
            }
            return -1;
        }

        void LateUpdate()
        {
            var cam = Camera.main;
            if (cam == null || settings == null || _lamps.Count == 0) { ActiveLights = 0; return; }
            DrawPools(cam);
            if (Time.unscaledTime >= _nextPick)
            {
                _nextPick = Time.unscaledTime + settings.pickInterval;
                PickLights(cam.transform.position);
            }
        }

        void DrawPools(Camera cam)
        {
            if (poolMaterial == null) return;
            _quad ??= Quad();
            var cp = cam.transform.position;
            var max = settings.poolDistance * settings.poolDistance;
            while (_pools.Count < settings.kinds.Length) _pools.Add(new List<Matrix4x4>());
            foreach (var list in _pools) list.Clear();
            foreach (var l in _lamps)
            {
                if ((l.ground - cp).sqrMagnitude > max) continue;
                var r = settings.kinds[l.kind].poolRadius;
                // Slightly above the ground: the pool lies on the road (5 cm clears the road surface offset).
                _pools[l.kind].Add(Matrix4x4.TRS(l.ground + Vector3.up * 0.12f, Quaternion.identity, new Vector3(r * 2f, 1f, r * 2f)));
            }
            for (var k = 0; k < settings.kinds.Length; k++)
            {
                var list = _pools[k];
                if (list.Count == 0) continue;
                if (!_poolMats.TryGetValue(k, out var mat))
                {
                    mat = new Material(poolMaterial) { enableInstancing = true, name = $"LightPool_{settings.kinds[k].prefix}" };
                    mat.SetColor("_Color", settings.kinds[k].poolColor);
                    _poolMats[k] = mat;
                }
                var rp = new RenderParams(mat) { shadowCastingMode = ShadowCastingMode.Off, receiveShadows = false, layer = gameObject.layer };
                for (var start = 0; start < list.Count; start += 1023)
                    Graphics.RenderMeshInstanced(rp, _quad, 0, list, Mathf.Min(1023, list.Count - start), start);
            }
        }

        void PickLights(Vector3 cp)
        {
            ActiveLights = 0;
            if (_lightCount == 0) return;
            // Partial sort: the N nearest lamp heads.
            _nearest.Clear();
            for (var i = 0; i < _lamps.Count; i++)
            {
                var d = (_lamps[i].head - cp).sqrMagnitude;
                if (_nearest.Count < _lightCount) { _nearest.Add((d, i)); continue; }
                var worst = 0;
                for (var j = 1; j < _nearest.Count; j++) if (_nearest[j].d > _nearest[worst].d) worst = j;
                if (d < _nearest[worst].d) _nearest[worst] = (d, i);
            }
            while (_lights.Count < _nearest.Count)
            {
                var go = new GameObject("LampLight");
                go.transform.SetParent(transform, false);
                var light = go.AddComponent<Light>();
                light.type = LightType.Point;
                light.shadows = LightShadows.None;
                _lights.Add(light);
            }
            for (var i = 0; i < _lights.Count; i++)
            {
                var on = i < _nearest.Count;
                _lights[i].enabled = on;
                if (!on) continue;
                var lamp = _lamps[_nearest[i].i];
                var k = settings.kinds[lamp.kind];
                _lights[i].transform.position = lamp.head;
                _lights[i].color = k.lightColor;
                _lights[i].intensity = k.lightIntensity;
                _lights[i].range = k.lightRange;
                ActiveLights++;
            }
        }

        readonly List<(float d, int i)> _nearest = new();

        static Mesh Quad()
        {
            var m = new Mesh { name = "LightPoolQuad" };
            m.SetVertices(new[] { new Vector3(-0.5f, 0, -0.5f), new Vector3(-0.5f, 0, 0.5f), new Vector3(0.5f, 0, 0.5f), new Vector3(0.5f, 0, -0.5f) });
            m.SetUVs(0, new[] { new Vector2(0, 0), new Vector2(0, 1), new Vector2(1, 1), new Vector2(1, 0) });
            m.SetTriangles(new[] { 0, 1, 2, 0, 2, 3 }, 0);
            m.RecalculateBounds();
            return m;
        }
    }
}
