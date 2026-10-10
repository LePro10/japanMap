using System.Text;
using JapanMap.Gameplay.Regions;
using JapanMap.UI;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay.Menu
{
    /// <summary>
    /// Map tab (ASTRA §10): regions and free travel. The drawn world map comes in Phase 9 task 3; until then the
    /// page lists the eight regions and the travel points.
    /// </summary>
    public sealed class MapScreen : MenuScreen
    {
        readonly RegionWatch _regions;
        readonly Travel _travel;
        string _text = "";

        public MapScreen(RegionWatch regions, Travel travel)
        {
            _regions = regions;
            _travel = travel;
        }

        public override string Title => "Map";
        public override Icon Icon => Icon.Map;
        public override string Text => _text;

        public override void Build(VisualElement body)
        {
            var t = new StringBuilder();
            Ui.H1(body, "Map");
            Ui.H2(body, "Travel");
            var row = Ui.Row(body, "jm-wrap");
            if (_travel != null && _travel.Points != null)
                foreach (var p in _travel.Points.points)
                {
                    var id = p.id;
                    var open = _travel.Unlocked(p);
                    var b = Ui.Button(row, open ? p.title : $"{p.title} · undiscovered", () => { Menu.Close(); _travel.To(id); });
                    b.SetEnabled(open);
                    t.AppendLine($"{p.title} {(open ? "open" : "locked")}");
                }
            Ui.H2(body, "Regions");
            foreach (var r in _regions.Regions.regions)
            {
                var known = false;
                foreach (var e in _regions.Explored) if (e == r.id) known = true;
                Ui.Text(body, $"{(known ? "✓" : "○")} {r.title}", known ? "jm-body" : "jm-dim");
            }
            _text = t.ToString();
        }
    }
}
