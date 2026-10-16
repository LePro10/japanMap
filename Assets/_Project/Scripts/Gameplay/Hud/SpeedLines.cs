using UnityEngine;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay.Hud
{
    /// <summary>
    /// Speed streaks at the screen edges: thin light lines rushing outwards from the vanishing point, a few at
    /// 100 km/h, many and long in a nitro burst. Drawn by the HUD's own painter (a few dozen quads, no post pass,
    /// so Low and phones keep it). Off with Settings → Reduced motion.
    /// </summary>
    public sealed class SpeedLines : VisualElement
    {
        const int Count = 56;
        readonly float[] _angle = new float[Count], _phase = new float[Count], _speed = new float[Count], _width = new float[Count];
        float _amount, _burst, _t;
        Color _tint = Color.white;

        /// <summary>0…1 how much is shown (speed share above the threshold), 0…1 burst on top.</summary>
        public float Amount => _amount;

        public SpeedLines()
        {
            pickingMode = PickingMode.Ignore;
            style.position = Position.Absolute;
            style.left = style.right = style.top = style.bottom = 0;
            var rng = new System.Random(7);
            for (var i = 0; i < Count; i++)
            {
                _angle[i] = (float)(rng.NextDouble() * Mathf.PI * 2f);
                _phase[i] = (float)rng.NextDouble();
                _speed[i] = 0.7f + (float)rng.NextDouble() * 0.8f;
                _width[i] = 0.6f + (float)rng.NextDouble() * 1.6f;
            }
            generateVisualContent += Draw;
        }

        /// <summary>Per frame: speed share 0…1 (0 below the threshold), burst 1 → 0, dt.</summary>
        public void Tick(float speed01, float burst, bool boosting, float dt)
        {
            var target = Mathf.Clamp01(speed01) * 0.75f + (boosting ? 0.15f : 0f);
            _amount += (target - _amount) * (1f - Mathf.Exp(-4f * dt));
            _burst = burst > _burst ? burst : _burst + (burst - _burst) * (1f - Mathf.Exp(-3f * dt));
            _tint = Color.Lerp(new Color(0.92f, 0.96f, 1f), new Color(0.55f, 0.88f, 1f), Mathf.Max(_burst, boosting ? 0.5f : 0f));
            _t += dt * (1f + 2.5f * _burst + _amount);
            var show = _amount + _burst > 0.02f && !Core.GameOptions.ReducedMotion;
            style.display = show ? DisplayStyle.Flex : DisplayStyle.None;
            if (show) MarkDirtyRepaint();
        }

        void Draw(MeshGenerationContext ctx)
        {
            var r = contentRect;
            if (r.width < 10f) return;
            var p = ctx.painter2D;
            // Vanishing point a little above the middle — where the road meets the horizon in the chase view.
            var c = new Vector2(r.width * 0.5f, r.height * 0.44f);
            var reach = new Vector2(r.width, r.height).magnitude * 0.55f;
            var level = Mathf.Clamp01(_amount + _burst);
            var lines = Mathf.RoundToInt(Count * Mathf.Clamp01(0.25f + 0.75f * level));
            p.lineCap = LineCap.Round;
            for (var i = 0; i < lines; i++)
            {
                // Each streak travels outwards and starts again: phase 0 at the inner edge, 1 off screen.
                var ph = (_phase[i] + _t * _speed[i] * 0.9f) % 1f;
                var inner = Mathf.Lerp(0.5f - 0.18f * _burst, 1.05f, ph); // the burst pulls lines towards the centre
                var len = (0.06f + 0.22f * level + 0.25f * _burst) * (0.6f + 0.4f * _speed[i]);
                var dir = new Vector2(Mathf.Cos(_angle[i]), Mathf.Sin(_angle[i]));
                // Ellipse to the screen's shape so lines hug the edges instead of a circle in the middle.
                var aspect = new Vector2(r.width * 0.5f / reach, r.height * 0.5f / reach) * 1.25f;
                var a = c + Vector2.Scale(dir, aspect) * (inner * reach);
                var b = c + Vector2.Scale(dir, aspect) * ((inner + len) * reach);
                var fade = Mathf.Sin(Mathf.PI * Mathf.Clamp01(ph)) * level;
                var col = _tint;
                col.a = Mathf.Clamp01(fade * (0.18f + 0.3f * _burst));
                if (col.a < 0.01f) continue;
                p.strokeColor = col;
                p.lineWidth = _width[i] * (1f + 1.5f * _burst);
                p.BeginPath();
                p.MoveTo(a);
                p.LineTo(b);
                p.Stroke();
            }
        }
    }
}
