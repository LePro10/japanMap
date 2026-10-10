using System;
using System.Runtime.InteropServices;
using JapanMap.Core;
using UnityEngine;

namespace JapanMap.World
{
    /// <summary>
    /// The terrain's grids travel as a gzip file next to the game (D36): Unity packs the player data with LZ4, which
    /// barely shrinks 16-bit heights — the terrain was ~8 MB of the start download, as <see cref="TerrainPayload"/> it is
    /// 3.9 MB. The file is fetched during boot (<see cref="StartContentGate"/>, before the game scene and the first
    /// gameplayStart, so it counts honestly); the build leaves a tiny placeholder in Game.unity
    /// (Editor/StreamedTerrainBuild) which this fills before anything stands on the ground. Heights stay lossless
    /// (ASTRA §13: never change road contact for size). In the editor the scene keeps its full terrain data.
    /// </summary>
    [DefaultExecutionOrder(-2000)]
    [RequireComponent(typeof(Terrain))]
    public sealed class StreamedTerrain : MonoBehaviour
    {
        /// <summary>File names under StreamingAssets: gzip, and the plain copy for browsers without DecompressionStream.</summary>
        public const string FileName = "terrain.jmtz";
        public const string PlainName = "terrain.jmt";
        const int Tries = 3;

        [Tooltip("Set by the build: the terrain data here is a placeholder, its grids come from the file.")]
        [SerializeField] bool placeholder;

        static TerrainPayload.Grids _grids;
        static bool _asked, _failed;
        static int _tries;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics()
        {
            _grids = null;
            _asked = _failed = false;
            _tries = 0;
        }

        /// <summary>The file is here (or nothing has to come: editor, a build without a streamed terrain).</summary>
        public static bool Ready => _grids != null || _failed || !NeedsFile;
        /// <summary>Gave up after <see cref="Tries"/> attempts — the game runs on a flat placeholder (logged as an error).</summary>
        public static bool Failed => _failed;

        static bool NeedsFile => Application.platform == RuntimePlatform.WebGLPlayer;

        public void MarkPlaceholder() => placeholder = true;

        /// <summary>Starts the download (once).</summary>
        public static void Preload()
        {
            if (_asked || !NeedsFile) return;
            _asked = true;
            Fetch();
        }

        static float _t0;

        static void Fetch()
        {
            _t0 = Time.realtimeSinceStartup;
            var root = Application.streamingAssetsPath + "/";
#if UNITY_WEBGL && !UNITY_EDITOR
            JM_FetchBytes(root + FileName, root + PlainName, 0, OnBytes);
#else
            _failed = true;
#endif
        }

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        static extern void JM_FetchBytes(string url, string plainUrl, int id, Action<int, IntPtr, int> callback);
#endif

        [AOT.MonoPInvokeCallback(typeof(Action<int, IntPtr, int>))]
        static void OnBytes(int id, IntPtr ptr, int length)
        {
            if (length < 0)
            {
                if (++_tries < Tries) { Fetch(); return; }
                _failed = true;
                Debug.LogError("[Content] terrain file did not arrive — the world has no ground");
                return;
            }
            var bytes = new byte[length];
            Marshal.Copy(ptr, bytes, 0, length);
            Marshal.FreeHGlobal(ptr);
            try
            {
                _grids = TerrainPayload.Decode(bytes);
                Debug.Log($"[Content] terrain {length / 1e6f:0.0} MB in {Time.realtimeSinceStartup - _t0:0.0} s");
            }
            catch (Exception e)
            {
                _failed = true;
                Debug.LogError($"[Content] terrain file unreadable: {e.Message}");
            }
        }

        void Awake()
        {
            if (!placeholder) return;
            if (_grids == null)
            {
                Debug.LogError("[Content] terrain placeholder without its file");
                return;
            }
            var terrain = GetComponent<Terrain>();
            TerrainPayload.Apply(_grids, terrain.terrainData);
            terrain.Flush();
            _grids = null; // the managed copy is not needed any more (WASM heap)
        }
    }
}
