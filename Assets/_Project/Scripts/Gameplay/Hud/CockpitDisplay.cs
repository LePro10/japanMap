using JapanMap.Vehicles;
using UnityEngine;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay.Hud
{
    /// <summary>
    /// The view from the driver's seat (owner 2026-10-17: "dass man wirklich das Lenkrad sieht, vielleicht auch die
    /// Geschwindigkeitsanzeige dorthin"): a digital cluster glowing behind the steering wheel (the HUD's own
    /// <see cref="Instrument"/>, rendered by a UI Toolkit panel into a texture), a cyan head-up display floating on the
    /// windscreen (speed, gear, nitro, the distance to the goal), a soft dashboard light so the wheel reads at night,
    /// and the steering wheel turning with the hands. The screen HUD's gauge steps aside meanwhile
    /// (<see cref="GameplayHud.CockpitShowsSpeed"/>). One 1024 × 256 texture; nothing of it exists in the chase view
    /// except the turning wheel.
    /// </summary>
    public sealed class CockpitDisplay : MonoBehaviour
    {
        const int TexW = 1024, TexH = 256;
        const float WheelRatio = 11f, WheelMax = 270f;

        PlayerModeController _player;
        CarCameraRig _rig;
        PanelSettings _source;
        StyleSheet _theme;
        Material _screenMat, _hudMat;

        RenderTexture _rt;
        UIDocument _doc;
        Instrument _cluster;
        Label _hudSpeed, _hudGear, _hudInfo;
        VisualElement _hudNitroFill;
        GameObject _clusterQuad, _hudQuad;
        Light _light;
        VehicleController _bound;
        Transform _wheel;
        Quaternion _wheelRest;
        Vector3 _wheelAxis = Vector3.forward;

        public bool Active { get; private set; }

        public void Bind(PlayerModeController player, PanelSettings panel, StyleSheet theme, Material screen, Material hud)
        {
            _player = player;
            _source = panel;
            _theme = theme;
            _screenMat = screen != null ? new Material(screen) : null;
            _hudMat = hud != null ? new Material(hud) : null;
        }

        void OnDestroy()
        {
            GameplayHud.CockpitShowsSpeed = false;
            if (_rt != null) _rt.Release();
            if (_doc != null) Destroy(_doc.gameObject);
        }

        void LateUpdate()
        {
            if (_player == null) return;
            if (_rig == null) _rig = FindAnyObjectByType<CarCameraRig>();
            var car = _player.Current == PlayerModeController.Mode.Driving ? _player.Car : null;
            if (car != _bound) Rebind(car);
            Active = car != null && _rig != null && _rig.Current == CarCameraRig.Mode.Cockpit && !_player.Suspended && _screenMat != null;
            GameplayHud.CockpitShowsSpeed = Active;
            if (_clusterQuad != null && _clusterQuad.activeSelf != Active) _clusterQuad.SetActive(Active);
            if (_hudQuad != null && _hudQuad.activeSelf != Active) _hudQuad.SetActive(Active);
            if (_light != null) _light.enabled = Active;
            // The panel keeps its tree (disabling a UIDocument would drop it); hidden, it draws nothing new.
            if (_doc != null) _doc.rootVisualElement.style.display = Active ? DisplayStyle.Flex : DisplayStyle.None;
            if (car == null) return;
            TurnWheel(car);
            UpdateArms(Active);
            if (Active) Fill(car);
        }

        void Rebind(VehicleController car)
        {
            _bound = car;
            if (_clusterQuad != null) Destroy(_clusterQuad);
            if (_hudQuad != null) Destroy(_hudQuad);
            if (_light != null) Destroy(_light.gameObject);
            foreach (var g in _arms) if (g != null) Destroy(g);
            _arms.Clear();
            _wheel = null;
            if (car == null) return;
            var eye = VehicleVisuals.FindPrefix(car.transform, "eye");
            _wheel = VehicleVisuals.FindPrefix(car.transform, "steering_wheel");
            if (_wheel != null)
            {
                _wheelRest = _wheel.localRotation;
                // The column points at the driver's chest: from the wheel towards the eye, a little down.
                _wheelAxis = eye != null
                    ? _wheel.InverseTransformDirection((eye.position - car.transform.up * 0.25f - _wheel.position).normalized)
                    : ColumnAxis(_wheel);
            }
            if (eye == null || _screenMat == null) return;
            EnsurePanel();
            var body = eye.parent != null ? eye.parent : car.transform;
            // The car's axes, not the model node's (the imported body node is rotated).
            var up = car.transform.up;
            var fwd = car.transform.forward;
            // Behind the wheel's upper rim, tilted to the eye; without a wheel node, low in front of the eye.
            var wheelAt = _wheel != null ? _wheel.position : eye.position + fwd * 0.62f - up * 0.22f;
            var track = car.Definition != null && car.Definition.category.ToString() == "Track";
            Vector3 clusterAt;
            if (track && _wheel != null)
            {
                // Race car: the display sits on the wheel itself and turns with it (like a formula wheel).
                clusterAt = wheelAt + (eye.position - wheelAt).normalized * 0.04f + up * 0.01f;
                _clusterQuad = Quad("CockpitCluster", _wheel, clusterAt, eye.position, up, 0.17f, 0.085f, new Rect(0f, 0f, 0.5f, 1f), _screenMat);
            }
            else
            {
                // Road car: in the dash behind the wheel's upper rim, never closer than 0.55 m to the eye.
                clusterAt = wheelAt + up * 0.12f + fwd * 0.16f;
                var toCluster = clusterAt - eye.position;
                if (toCluster.magnitude < 0.55f) clusterAt = eye.position + toCluster.normalized * 0.55f;
                _clusterQuad = Quad("CockpitCluster", body, clusterAt, eye.position, up, 0.24f, 0.12f, new Rect(0f, 0f, 0.5f, 1f), _screenMat);
            }
            // The head-up display: small, a little below the straight-ahead view, far enough to sit on the road.
            var hudAt = eye.position + fwd * 1.3f + up * 0.03f;
            _hudQuad = Quad("CockpitHud", body, hudAt, eye.position, up, 0.26f, 0.13f, new Rect(0.5f, 0f, 0.5f, 1f), _hudMat != null ? _hudMat : _screenMat);
            BuildArms(car, eye, up, fwd);
            // A faint cool light from the instruments onto the wheel and the dash.
            var lightGo = new GameObject("CockpitLight");
            lightGo.transform.SetParent(body, false);
            lightGo.transform.position = clusterAt - fwd * 0.08f + up * 0.02f;
            _light = lightGo.AddComponent<Light>();
            _light.type = LightType.Point;
            _light.color = new Color(0.55f, 0.85f, 1f);
            _light.intensity = 0.55f;
            _light.range = 1.1f;
            _light.shadows = LightShadows.None;
            _light.enabled = false;
            _clusterQuad.SetActive(false);
            _hudQuad.SetActive(false);
        }

        // ── the driver's arms and gloves on the wheel (reference: driving games' cockpit view) ──────────────────

        readonly System.Collections.Generic.List<GameObject> _arms = new();
        readonly Transform[] _hand = new Transform[2], _arm = new Transform[2];
        readonly Vector3[] _shoulderLocal = new Vector3[2];
        Transform _armBase;

        void BuildArms(VehicleController car, Transform eye, Vector3 up, Vector3 fwd)
        {
            if (_wheel == null) return;
            // Materials from the car itself: tyre rubber for the gloves, the interior trim for the sleeves.
            Material glove = null, sleeve = null;
            foreach (var r in car.GetComponentsInChildren<Renderer>(true))
            foreach (var m in r.sharedMaterials)
            {
                if (m == null) continue;
                if (glove == null && m.name.EndsWith("_tire")) glove = m;
                if (sleeve == null && (m.name.EndsWith("_interior") || m.name.EndsWith("_seat"))) sleeve = m;
            }
            if (glove == null || sleeve == null) return;
            var right = car.transform.right;
            var axis = _wheel.TransformDirection(_wheelAxis);
            var upP = Vector3.ProjectOnPlane(up, axis).normalized;
            var rightP = Vector3.ProjectOnPlane(right, axis).normalized;
            var mf = _wheel.GetComponentInChildren<MeshFilter>();
            var radius = mf != null && mf.sharedMesh != null ? Mathf.Max(mf.sharedMesh.bounds.size.x, mf.sharedMesh.bounds.size.z) * 0.45f : 0.17f;
            _armBase = eye.parent;
            for (var i = 0; i < 2; i++)
            {
                var side = i == 0 ? -1f : 1f;
                var a = 58f * Mathf.Deg2Rad;
                var at = _wheel.position + (upP * Mathf.Cos(a) + rightP * (Mathf.Sin(a) * side)) * radius + axis * 0.025f;
                var hand = Part(PrimitiveType.Sphere, glove, "Glove");
                hand.transform.position = at;
                hand.transform.rotation = Quaternion.LookRotation(-axis, upP * Mathf.Cos(a) + rightP * (Mathf.Sin(a) * side));
                hand.transform.localScale = new Vector3(0.075f, 0.11f, 0.06f);
                hand.transform.SetParent(_wheel, true); // the hands turn with the wheel
                _hand[i] = hand.transform;
                var arm = Part(PrimitiveType.Capsule, sleeve, "Sleeve");
                arm.transform.SetParent(_armBase, true);
                _arm[i] = arm.transform;
                _shoulderLocal[i] = _armBase.InverseTransformPoint(eye.position - up * 0.42f + right * (0.22f * side) - fwd * 0.08f);
            }
        }

        GameObject Part(PrimitiveType type, Material m, string name)
        {
            var go = GameObject.CreatePrimitive(type);
            go.name = name;
            Destroy(go.GetComponent<Collider>());
            var r = go.GetComponent<MeshRenderer>();
            r.sharedMaterial = m;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            go.SetActive(false);
            _arms.Add(go);
            return go;
        }

        void UpdateArms(bool show)
        {
            foreach (var g in _arms) if (g != null && g.activeSelf != show) g.SetActive(show);
            if (!show || _armBase == null) return;
            for (var i = 0; i < 2; i++)
            {
                if (_hand[i] == null || _arm[i] == null) continue;
                var s = _armBase.TransformPoint(_shoulderLocal[i]);
                var h = _hand[i].position;
                var d = h - s;
                _arm[i].position = s + d * 0.5f;
                _arm[i].rotation = Quaternion.FromToRotation(Vector3.up, d.normalized);
                _arm[i].localScale = new Vector3(0.1f, d.magnitude * 0.5f, 0.1f);
            }
        }

        static GameObject Quad(string name, Transform parent, Vector3 at, Vector3 eye, Vector3 up, float w, float h, Rect uv, Material mat)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.position = at;
            // +Z away from the eye: the quad's face (−Z) looks at the driver.
            go.transform.rotation = Quaternion.LookRotation(at - eye, up);
            var m = new Mesh { name = name };
            m.vertices = new[] { new Vector3(-w / 2, -h / 2, 0), new Vector3(w / 2, -h / 2, 0), new Vector3(w / 2, h / 2, 0), new Vector3(-w / 2, h / 2, 0) };
            m.uv = new[] { new Vector2(uv.xMin, uv.yMin), new Vector2(uv.xMax, uv.yMin), new Vector2(uv.xMax, uv.yMax), new Vector2(uv.xMin, uv.yMax) };
            m.triangles = new[] { 0, 2, 1, 0, 3, 2 };
            m.colors = new[] { Color.white, Color.white, Color.white, Color.white }; // the particle shader multiplies by them
            m.RecalculateBounds();
            go.AddComponent<MeshFilter>().sharedMesh = m;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = mat;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            return go;
        }

        /// <summary>The wheel turns about its column: the thinnest direction of its mesh.</summary>
        static Vector3 ColumnAxis(Transform wheel)
        {
            var f = wheel.GetComponentInChildren<MeshFilter>();
            if (f == null || f.sharedMesh == null) return Vector3.forward;
            var size = f.sharedMesh.bounds.size;
            var axis = size.x <= size.y && size.x <= size.z ? Vector3.right : size.y <= size.z ? Vector3.up : Vector3.forward;
            // The mesh may sit rotated under the node: bring its axis into the node's space.
            return wheel.InverseTransformDirection(f.transform.TransformDirection(axis)).normalized;
        }

        void TurnWheel(VehicleController car)
        {
            if (_wheel == null) return;
            var deg = Mathf.Clamp(car.Telemetry.steerAngle * Mathf.Rad2Deg * WheelRatio, -WheelMax, WheelMax);
            _wheel.localRotation = _wheelRest * Quaternion.AngleAxis(deg, _wheelAxis);
        }

        void EnsurePanel()
        {
            if (_doc != null) return;
            _rt = new RenderTexture(TexW, TexH, 0, RenderTextureFormat.ARGB32) { name = "CockpitPanel", useMipMap = false };
            _rt.Create();
            // A fresh panel with the HUD's theme (a clone of a live PanelSettings shares its panel and Unity asserts).
            var ps = ScriptableObject.CreateInstance<PanelSettings>();
            if (_source != null)
            {
                ps.themeStyleSheet = _source.themeStyleSheet;
                ps.textSettings = _source.textSettings;
            }
            ps.name = "CockpitPanelSettings";
            ps.targetTexture = _rt;
            ps.scaleMode = PanelScaleMode.ConstantPixelSize;
            ps.scale = 1f;
            ps.clearColor = true;
            ps.colorClearValue = Color.clear;
            ps.sortingOrder = -50;
            // Not under the HUD: a UIDocument below another one is nested and must use its panel (Unity asserts).
            var go = new GameObject("CockpitPanel");
            _doc = go.AddComponent<UIDocument>();
            _doc.panelSettings = ps;
            _screenMat.mainTexture = _rt;
            if (_hudMat != null) _hudMat.mainTexture = _rt;
            Build();
        }

        void Build()
        {
            var root = _doc.rootVisualElement;
            root.Clear();
            if (_theme != null) root.styleSheets.Add(_theme);
            root.style.flexDirection = FlexDirection.Row;
            root.style.width = TexW;
            root.style.height = TexH;
            // Left half: the cluster — a dark LCD with the instrument.
            var lcd = new VisualElement();
            lcd.style.width = TexW / 2;
            lcd.style.height = TexH;
            lcd.style.backgroundColor = new Color(0.012f, 0.03f, 0.045f, 1f);
            lcd.style.alignItems = Align.Center;
            lcd.style.justifyContent = Justify.Center;
            _cluster = new Instrument();
            _cluster.style.width = 330;
            _cluster.style.height = 236;
            lcd.Add(_cluster);
            root.Add(lcd);
            // Right half: the head-up display — cyan on black (drawn additively, black is clear).
            var hud = new VisualElement();
            hud.style.width = TexW / 2;
            hud.style.height = TexH;
            hud.style.alignItems = Align.Center;
            hud.style.justifyContent = Justify.Center;
            var row = new VisualElement();
            row.style.flexDirection = FlexDirection.Row;
            row.style.alignItems = Align.FlexEnd;
            _hudSpeed = HudLabel(row, 118f);
            var unit = new VisualElement();
            unit.style.marginLeft = 10;
            unit.style.marginBottom = 22;
            _hudGear = HudLabel(unit, 44f);
            HudLabel(unit, 24f).text = Core.GameOptions.SpeedUnit;
            row.Add(unit);
            hud.Add(row);
            var bar = new VisualElement();
            bar.style.width = 300;
            bar.style.height = 8;
            bar.style.marginTop = 4;
            bar.style.backgroundColor = new Color(0.15f, 0.3f, 0.36f);
            _hudNitroFill = new VisualElement();
            _hudNitroFill.style.height = Length.Percent(100);
            _hudNitroFill.style.backgroundColor = new Color(0.4f, 0.86f, 1f);
            bar.Add(_hudNitroFill);
            hud.Add(bar);
            _hudInfo = HudLabel(hud, 26f);
            _hudInfo.style.marginTop = 6;
            root.Add(hud);
        }

        static Label HudLabel(VisualElement parent, float size)
        {
            var l = new Label { pickingMode = PickingMode.Ignore };
            l.style.fontSize = size;
            l.style.color = new Color(0.55f, 0.9f, 1f);
            l.style.unityTextAlign = TextAnchor.MiddleCenter;
            l.AddToClassList("jm-hud-text");
            if (size > 40f) l.AddToClassList("jm-num");
            parent.Add(l);
            return l;
        }

        void Fill(VehicleController car)
        {
            var g = car.Gearbox;
            var t = car.Telemetry;
            var speed = Core.GameOptions.Speed(t.speed);
            _cluster.Set(g.Rpm, g.Spec.redline, g.Spec.limiter, Gearbox.Label(g.Gear), speed, Core.GameOptions.SpeedUnit, t.boost, t.boosting);
            if (_hudSpeed.text != speed) _hudSpeed.text = speed;
            var gear = Gearbox.Label(g.Gear);
            if (_hudGear.text != gear) _hudGear.text = gear;
            _hudNitroFill.style.width = Length.Percent(Mathf.Clamp01(t.boost) * 100f);
            _hudNitroFill.style.backgroundColor = t.burst > 0f || t.boosting ? Color.white : new Color(0.4f, 0.86f, 1f);
            var guide = Map.RouteGuide.Instance;
            var info = guide != null && guide.Path.Count > 1 ? Core.GameOptions.Distance(guide.Remaining) : "";
            if (_hudInfo.text != info) _hudInfo.text = info;
        }
    }
}
