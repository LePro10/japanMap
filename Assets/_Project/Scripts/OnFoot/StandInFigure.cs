using UnityEngine;

namespace JapanMap.OnFoot
{
    /// <summary>
    /// PROVISIONAL stand-in person from Unity primitives (no model in the library yet — STATUS
    /// "Für die Asset-Sitzung"). Head, torso, two arms, two legs on pivots, so gait, run lean and
    /// slide read at a glance. Shared by the player and the pedestrians; replaced by a skinned
    /// model when the asset session delivers one.
    /// </summary>
    public sealed class StandInFigure : MonoBehaviour
    {
        Transform _body, _legL, _legR, _armL, _armR;
        float _height = 1.72f;

        /// <summary>Build a figure of <paramref name="height"/> m under <paramref name="parent"/>, feet at its origin.</summary>
        public static StandInFigure Build(Transform parent, float height, Material skin, Material top, Material bottom)
        {
            var root = new GameObject("StandIn (provisional)");
            root.transform.SetParent(parent, false);
            var f = root.AddComponent<StandInFigure>();
            f._height = height;
            var k = height / 1.72f;
            f._body = new GameObject("Body").transform;
            f._body.SetParent(root.transform, false);
            f._body.localPosition = new Vector3(0f, 0.92f * k, 0f); // hips

            Part(PrimitiveType.Cube, f._body, new Vector3(0f, 0.3f, 0f) * k, new Vector3(0.44f, 0.6f, 0.26f) * k, top);
            Part(PrimitiveType.Sphere, f._body, new Vector3(0f, 0.74f, 0f) * k, Vector3.one * 0.24f * k, skin);
            f._armL = Limb(f._body, new Vector3(-0.29f, 0.56f, 0f) * k, new Vector3(0.12f, 0.6f, 0.12f) * k, top);
            f._armR = Limb(f._body, new Vector3(0.29f, 0.56f, 0f) * k, new Vector3(0.12f, 0.6f, 0.12f) * k, top);
            f._legL = Limb(f._body, new Vector3(-0.11f, 0f, 0f) * k, new Vector3(0.17f, 0.9f, 0.18f) * k, bottom);
            f._legR = Limb(f._body, new Vector3(0.11f, 0f, 0f) * k, new Vector3(0.17f, 0.9f, 0.18f) * k, bottom);
            return f;
        }

        static Transform Limb(Transform parent, Vector3 pivot, Vector3 size, Material m)
        {
            var p = new GameObject("Limb").transform;
            p.SetParent(parent, false);
            p.localPosition = pivot;
            Part(PrimitiveType.Cube, p, new Vector3(0f, -size.y * 0.5f, 0f), size, m);
            return p;
        }

        static void Part(PrimitiveType type, Transform parent, Vector3 pos, Vector3 size, Material m)
        {
            var g = GameObject.CreatePrimitive(type);
            Destroy(g.GetComponent<Collider>());
            g.transform.SetParent(parent, false);
            g.transform.localPosition = pos;
            g.transform.localScale = size;
            var r = g.GetComponent<MeshRenderer>();
            r.sharedMaterial = m;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
        }

        /// <summary>
        /// Pose for this frame. <paramref name="cycle"/> = metres walked, <paramref name="gait"/> 0…1
        /// (stand…run), <paramref name="slide"/> 0…1, <paramref name="air"/> = in the air.
        /// </summary>
        public void Pose(float cycle, float gait, float lean, float slide, bool air)
        {
            var k = _height / 1.72f;
            // One full leg cycle per two steps of ~0.75 m (legacy bob period).
            var phase = cycle * (Mathf.PI / 0.75f) / k;
            var swing = Mathf.Sin(phase) * Mathf.Lerp(0f, 38f, gait);
            if (air) swing = 0f;
            var tuck = air ? 25f : 0f;
            _legL.localRotation = Quaternion.Euler(swing - tuck, 0f, 0f);
            _legR.localRotation = Quaternion.Euler(-swing - tuck * 0.4f, 0f, 0f);
            _armL.localRotation = Quaternion.Euler(-swing * 0.8f, 0f, -6f);
            _armR.localRotation = Quaternion.Euler(swing * 0.8f, 0f, 6f);

            // Run: lean into the stride. Slide: lie back, hips down, one leg forward (Fortnite slide).
            var bodyPitch = lean * 9f * (1f - slide) - 52f * slide;
            _body.localRotation = Quaternion.Euler(bodyPitch, 0f, 0f);
            _body.localPosition = new Vector3(0f, Mathf.Lerp(0.92f, 0.42f, slide) * k, 0f);
            if (slide > 0.01f)
            {
                _legL.localRotation = Quaternion.Slerp(_legL.localRotation, Quaternion.Euler(-40f, 0f, 0f), slide);
                _legR.localRotation = Quaternion.Slerp(_legR.localRotation, Quaternion.Euler(-10f, 0f, 0f), slide);
                _armL.localRotation = Quaternion.Slerp(_armL.localRotation, Quaternion.Euler(30f, 0f, -40f), slide);
                _armR.localRotation = Quaternion.Slerp(_armR.localRotation, Quaternion.Euler(-60f, 0f, 20f), slide);
            }
        }
    }
}
