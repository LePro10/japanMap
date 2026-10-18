using System.Collections.Generic;
using JapanMap.Vehicles;
using UnityEngine;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay.Hud
{
    /// <summary>
    /// The view from the driver's seat, per car (D51, <see cref="CockpitSpec"/>): live instruments laid over the model's
    /// own gauges — round dials in the older cars, a screen in the newer ones, the display on the formula wheel — a
    /// steering wheel that turns with the road wheels (the model's, or a built sport wheel or formula yoke), gloves and
    /// sleeves that follow it, a soft light from the dash. Nothing of it may cover the road
    /// (owner 2026-10-18: "man sieht zum Teil gar nicht richtig raus … so ein Geschwindigkeitsding mitten im Screen"):
    /// the old head-up on the windscreen is gone, an optional one sits low over the bonnet. One 1024 × 256 panel texture;
    /// the screen HUD's gauge steps aside meanwhile (<see cref="GameplayHud.CockpitShowsSpeed"/>).
    /// </summary>
    public sealed class CockpitDisplay : MonoBehaviour
    {
        const int TexW = 1024, TexH = 256;

        PlayerModeController _player;
        CarCameraRig _rig;
        PanelSettings _source;
        StyleSheet _theme;
        Material _screenMat, _hudMat;

        RenderTexture _rt;
        UIDocument _doc;
        Instrument _digital;
        AnalogCluster _analog;
        Label _hudSpeed, _hudGear, _hudInfo;
        VisualElement _hudNitroFill;
        GameObject _clusterQuad, _hudQuad;
        Light _light;
        VehicleController _bound;
        CockpitSpec _spec = new();
        Transform _wheel;
        Quaternion _wheelRest;
        Vector3 _wheelAxis = Vector3.forward;
        float _maxSpeedShown = 240f;
        // Shown only from the seat; the built wheel stays in every view (it replaces the model's).
        readonly List<GameObject> _seatOnly = new();
        readonly List<GameObject> _built = new();
        readonly List<Renderer> _modelWheel = new();
        Transform _movedWheel;
        Vector3 _movedFrom;

        public bool Active { get; private set; }
        /// <summary>Cluster and head-up quads (tests: never over the road).</summary>
        public GameObject Cluster => _clusterQuad;
        public GameObject HeadUp => _hudQuad;
        public Transform Wheel => _wheel;
        public IReadOnlyList<GameObject> SeatParts => _seatOnly;

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
            foreach (var g in _seatOnly) if (g != null && g.activeSelf != Active) g.SetActive(Active);
            if (_light != null) _light.enabled = Active && Core.QualitySystem.Current != "Low";
            // The panel keeps its tree (disabling a UIDocument would drop it); hidden, it draws nothing new.
            if (_doc != null) _doc.rootVisualElement.style.display = Active ? DisplayStyle.Flex : DisplayStyle.None;
            if (car == null) return;
            TurnWheel(car);
            if (Active)
            {
                UpdateArms();
                Fill(car);
            }
        }

        void Rebind(VehicleController car)
        {
            _bound = car;
            foreach (var g in _seatOnly) if (g != null) Destroy(g);
            foreach (var g in _built) if (g != null) Destroy(g);
            _seatOnly.Clear();
            _built.Clear();
            foreach (var r in _modelWheel) if (r != null) r.enabled = true;
            _modelWheel.Clear();
            if (_movedWheel != null) _movedWheel.localPosition = _movedFrom;
            _movedWheel = null;
            _clusterQuad = _hudQuad = null;
            _light = null;
            _wheel = null;
            for (var i = 0; i < 2; i++) _hand[i] = _upper[i] = _fore[i] = null;
            if (car == null) return;
            if (_rig == null) _rig = FindAnyObjectByType<CarCameraRig>();
            _spec = _rig != null && _rig.Spec != null ? _rig.Spec : new CockpitSpec();
            var eyeNode = VehicleVisuals.FindPrefix(car.transform, "eye");
            var modelWheel = VehicleVisuals.FindPrefix(car.transform, "steering_wheel");
            var body = eyeNode != null && eyeNode.parent != null ? eyeNode.parent : car.transform;
            // The car's axes, not the model node's (the imported body node is rotated).
            var up = car.transform.up;
            var fwd = car.transform.forward;
            var right = car.transform.right;
            var eye = (eyeNode != null ? eyeNode.position : car.transform.TransformPoint(0f, 1.1f, 0f)) + car.transform.rotation * _spec.eyeOffset;
            var top = car.Definition != null ? car.Definition.TopSpeed : 60f;
            _maxSpeedShown = Mathf.Max(80f, Mathf.Ceil(Shown(top * 1.1f) / 20f) * 20f);

            BuildWheel(car, modelWheel, body, eye, up);
            if (_screenMat == null) return;
            EnsurePanel();
            _digital.style.display = _spec.cluster == CockpitCluster.Analog ? DisplayStyle.None : DisplayStyle.Flex;
            _analog.style.display = _spec.cluster == CockpitCluster.Analog ? DisplayStyle.Flex : DisplayStyle.None;
            BuildCluster(car, body, eye, up, fwd);
            if (_spec.headUp)
            {
                // Low over the bonnet: well under the line to the road ahead, never on it.
                var down = (_spec.pitch + 12f) * Mathf.Deg2Rad;
                var hudAt = eye + (fwd * Mathf.Cos(down) - up * Mathf.Sin(down)) * 1.15f;
                _hudQuad = Quad("CockpitHud", body, hudAt, eye, up, 0.2f, 0.1f, new Rect(0.5f, 0f, 0.5f, 1f), _hudMat != null ? _hudMat : _screenMat);
                _seatOnly.Add(_hudQuad);
            }
            if (_spec.arms) BuildArms(car, eye, up, fwd, right);
            // A soft cool fill from the driver's chest onto the wheel, the hands and the dash, so the cabin reads at night
            // (off on Low). Close to the instruments it burnt the wheel white.
            var lightGo = new GameObject("CockpitLight");
            lightGo.transform.SetParent(body, false);
            lightGo.transform.position = eye - up * 0.12f + fwd * 0.05f;
            _light = lightGo.AddComponent<Light>();
            _light.type = LightType.Point;
            _light.color = new Color(0.62f, 0.82f, 1f);
            _light.intensity = 1.1f;
            _light.range = 1.6f;
            _light.shadows = LightShadows.None;
            _light.enabled = false;
            _seatOnly.Add(lightGo);
            foreach (var g in _seatOnly) g.SetActive(false);
        }

        // ── wheel ─────────────────────────────────────────────────────────────────────────────────────────────

        void BuildWheel(VehicleController car, Transform modelWheel, Transform body, Vector3 eye, Vector3 up)
        {
            if (_spec.wheel == CockpitWheel.Model || modelWheel == null)
            {
                _wheel = modelWheel;
                if (_wheel == null) return;
                // The models' wheels reach up to the eye line: lowered a little, the road shows over the rim.
                _movedWheel = _wheel;
                _movedFrom = _wheel.localPosition;
                _wheel.position += car.transform.rotation * _spec.wheelOffset;
                _wheelRest = _wheel.localRotation;
                // The column points at the driver's chest: from the wheel towards the eye, a little down.
                _wheelAxis = _wheel.InverseTransformDirection((eye - up * 0.25f - _wheel.position).normalized);
                return;
            }
            foreach (var r in modelWheel.GetComponentsInChildren<Renderer>())
                if (r.enabled) { r.enabled = false; _modelWheel.Add(r); }
            var at = modelWheel.position + car.transform.rotation * _spec.wheelOffset;
            var go = new GameObject("CockpitWheel");
            go.transform.SetParent(body, false);
            go.transform.position = at;
            // −Z (the face) to the driver's chest, the top up.
            var column = (at - (eye - up * 0.25f)).normalized;
            go.transform.rotation = Quaternion.LookRotation(column, Vector3.ProjectOnPlane(up, column));
            go.AddComponent<MeshFilter>().sharedMesh = CockpitWheelMesh.Build(_spec.wheel, _spec.wheelSize);
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterials = new[]
            {
                Mat(car, "_tire") ?? Mat(car, "_interior"),
                Mat(car, "_carbon") ?? Mat(car, "_trim") ?? Mat(car, "_interior"),
                Mat(car, "_accent") ?? Mat(car, "_seat_accent") ?? Mat(car, "_paint"),
            };
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            _built.Add(go);
            _wheel = go.transform;
            _wheelRest = _wheel.localRotation;
            _wheelAxis = -Vector3.forward; // towards the driver, as for the model's wheel
        }

        void TurnWheel(VehicleController car)
        {
            if (_wheel == null) return;
            var deg = Mathf.Clamp(car.Telemetry.steerAngle * Mathf.Rad2Deg * _spec.wheelRatio, -_spec.wheelMax, _spec.wheelMax);
            _wheel.localRotation = _wheelRest * Quaternion.AngleAxis(deg, _wheelAxis);
        }

        static Material Mat(VehicleController car, string suffix)
        {
            foreach (var r in car.GetComponentsInChildren<Renderer>(true))
            foreach (var m in r.sharedMaterials)
                if (m != null && m.name.EndsWith(suffix)) return m;
            return null;
        }

        // ── instruments ───────────────────────────────────────────────────────────────────────────────────────

        /// <summary>The cluster quad; returns its centre (null without one).</summary>
        Vector3? BuildCluster(VehicleController car, Transform body, Vector3 eye, Vector3 up, Vector3 fwd)
        {
            if (_spec.cluster == CockpitCluster.None) return null;
            if (_spec.cluster == CockpitCluster.OnWheel && _wheel != null)
            {
                // On the wheel itself, turning with it: in the built yoke's screen bay, else just in front of the hub.
                var built = _built.Count > 0 && _wheel == _built[0].transform;
                var r = _spec.wheelSize * 0.5f;
                Vector3 at;
                if (built) at = _wheel.TransformPoint(new Vector3(0f, r * 0.02f, -0.006f));
                else at = _wheel.position + (eye - _wheel.position).normalized * 0.04f + up * 0.01f;
                var w = built ? r * 0.8f : 0.17f;
                _clusterQuad = Quad("CockpitCluster", _wheel, at, eye, up, w * _spec.clusterScale, w * 0.5f * _spec.clusterScale, new Rect(0f, 0f, 0.5f, 1f), _screenMat);
                if (built) _clusterQuad.transform.localRotation = Quaternion.identity; // flat in the yoke, facing −Z
                _seatOnly.Add(_clusterQuad);
                return at;
            }
            // Over the model's own gauges, a hair towards the eye; their width sets the size.
            Vector3 centre;
            float width;
            if (GaugeBounds(car, out var gb))
            {
                centre = gb.center;
                width = Mathf.Clamp(Mathf.Max(gb.size.x, gb.size.z), 0.16f, 0.34f);
            }
            else
            {
                var wheelAt = _wheel != null ? _wheel.position : eye + fwd * 0.62f - up * 0.22f;
                centre = wheelAt + up * 0.1f + fwd * 0.16f;
                width = 0.22f;
            }
            centre += car.transform.rotation * _spec.clusterOffset;
            centre += (eye - centre).normalized * 0.012f;
            width *= _spec.clusterScale;
            _clusterQuad = Quad("CockpitCluster", body, centre, eye, up, width, width * 0.5f, new Rect(0f, 0f, 0.5f, 1f), _screenMat);
            _seatOnly.Add(_clusterQuad);
            return centre;
        }

        /// <summary>World bounds of the model's gauge faces (material "…_gauge"), the dash screen where there is none.</summary>
        static bool GaugeBounds(VehicleController car, out Bounds b)
        {
            b = default;
            foreach (var suffix in new[] { "_gauge", "_screen" })
            {
                var found = false;
                foreach (var r in car.GetComponentsInChildren<MeshRenderer>())
                {
                    var mf = r.GetComponent<MeshFilter>();
                    if (mf == null || mf.sharedMesh == null || !mf.sharedMesh.isReadable) continue;
                    var mats = r.sharedMaterials;
                    for (var s = 0; s < mats.Length && s < mf.sharedMesh.subMeshCount; s++)
                    {
                        if (mats[s] == null || !mats[s].name.EndsWith(suffix)) continue;
                        var verts = mf.sharedMesh.vertices;
                        foreach (var i in mf.sharedMesh.GetIndices(s))
                        {
                            var p = r.transform.TransformPoint(verts[i]);
                            if (!found) { b = new Bounds(p, Vector3.zero); found = true; }
                            else b.Encapsulate(p);
                        }
                    }
                }
                if (found) return true;
            }
            return false;
        }

        // ── the driver's arms and gloves on the wheel ─────────────────────────────────────────────────────────

        readonly Transform[] _hand = new Transform[2], _upper = new Transform[2], _fore = new Transform[2];
        readonly Vector3[] _shoulderLocal = new Vector3[2];
        Transform _armBase;

        void BuildArms(VehicleController car, Vector3 eye, Vector3 up, Vector3 fwd, Vector3 right)
        {
            if (_wheel == null) return;
            // Materials from the car itself: tyre rubber for the gloves, the seat or interior trim for the sleeves.
            var glove = Mat(car, "_tire");
            var sleeve = Mat(car, "_seat") ?? Mat(car, "_interior");
            if (glove == null || sleeve == null) return;
            var built = _built.Count > 0 && _wheel == _built[0].transform;
            Vector3[] grips;
            if (built) grips = CockpitWheelMesh.Hands(_spec.wheel, _spec.wheelSize);
            else
            {
                // The model's rim: "ten to two" in the plane across the column.
                var axis = _wheel.TransformDirection(_wheelAxis);
                var upP = Vector3.ProjectOnPlane(up, axis).normalized;
                var rightP = Vector3.ProjectOnPlane(right, axis).normalized;
                var mf = _wheel.GetComponentInChildren<MeshFilter>();
                var radius = mf != null && mf.sharedMesh != null ? Mathf.Max(mf.sharedMesh.bounds.size.x, mf.sharedMesh.bounds.size.z) * 0.45f : 0.17f;
                const float a = 60f * Mathf.Deg2Rad;
                grips = new Vector3[2];
                for (var i = 0; i < 2; i++)
                {
                    var side = i == 0 ? -1f : 1f;
                    grips[i] = _wheel.InverseTransformPoint(_wheel.position + (upP * Mathf.Cos(a) + rightP * (Mathf.Sin(a) * side)) * radius + axis * 0.02f);
                }
            }
            _armBase = _wheel.parent;
            for (var i = 0; i < 2; i++)
            {
                var side = i == 0 ? -1f : 1f;
                var hand = Part(PrimitiveType.Sphere, glove, "Glove");
                hand.transform.SetParent(_wheel, false); // the hands turn with the wheel
                hand.transform.localPosition = grips[i];
                hand.transform.localRotation = Quaternion.Euler(0f, 0f, -side * 25f);
                var ws = _wheel.lossyScale;
                hand.transform.localScale = new Vector3(0.062f / ws.x, 0.09f / ws.y, 0.05f / ws.z);
                _hand[i] = hand.transform;
                _upper[i] = Part(PrimitiveType.Capsule, sleeve, "Sleeve").transform;
                _fore[i] = Part(PrimitiveType.Capsule, sleeve, "Sleeve").transform;
                _upper[i].SetParent(_armBase, true);
                _fore[i].SetParent(_armBase, true);
                // Shoulders below and behind the eye: off screen, so only the forearms reach into the picture.
                _shoulderLocal[i] = _armBase.InverseTransformPoint(eye - up * 0.3f + right * (0.2f * side) - fwd * 0.16f);
            }
            UpdateArms();
        }

        GameObject Part(PrimitiveType type, Material m, string name)
        {
            var go = GameObject.CreatePrimitive(type);
            go.name = name;
            Destroy(go.GetComponent<Collider>());
            var r = go.GetComponent<MeshRenderer>();
            r.sharedMaterial = m;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            _seatOnly.Add(go);
            return go;
        }

        void UpdateArms()
        {
            if (_armBase == null || _bound == null) return;
            var up = _bound.transform.up;
            var right = _bound.transform.right;
            for (var i = 0; i < 2; i++)
            {
                if (_hand[i] == null || _upper[i] == null) continue;
                var side = i == 0 ? -1f : 1f;
                var s = _armBase.TransformPoint(_shoulderLocal[i]);
                var h = _hand[i].position - _hand[i].up * 0.03f;
                // The elbow hangs down and out of the line shoulder–hand (a relaxed arm, not a pole into the screen).
                var e = Vector3.Lerp(s, h, 0.5f) - up * 0.12f + right * (0.09f * side);
                Limb(_upper[i], s, e, 0.085f);
                Limb(_fore[i], e, h, 0.07f);
            }
        }

        static void Limb(Transform t, Vector3 a, Vector3 b, float thick)
        {
            var d = b - a;
            t.position = a + d * 0.5f;
            t.rotation = Quaternion.FromToRotation(Vector3.up, d.normalized);
            var parentScale = t.parent != null ? t.parent.lossyScale : Vector3.one;
            t.localScale = new Vector3(thick / parentScale.x, d.magnitude * 0.5f / parentScale.y, thick / parentScale.z);
        }

        static GameObject Quad(string name, Transform parent, Vector3 at, Vector3 eye, Vector3 up, float w, float h, Rect uv, Material mat)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.position = at;
            // +Z away from the eye: the quad's face (−Z) looks at the driver.
            go.transform.rotation = Quaternion.LookRotation(at - eye, up);
            var ls = go.transform.lossyScale;
            w /= Mathf.Max(1e-4f, ls.x);
            h /= Mathf.Max(1e-4f, ls.y);
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

        // ── the panel texture ─────────────────────────────────────────────────────────────────────────────────

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
            // Left half: the cluster — a dark face with the digital instrument or the two round dials.
            var lcd = new VisualElement();
            lcd.style.width = TexW / 2;
            lcd.style.height = TexH;
            lcd.style.backgroundColor = new Color(0.012f, 0.03f, 0.045f, 1f);
            lcd.style.alignItems = Align.Center;
            lcd.style.justifyContent = Justify.Center;
            _digital = new Instrument();
            _digital.style.width = 330;
            _digital.style.height = 236;
            lcd.Add(_digital);
            _analog = new AnalogCluster();
            _analog.style.width = TexW / 2;
            _analog.style.height = TexH;
            _analog.style.position = Position.Absolute;
            lcd.Add(_analog);
            root.Add(lcd);
            // Right half: the optional head-up display — cyan on black (drawn additively, black is clear).
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

        static float Shown(float metresPerSecond) => metresPerSecond * (Core.GameOptions.Mph ? 2.23694f : 3.6f);

        void Fill(VehicleController car)
        {
            if (_doc == null) return;
            var g = car.Gearbox;
            var t = car.Telemetry;
            var speed = Core.GameOptions.Speed(t.speed);
            var gear = Gearbox.Label(g.Gear);
            if (_spec.cluster == CockpitCluster.Analog)
                _analog.Set(g.Rpm, g.Spec.redline, g.Spec.limiter, gear, Shown(t.speed), speed, Core.GameOptions.SpeedUnit, _maxSpeedShown);
            else
                _digital.Set(g.Rpm, g.Spec.redline, g.Spec.limiter, gear, speed, Core.GameOptions.SpeedUnit, t.boost, t.boosting);
            if (_hudQuad == null) return;
            if (_hudSpeed.text != speed) _hudSpeed.text = speed;
            if (_hudGear.text != gear) _hudGear.text = gear;
            _hudNitroFill.style.width = Length.Percent(Mathf.Clamp01(t.boost) * 100f);
            _hudNitroFill.style.backgroundColor = t.burst > 0f || t.boosting ? Color.white : new Color(0.4f, 0.86f, 1f);
            var guide = Map.RouteGuide.Instance;
            var info = guide != null && guide.Path.Count > 1 ? Core.GameOptions.Distance(guide.Remaining) : "";
            if (_hudInfo.text != info) _hudInfo.text = info;
        }
    }
}
