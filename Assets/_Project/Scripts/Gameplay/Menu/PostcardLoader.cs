using UnityEngine;

namespace JapanMap.Gameplay.Menu
{
    /// <summary>
    /// A hidden host for <see cref="PostcardSet"/>'s load coroutine: the requester (a menu tile) may be rebuilt before
    /// it ends. Its own file: Unity loses a MonoBehaviour that shares a file with another class (ScriptFileTests).
    /// </summary>
    internal sealed class PostcardLoader : MonoBehaviour
    {
        static PostcardLoader _host;

        public static void Run(System.Collections.IEnumerator work)
        {
            if (_host == null)
            {
                var go = new GameObject("PostcardLoader") { hideFlags = HideFlags.HideAndDontSave };
                DontDestroyOnLoad(go);
                _host = go.AddComponent<PostcardLoader>();
            }
            _host.StartCoroutine(Watch(work));
        }

        static System.Collections.IEnumerator Watch(System.Collections.IEnumerator work)
        {
            yield return work;
            PostcardSet.LoadEnded();
        }
    }
}
