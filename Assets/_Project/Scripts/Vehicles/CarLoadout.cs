using UnityEngine;

namespace JapanMap.Vehicles
{
    /// <summary>What the player's next car is built with: owned parts, setup and looks. Implemented by the progress.</summary>
    public interface ICarLoadout
    {
        /// <summary>Car to start in; empty = fleet default.</summary>
        string SelectedCar { get; }
        /// <summary>Handling with the fitted parts and setup; null = stock.</summary>
        ArcadeSpec SpecFor(VehicleDefinition def, out float crawlShare);
        /// <summary>Visible parts and paint on a freshly built model.</summary>
        void Dress(VehicleDefinition def, Transform model);
    }

    /// <summary>
    /// The car lab's optional parts (ArtSource/cars/README.legacy.md): engine_o0..2 (engine tier, visible in the
    /// bay), aero_o0..2 (body kit), wheelmesh_* + _o1/_o2 (rims), and the paint on the material "&lt;id&gt;_paint".
    /// </summary>
    public static class CarLooks
    {
        static readonly int BaseColor = Shader.PropertyToID("baseColorFactor");
        static readonly int BaseTex = Shader.PropertyToID("baseColorTexture");
        static MaterialPropertyBlock _block;

        public static void Apply(Transform model, int engine, int aero, int wheels, Color? paint)
        {
            if (model == null) return;
            foreach (var t in model.GetComponentsInChildren<Transform>(true))
            {
                var n = t.name;
                var dot = n.IndexOf('.');
                if (dot > 0) n = n.Substring(0, dot);
                if (n.StartsWith("engine_o")) t.gameObject.SetActive(n == "engine_o" + engine);
                else if (n.StartsWith("aero_o")) t.gameObject.SetActive(n == "aero_o" + aero);
                else if (n.StartsWith("wheelmesh_"))
                {
                    // The factory rim has no suffix (wheelmesh_FL); the options end in _o1/_o2.
                    var option = n.EndsWith("_o1") ? 1 : n.EndsWith("_o2") ? 2 : 0;
                    t.gameObject.SetActive(option == wheels);
                }
            }
            Paint(model, paint);
        }

        /// <summary>
        /// Palette paint: the livery texture gives way to a plain white one tinted with the colour, so the colour
        /// reads as solid paint (multiplying it over a two-tone livery would muddy it). Null = factory livery.
        /// </summary>
        public static void Paint(Transform model, Color? paint)
        {
            _block ??= new MaterialPropertyBlock();
            foreach (var r in model.GetComponentsInChildren<Renderer>(true))
            {
                var mats = r.sharedMaterials;
                for (var i = 0; i < mats.Length; i++)
                {
                    if (mats[i] == null || !mats[i].name.EndsWith("_paint")) continue;
                    r.GetPropertyBlock(_block, i);
                    if (paint.HasValue)
                    {
                        _block.SetColor(BaseColor, paint.Value);
                        _block.SetTexture(BaseTex, Texture2D.whiteTexture);
                    }
                    else _block.Clear();
                    r.SetPropertyBlock(_block, i);
                }
            }
        }
    }
}
