using System.Collections.Generic;
using JapanMap.Gameplay.Regions;
using JapanMap.UI;
using JapanMap.World;
using UnityEngine;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay.Map
{
    /// <summary>A pin on the map: world x/z, icon, tint, and what a tap on it shows.</summary>
    public struct MapPin
    {
        public Vector2 at;
        public Icon icon;
        public Color color;
        public float size;
        public string id;
        /// <summary>Rotation in degrees (player arrow), 0 = north.</summary>
        public float heading;
        /// <summary>Radius of a search circle around the pin, m (discovery clue); 0 = none.</summary>
        public float circle;
    }

    /// <summary>
    /// One view of the geography for both the minimap and the world map (ASTRA §10: "different views of the same
    /// geography"): a base image (land, water, region tints) baked at runtime from the terrain and the region set —
    /// no download — and the road network drawn once as vectors (white major roads, grey local, dashed ochre dirt)
    /// in world metres. Panning and zooming only move/scale that layer (cheap; no redraw). Pins are a few
    /// absolutely placed icons on top. Identical metres per pixel on x and z, north up.
    /// </summary>
    public sealed class MapView : VisualElement
    {
        static readonly Color RoadMain = new(0.957f, 0.945f, 0.918f);
        static readonly Color RoadLocal = new(0.81f, 0.84f, 0.85f);
        static readonly Color RoadDirt = new(0.77f, 0.6f, 0.36f);
        static readonly Color Outline = new(0.03f, 0.07f, 0.08f, 0.82f);
        /// <summary>Road vertex spacing on the map, m.</summary>
        const float Spacing = 8f;

        readonly VisualElement _world, _pins, _circles;
        readonly List<UiIcon> _icons = new();
        readonly List<MapPin> _pinData = new();
        readonly Rect _bounds; // world x/z extent
        Vector2 _centre;
        float _span = 480f; // metres across the view's width

        public Rect Bounds => _bounds;
        public Vector2 Centre => _centre;
        public float Span => _span;
        public IReadOnlyList<MapPin> Pins => _pinData;
        /// <summary>Tap on a pin (its id) or on empty land (world x/z).</summary>
        public System.Action<MapPin> PinTapped;

        public MapView(RoadNetwork roads, RegionSet regions, Rect bounds, Texture2D baseImage)
        {
            _bounds = bounds;
            style.overflow = Overflow.Hidden;
            style.backgroundColor = new Color(0.04f, 0.1f, 0.13f);
            _world = new VisualElement { pickingMode = PickingMode.Ignore };
            _world.style.position = Position.Absolute;
            _world.style.width = bounds.width;
            _world.style.height = bounds.height;
            _world.style.transformOrigin = new TransformOrigin(0, 0);
            if (baseImage != null) _world.style.backgroundImage = new StyleBackground(baseImage);
            Add(_world);
            if (roads != null) AddRoads(roads);
            _circles = new VisualElement { pickingMode = PickingMode.Ignore };
            _circles.style.position = Position.Absolute;
            _circles.style.left = _circles.style.top = _circles.style.right = _circles.style.bottom = 0;
            _circles.generateVisualContent += DrawCircles;
            Add(_circles);
            _pins = new VisualElement { pickingMode = PickingMode.Ignore };
            _pins.style.position = Position.Absolute;
            _pins.style.left = _pins.style.top = _pins.style.right = _pins.style.bottom = 0;
            Add(_pins);
            RegisterCallback<GeometryChangedEvent>(_ => Apply());
        }

        /// <summary>World x/z → map layer pixels (1 px = 1 m, north up).</summary>
        Vector2 Layer(Vector2 w) => new(w.x - _bounds.xMin, _bounds.yMax - w.y);

        readonly List<(VisualElement element, Rect box)> _chunks = new();

        /// <summary>
        /// Roads in chunks by area (cells of 400 m): only chunks inside the view are drawn — UI Toolkit submits clipped
        /// geometry too (measured: the whole network cost +150 k triangles per frame on the minimap). Painter2D content
        /// per element also stays well under the 65 k vertex limit.
        /// </summary>
        void AddRoads(RoadNetwork roads)
        {
            const float cell = 400f;
            var groups = new Dictionary<(int, int), List<int>>();
            for (var i = 0; i < roads.roads.Count; i++)
            {
                var pts = roads.roads[i].points;
                if (pts == null || pts.Length < 2) continue;
                var mid = pts[pts.Length / 2];
                var key = (Mathf.FloorToInt(mid.x / cell), Mathf.FloorToInt(mid.z / cell));
                if (!groups.TryGetValue(key, out var list)) groups[key] = list = new List<int>();
                list.Add(i);
            }
            foreach (var list in groups.Values)
            {
                var box = new Rect();
                var first = true;
                foreach (var i in list)
                    foreach (var q in roads.roads[i].points)
                    {
                        if (first) { box = new Rect(q.x, q.z, 0f, 0f); first = false; }
                        box.xMin = Mathf.Min(box.xMin, q.x); box.xMax = Mathf.Max(box.xMax, q.x);
                        box.yMin = Mathf.Min(box.yMin, q.z); box.yMax = Mathf.Max(box.yMax, q.z);
                    }
                var ids = list;
                var chunk = new VisualElement { pickingMode = PickingMode.Ignore };
                chunk.style.position = Position.Absolute;
                chunk.style.left = chunk.style.top = 0;
                chunk.style.width = _bounds.width;
                chunk.style.height = _bounds.height;
                chunk.generateVisualContent += ctx => DrawRoads(ctx.painter2D, roads, ids);
                _world.Add(chunk);
                _chunks.Add((chunk, box));
            }
        }

        void DrawRoads(Painter2D p, RoadNetwork roads, List<int> ids)
        {
            p.lineJoin = LineJoin.Round;
            p.lineCap = LineCap.Round;
            for (var pass = 0; pass < 2; pass++)
                foreach (var i in ids)
                {
                    var r = roads.roads[i];
                    var dirt = r.type == "dirt" || r.type == "path" || r.type == "pfad" || r.type == "gravel";
                    var main = r.width >= 9f || r.type == "highway";
                    var width = main ? 9f : dirt ? 4.5f : 6f;
                    p.strokeColor = pass == 0 ? Outline : dirt ? RoadDirt : main ? RoadMain : RoadLocal;
                    p.lineWidth = pass == 0 ? width + 5f : width;
                    p.BeginPath();
                    // A point every ~8 m: finer costs triangles on every frame (measured +100 k at one per point).
                    var prev = new Vector2(r.points[0].x, r.points[0].z);
                    p.MoveTo(Layer(prev));
                    for (var k = 1; k < r.points.Length - 1; k++)
                    {
                        var q = new Vector2(r.points[k].x, r.points[k].z);
                        if ((q - prev).sqrMagnitude < Spacing * Spacing) continue;
                        p.LineTo(Layer(q));
                        prev = q;
                    }
                    var last = r.points[^1];
                    p.LineTo(Layer(new Vector2(last.x, last.z)));
                    if (r.closed) p.ClosePath();
                    p.Stroke();
                }
        }

        /// <summary>Centre (world x/z) and the metres shown across the width.</summary>
        public void Look(Vector2 centre, float span)
        {
            _centre = centre;
            _span = Mathf.Max(20f, span);
            Apply();
        }

        public float PixelsPerMetre => contentRect.width > 1f ? contentRect.width / _span : 1f;

        void Apply()
        {
            var r = contentRect;
            if (r.width < 1f) return;
            var k = r.width / _span;
            var c = Layer(_centre);
            _world.style.scale = new Scale(new Vector3(k, k, 1f));
            _world.style.translate = new Translate(r.width * 0.5f - c.x * k, r.height * 0.5f - c.y * k);
            // Only the road chunks the view touches.
            var half = new Vector2(_span * 0.5f, _span * 0.5f * r.height / r.width) * 1.2f;
            var view = new Rect(_centre - half, half * 2f);
            foreach (var (element, box) in _chunks)
            {
                var on = view.Overlaps(box);
                if ((element.style.display == DisplayStyle.None) == on) element.style.display = on ? DisplayStyle.Flex : DisplayStyle.None;
            }
            PlacePins();
            _circles.MarkDirtyRepaint();
        }

        /// <summary>World x/z → this element's local pixels.</summary>
        public Vector2 ToLocal(Vector2 world)
        {
            var r = contentRect;
            var k = r.width / _span;
            return new Vector2(r.width * 0.5f + (world.x - _centre.x) * k, r.height * 0.5f - (world.y - _centre.y) * k);
        }

        public Vector2 ToWorld(Vector2 local)
        {
            var r = contentRect;
            var k = r.width / _span;
            return new Vector2(_centre.x + (local.x - r.width * 0.5f) / k, _centre.y - (local.y - r.height * 0.5f) / k);
        }

        public void SetPins(List<MapPin> pins)
        {
            _pinData.Clear();
            _pinData.AddRange(pins);
            while (_icons.Count < pins.Count)
            {
                var icon = new UiIcon(Icon.Diamond, 20f) { pickingMode = PickingMode.Ignore };
                icon.style.position = Position.Absolute;
                // A dark badge: icons stay readable over white roads and light terrain.
                icon.style.backgroundColor = new Color(0.024f, 0.078f, 0.1f, 0.78f);
                icon.style.paddingLeft = icon.style.paddingRight = icon.style.paddingTop = icon.style.paddingBottom = 3;
                _icons.Add(icon);
                _pins.Add(icon);
            }
            PlacePins();
        }

        void PlacePins()
        {
            var r = contentRect;
            for (var i = 0; i < _icons.Count; i++)
            {
                var icon = _icons[i];
                if (i >= _pinData.Count) { icon.style.display = DisplayStyle.None; continue; }
                var pin = _pinData[i];
                var at = ToLocal(pin.at);
                var s = pin.size > 0f ? pin.size : 20f;
                var inside = at.x > -s && at.y > -s && at.x < r.width + s && at.y < r.height + s;
                icon.style.display = inside ? DisplayStyle.Flex : DisplayStyle.None;
                if (!inside) continue;
                if (icon.Kind != pin.icon) icon.Kind = pin.icon;
                if (icon.Tint != pin.color) icon.Tint = pin.color;
                icon.style.width = icon.style.height = s;
                icon.style.borderTopLeftRadius = icon.style.borderTopRightRadius = icon.style.borderBottomLeftRadius = icon.style.borderBottomRightRadius = s * 0.5f;
                icon.style.left = at.x - s * 0.5f;
                icon.style.top = at.y - s * 0.5f;
                icon.style.rotate = new Rotate(new Angle(pin.heading, AngleUnit.Degree));
            }
        }

        void DrawCircles(MeshGenerationContext ctx)
        {
            var p = ctx.painter2D;
            foreach (var pin in _pinData)
            {
                if (pin.circle <= 0f) continue;
                p.strokeColor = new Color(pin.color.r, pin.color.g, pin.color.b, 0.9f);
                p.fillColor = new Color(pin.color.r, pin.color.g, pin.color.b, 0.12f);
                p.lineWidth = 2f;
                p.BeginPath();
                p.Arc(ToLocal(pin.at), pin.circle * PixelsPerMetre, 0f, 360f);
                p.Fill();
                p.Stroke();
            }
        }

        /// <summary>Nearest pin within <paramref name="radius"/> px of a local point; false if none.</summary>
        public bool PinAt(Vector2 local, float radius, out MapPin found)
        {
            found = default;
            var best = radius * radius;
            var hit = false;
            foreach (var pin in _pinData)
            {
                if (string.IsNullOrEmpty(pin.id)) continue;
                var d = (ToLocal(pin.at) - local).sqrMagnitude;
                if (d < best) { best = d; found = pin; hit = true; }
            }
            return hit;
        }

        // ── base image ───────────────────────────────────────────────────────

        /// <summary>
        /// Land (shaded by height), water (below <paramref name="waterLevel"/>) and the eight region tints, one pixel
        /// per <paramref name="metresPerPixel"/>. ~65 k terrain samples: a few ms, once per scene.
        /// </summary>
        public static Texture2D BakeBase(Terrain terrain, RegionSet regions, Rect bounds, float metresPerPixel, float waterLevel)
        {
            var w = Mathf.CeilToInt(bounds.width / metresPerPixel);
            var h = Mathf.CeilToInt(bounds.height / metresPerPixel);
            var tex = new Texture2D(w, h, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear, name = "MapBase (runtime)" };
            var px = new Color32[w * h];
            var land = new Color(0.15f, 0.23f, 0.19f);
            var high = new Color(0.33f, 0.34f, 0.29f);
            var water = new Color(0.09f, 0.25f, 0.4f);
            var heights = new float[w * h];
            for (var y = 0; y < h; y++)
            for (var x = 0; x < w; x++)
            {
                var wx = bounds.xMin + (x + 0.5f) * metresPerPixel;
                var wz = bounds.yMin + (y + 0.5f) * metresPerPixel; // texture row 0 = south (UI draws row 0 at the bottom)
                heights[y * w + x] = terrain != null ? terrain.SampleHeight(new Vector3(wx, 0f, wz)) + terrain.transform.position.y : 10f;
            }
            for (var y = 0; y < h; y++)
            for (var x = 0; x < w; x++)
            {
                var hgt = heights[y * w + x];
                var wx = bounds.xMin + (x + 0.5f) * metresPerPixel;
                var wz = bounds.yMin + (y + 0.5f) * metresPerPixel;
                Color c;
                if (hgt < waterLevel) c = water;
                else
                {
                    c = Color.Lerp(land, high, Mathf.Clamp01((hgt - waterLevel) / 220f));
                    // Light from the north-west: slopes facing it brighter — the mountain reads as relief.
                    var dx = heights[y * w + Mathf.Min(w - 1, x + 1)] - heights[y * w + Mathf.Max(0, x - 1)];
                    var dz = heights[Mathf.Min(h - 1, y + 1) * w + x] - heights[Mathf.Max(0, y - 1) * w + x];
                    c *= Mathf.Clamp(1f + (-dx + dz) / (metresPerPixel * 6f), 0.7f, 1.3f);
                    if (regions != null)
                    {
                        var region = regions.regions[regions.IndexAt(new Vector3(wx, 0f, wz))];
                        c = Color.Lerp(c, region.color, 0.2f);
                    }
                    c.a = 1f;
                }
                px[y * w + x] = c;
            }
            tex.SetPixels32(px);
            tex.Apply(false, true);
            return tex;
        }
    }
}
