using JapanMap.Core;
using UnityEngine;

namespace JapanMap.Gameplay.Life
{
    /// <summary>
    /// The walk-in shops (legacy CityInteriors: diner and corner mart, no function yet): one mesh per
    /// shop from the layout boxes, coloured by finish from the shared palette, plus the layout's
    /// colliders (walls with the door gap, counters, stools). PROVISIONAL look: no signs or goods
    /// textures yet — on the asset list.
    /// </summary>
    public sealed class ShopInteriors : MonoBehaviour
    {
        [SerializeField] InteriorSet data;
        [Tooltip("Lit material the palette is made from.")]
        [SerializeField] Material template;

        public int Built { get; private set; }

        void Start()
        {
            if (data == null) return;
            var palette = StandInPalette.For(template);
            foreach (var shop in data.interiors)
            {
                var root = new GameObject("Shop " + shop.id).transform;
                root.SetParent(transform, false);
                var mesh = new BoxMeshBuilder();
                foreach (var b in shop.boxes)
                {
                    if (b.visible) mesh.Box(0, b.centre, b.size, palette.Uv(InteriorSet.Finish(b.finish)));
                    if (!b.solid) continue;
                    var c = new GameObject("Collider").AddComponent<BoxCollider>();
                    c.transform.SetParent(root, false);
                    c.transform.position = b.centre;
                    c.size = b.size;
                }
                var go = new GameObject("Shell (provisional)");
                go.transform.SetParent(root, false);
                go.AddComponent<MeshFilter>().sharedMesh = mesh.ToMesh("Shop " + shop.id, skinned: false);
                go.AddComponent<MeshRenderer>().sharedMaterial = palette.Material;
                Built++;
            }
        }
    }
}
