using UnityEngine;
using UnityEngine.Rendering;

namespace JapanMap.OnFoot
{
    /// <summary>
    /// A person from the asset sprint (P_Hito_* prefab: skinned body with LODs, Humanoid Animator with
    /// one state per clip, grips under both hands). Shared by the player, pedestrians and place actors:
    /// they say what the figure does (stand, walk at a speed, sit, work), this picks and times the clip
    /// and carries the hand prop. Replaces the box stand-in (StandInFigure).
    /// </summary>
    public sealed class HitoFigure : MonoBehaviour
    {
        public const string GripLeft = "Grip_LeftHand", GripRight = "Grip_RightHand";

        FigureSet _set;
        Animator _anim;
        Renderer[] _renderers;
        Transform _prop;
        bool _upright;
        int _state;
        ShadowCastingMode _shadows = ShadowCastingMode.On;

        public string Clip { get; private set; } = "";
        public Transform Prop => _prop;

        public static HitoFigure Spawn(FigureSet set, GameObject body, Transform parent)
        {
            var go = Instantiate(body, parent, false);
            go.name = body.name;
            var f = go.AddComponent<HitoFigure>();
            f._set = set;
            f._anim = go.GetComponentInChildren<Animator>(); // on the "Model" child, turned to face +Z
            // Offscreen people keep their clock but skip the bones: dozens of animators in a web build.
            f._anim.cullingMode = AnimatorCullingMode.CullUpdateTransforms;
            f._anim.applyRootMotion = false;
            f._renderers = go.GetComponentsInChildren<Renderer>(true);
            return f;
        }

        /// <summary>Put a hand prop from the set into its hand (null/empty = hands free).</summary>
        public void Hold(string prop)
        {
            if (_prop != null) Destroy(_prop.gameObject);
            _prop = null;
            if (!string.IsNullOrEmpty(prop) && _set.TryProp(prop, out var p))
            {
                var grip = Find(transform, p.rightHand ? GripRight : GripLeft);
                if (grip != null)
                {
                    _prop = Instantiate(p.prefab, grip, false).transform;
                    _prop.name = p.name;
                    _upright = p.upright;
                    // The library prefab is a world prop: a hand-held one has no collider of its own.
                    foreach (var c in _prop.GetComponentsInChildren<Collider>(true)) Destroy(c);
                }
            }
            _renderers = GetComponentsInChildren<Renderer>(true);
            foreach (var r in _renderers) r.shadowCastingMode = _shadows;
        }

        /// <summary>Play a clip by name at <paramref name="rate"/> (cross-fades only when the clip changes).</summary>
        public void Play(string clip, float rate = 1f)
        {
            var hash = Animator.StringToHash(clip);
            if (hash != _state)
            {
                // First clip starts at a random point: twenty workers must not hammer in lockstep.
                if (_state == 0) _anim.Play(hash, 0, Random.value);
                else _anim.CrossFadeInFixedTime(hash, _set.fade);
                _state = hash;
                Clip = clip;
            }
            _anim.speed = rate;
        }

        /// <summary>Stand, walk or run at a ground speed, the stride matched to it.</summary>
        public void Move(float speed, string walkClip = "Walk")
        {
            if (speed < _set.standBelow) { Play("Idle"); return; }
            var clip = speed < _set.runFrom ? walkClip : "Run";
            var natural = _set.SpeedOf(clip);
            Play(clip, natural > 0f ? Mathf.Clamp(speed / natural, _set.rateRange.x, _set.rateRange.y) : 1f);
        }

        public void CastShadows(bool on)
        {
            var mode = on ? ShadowCastingMode.On : ShadowCastingMode.Off;
            if (mode == _shadows) return;
            _shadows = mode;
            foreach (var r in _renderers) if (r != null) r.shadowCastingMode = mode;
        }

        void LateUpdate()
        {
            // Open umbrellas, phones, rods: follow the hand, but stand upright in the world.
            if (_prop != null && _upright) _prop.rotation = Quaternion.Euler(0f, transform.eulerAngles.y, 0f);
        }

        static Transform Find(Transform t, string name)
        {
            if (t.name == name) return t;
            for (var i = 0; i < t.childCount; i++)
            {
                var hit = Find(t.GetChild(i), name);
                if (hit != null) return hit;
            }
            return null;
        }
    }
}
