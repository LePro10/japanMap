using JapanMap.Core;
using UnityEngine;

namespace JapanMap.OnFoot
{
    /// <summary>
    /// PROVISIONAL stand-in person (no model in the library yet — STATUS "Für die Asset-Sitzung").
    /// Boxes for head, torso, arms and legs, built as ONE skinned mesh whose bones are the limb
    /// pivots, coloured from a shared palette texture: one renderer and one material for every
    /// figure. Six separate primitives cost ~550 draw calls for 48 pedestrians (measured in Tokyo).
    /// Shared by the player and the pedestrians; replaced by a skinned model from the asset session.
    /// </summary>
    public sealed class StandInFigure : MonoBehaviour
    {
        Transform _body, _legL, _legR, _armL, _armR;
        float _height = 1.72f;

        /// <summary>
        /// Build a figure of <paramref name="height"/> m under <paramref name="parent"/>, feet at its origin.
        /// Colours come from the materials' base colours; <paramref name="skin"/> is the shader template.
        /// </summary>
        public static StandInFigure Build(Transform parent, float height, Material skin, Material top, Material bottom)
        {
            var root = new GameObject("StandIn (provisional)");
            root.transform.SetParent(parent, false);
            var f = root.AddComponent<StandInFigure>();
            f._height = height;
            var k = height / 1.72f;
            f._body = Bone("Hips", root.transform, new Vector3(0f, 0.92f, 0f) * k);
            f._armL = Bone("ArmL", f._body, new Vector3(-0.29f, 0.56f, 0f) * k);
            f._armR = Bone("ArmR", f._body, new Vector3(0.29f, 0.56f, 0f) * k);
            f._legL = Bone("LegL", f._body, new Vector3(-0.11f, 0f, 0f) * k);
            f._legR = Bone("LegR", f._body, new Vector3(0.11f, 0f, 0f) * k);

            var palette = StandInPalette.For(skin);
            var cSkin = palette.Uv(skin.GetColor(StandInPalette.BaseColor));
            var cTop = palette.Uv(top.GetColor(StandInPalette.BaseColor));
            var cBottom = palette.Uv(bottom.GetColor(StandInPalette.BaseColor));
            var mesh = new BoxMeshBuilder();
            // Positions in the figure's root space at bind pose; bone index per box.
            mesh.Box(0, new Vector3(0f, 0.92f + 0.3f, 0f) * k, new Vector3(0.44f, 0.6f, 0.26f) * k, cTop);
            mesh.Box(0, new Vector3(0f, 0.92f + 0.74f, 0.01f) * k, new Vector3(0.22f, 0.25f, 0.24f) * k, cSkin);
            mesh.Box(1, new Vector3(-0.29f, 0.92f + 0.56f - 0.3f, 0f) * k, new Vector3(0.12f, 0.6f, 0.12f) * k, cTop);
            mesh.Box(2, new Vector3(0.29f, 0.92f + 0.56f - 0.3f, 0f) * k, new Vector3(0.12f, 0.6f, 0.12f) * k, cTop);
            mesh.Box(3, new Vector3(-0.11f, 0.92f - 0.45f, 0f) * k, new Vector3(0.17f, 0.9f, 0.18f) * k, cBottom);
            mesh.Box(4, new Vector3(0.11f, 0.92f - 0.45f, 0f) * k, new Vector3(0.17f, 0.9f, 0.18f) * k, cBottom);

            var bones = new[] { f._body, f._armL, f._armR, f._legL, f._legR };
            var m = mesh.ToMesh("StandInFigure");
            var bind = new Matrix4x4[bones.Length];
            for (var i = 0; i < bones.Length; i++) bind[i] = bones[i].worldToLocalMatrix * root.transform.localToWorldMatrix;
            m.bindposes = bind;
            var smr = root.AddComponent<SkinnedMeshRenderer>();
            smr.sharedMesh = m;
            smr.bones = bones;
            smr.rootBone = root.transform;
            smr.sharedMaterial = palette.Material;
            smr.quality = SkinQuality.Bone1;
            smr.localBounds = new Bounds(new Vector3(0f, 0.9f, 0f) * k, new Vector3(2.2f, 2.2f, 2.2f) * k);
            smr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
            return f;
        }

        static Transform Bone(string name, Transform parent, Vector3 localPos)
        {
            var t = new GameObject(name).transform;
            t.SetParent(parent, false);
            t.localPosition = localPos;
            return t;
        }

        /// <summary>Sitting on a bench: hips down, thighs forward, hands on the knees.</summary>
        public void PoseSeated()
        {
            var k = _height / 1.72f;
            _body.localPosition = new Vector3(0f, 0.5f * k, 0f);
            _body.localRotation = Quaternion.Euler(-4f, 0f, 0f);
            _legL.localRotation = _legR.localRotation = Quaternion.Euler(-85f, 0f, 0f);
            _armL.localRotation = Quaternion.Euler(-40f, 0f, -4f);
            _armR.localRotation = Quaternion.Euler(-40f, 0f, 4f);
        }

        /// <summary>Working at something in front (nets, boxes, tools): bent forward, arms pulling in turn.</summary>
        public void PoseWork(float t)
        {
            var k = _height / 1.72f;
            _body.localPosition = new Vector3(0f, 0.9f * k, 0f);
            _body.localRotation = Quaternion.Euler(22f + Mathf.Sin(t * 1.7f) * 6f, 0f, 0f);
            _legL.localRotation = Quaternion.Euler(-14f, 0f, 0f);
            _legR.localRotation = Quaternion.Euler(-14f, 0f, 0f);
            _armL.localRotation = Quaternion.Euler(-55f + Mathf.Sin(t * 1.7f) * 25f, 0f, -5f);
            _armR.localRotation = Quaternion.Euler(-55f - Mathf.Sin(t * 1.7f) * 25f, 0f, 5f);
        }

        /// <summary>Standing and looking around: weight shifts, a slow turn of the upper body.</summary>
        public void PoseIdle(float t)
        {
            var k = _height / 1.72f;
            _body.localPosition = new Vector3(Mathf.Sin(t * 0.5f) * 0.02f, 0.92f * k, 0f);
            _body.localRotation = Quaternion.Euler(0f, Mathf.Sin(t * 0.3f) * 14f, Mathf.Sin(t * 0.5f) * 2f);
            _legL.localRotation = _legR.localRotation = Quaternion.identity;
            _armL.localRotation = Quaternion.Euler(0f, 0f, -6f);
            _armR.localRotation = Quaternion.Euler(0f, 0f, 6f);
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
