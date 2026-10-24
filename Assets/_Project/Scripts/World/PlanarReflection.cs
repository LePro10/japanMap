using JapanMap.Core;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace JapanMap.World
{
    /// <summary>
    /// Renders the main camera's view mirrored in the city plane into a texture the wet surface shader blends into its
    /// puddles (<see cref="PlanarReflectionSettings"/>). Only near Tokyo, below a height, at a reduced size, and not on
    /// Low. The mirror camera is a proper rotation (no inverted culling): its image is the mirror image flipped left to
    /// right, so the shader samples at (1 − u, v).
    /// </summary>
    [DefaultExecutionOrder(32000)] // after the camera rig and Cinemachine moved the main camera this frame
    public sealed class PlanarReflection : MonoBehaviour
    {
        [SerializeField] PlanarReflectionSettings settings;

        static readonly int TexId = Shader.PropertyToID("_JM_PlanarTex");
        static readonly int ParamsId = Shader.PropertyToID("_JM_Planar");

        Camera _mirror;
        RenderTexture _rt;
        float _scale;
        UniversalRenderPipeline.SingleCameraRequest _request;

        /// <summary>The mirror rendered this frame (tests, probes).</summary>
        public bool Active { get; private set; }
        public Vector2Int Size => _rt != null ? new Vector2Int(_rt.width, _rt.height) : Vector2Int.zero;

        void OnEnable()
        {
            QualitySystem.TierChanged += OnTier;
            OnTier(QualitySystem.Current);
        }

        void OnDisable()
        {
            QualitySystem.TierChanged -= OnTier;
            Shader.SetGlobalVector(ParamsId, Vector4.zero);
            Release();
            if (_mirror != null) Destroy(_mirror.gameObject);
        }

        static readonly int DepthAvailableId = Shader.PropertyToID("_JM_DepthAvailable");

        void OnTier(string tier)
        {
            // Effects that read the scene depth (sea foam) only where the tier renders a depth texture (not Low).
            var urp = GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;
            Shader.SetGlobalFloat(DepthAvailableId, urp != null && urp.supportsCameraDepthTexture ? 1f : 0f);
            var i = System.Array.IndexOf(QualitySystem.Tiers, tier);
            _scale = settings == null ? 0f : i == 0 ? settings.scale.x : i == 1 ? settings.scale.y : i == 2 ? settings.scale.z : settings.scale.y;
        }

        void Release()
        {
            if (_rt == null) return;
            _rt.Release();
            Destroy(_rt);
            _rt = null;
        }

        void LateUpdate()
        {
            Active = false;
            var main = Camera.main;
            if (settings == null || main == null || _scale <= 0f || !Wanted(main.transform.position))
            {
                Shader.SetGlobalVector(ParamsId, Vector4.zero);
                return;
            }
            EnsureCamera();
            EnsureTarget(main);
            Place(main);
            // One request object for the whole session: a new one per frame is garbage every frame.
            if (_request == null) _request = new UniversalRenderPipeline.SingleCameraRequest();
            _request.destination = _rt;
            var request = _request;
            if (!RenderPipeline.SupportsRenderRequest(_mirror, request))
            {
                Shader.SetGlobalVector(ParamsId, Vector4.zero);
                return;
            }
            RenderPipeline.SubmitRenderRequest(_mirror, request);
            Shader.SetGlobalTexture(TexId, _rt);
            Shader.SetGlobalVector(ParamsId, new Vector4(settings.planeY, settings.strength, settings.distortion, 1f));
            Active = true;
        }

        bool Wanted(Vector3 p)
        {
            var r = settings.region;
            return Mathf.Abs(p.x - r.x) < r.z && Mathf.Abs(p.z - r.y) < r.w && p.y > settings.planeY && p.y - settings.planeY < settings.maxCameraHeight;
        }

        void EnsureCamera()
        {
            if (_mirror != null) return;
            var go = new GameObject("PlanarReflectionCamera") { hideFlags = HideFlags.DontSave };
            go.transform.SetParent(transform, false);
            _mirror = go.AddComponent<Camera>();
            _mirror.enabled = false; // rendered only on request
            var data = go.AddComponent<UniversalAdditionalCameraData>();
            data.renderShadows = false;
            data.renderPostProcessing = false;
            data.requiresColorOption = CameraOverrideOption.Off;
            data.requiresDepthOption = CameraOverrideOption.Off;
            data.antialiasing = AntialiasingMode.None;
            data.SetRenderer(0);
        }

        void EnsureTarget(Camera main)
        {
            var w = Mathf.Max(64, Mathf.RoundToInt(main.pixelWidth * _scale));
            var h = Mathf.Max(64, Mathf.RoundToInt(main.pixelHeight * _scale));
            var longest = Mathf.Max(w, h);
            if (longest > settings.maxSize)
            {
                var k = settings.maxSize / (float)longest;
                w = Mathf.RoundToInt(w * k);
                h = Mathf.RoundToInt(h * k);
            }
            if (_rt != null && _rt.width == w && _rt.height == h) return;
            Release();
            var hdr = SystemInfo.SupportsRenderTextureFormat(RenderTextureFormat.ARGBHalf);
            _rt = new RenderTexture(w, h, 16, hdr ? RenderTextureFormat.ARGBHalf : RenderTextureFormat.ARGB32)
            {
                name = "PlanarReflection",
                useMipMap = false,
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear,
            };
            _rt.Create();
        }

        void Place(Camera main)
        {
            var h = settings.planeY;
            var t = main.transform;
            var p = t.position;
            var f = t.forward;
            var u = t.up;
            var mp = new Vector3(p.x, 2f * h - p.y, p.z);
            var mf = new Vector3(f.x, -f.y, f.z);
            var mu = new Vector3(u.x, -u.y, u.z);
            _mirror.transform.SetPositionAndRotation(mp, Quaternion.LookRotation(mf, mu));
            _mirror.fieldOfView = main.fieldOfView;
            _mirror.aspect = main.aspect;
            _mirror.nearClipPlane = main.nearClipPlane;
            _mirror.farClipPlane = settings.farClip;
            _mirror.cullingMask = settings.layers;
            _mirror.clearFlags = CameraClearFlags.Skybox;
            _mirror.ResetProjectionMatrix();
            // Oblique near plane = the mirror plane: nothing below the street is reflected.
            var w2c = _mirror.worldToCameraMatrix;
            var cp = w2c.MultiplyPoint(new Vector3(0f, h + 0.02f, 0f));
            var cn = w2c.MultiplyVector(Vector3.up).normalized;
            _mirror.projectionMatrix = _mirror.CalculateObliqueMatrix(new Vector4(cn.x, cn.y, cn.z, -Vector3.Dot(cp, cn)));
        }
    }
}
