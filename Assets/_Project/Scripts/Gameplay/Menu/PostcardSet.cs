using System;
using System.Collections.Generic;
using JapanMap.Gameplay.Life;
using UnityEngine;

namespace JapanMap.Gameplay.Menu
{
    /// <summary>
    /// Baked postcards for the big menu tiles (races, places): one 768 × 432 picture per id, made offline by
    /// "JapanMap/UI/Bake Postcards" (Editor/Ui/Postcards). Streamed (Addressables "ui/postcards", own group), never in the
    /// start download: the set loads once, on the first <see cref="Request"/>, after real play has begun (LifeContent).
    /// Ids: "event/&lt;eventId&gt;", "place/&lt;travelPointId&gt;".
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/UI/Postcard Set")]
    public sealed class PostcardSet : ScriptableObject
    {
        public const string Address = "ui/postcards";

        [Serializable]
        public struct Card
        {
            public string id;
            public Texture2D image;
        }

        public Card[] cards = Array.Empty<Card>();

        public static string EventId(string eventId) => "event/" + eventId;
        public static string PlaceId(string travelPointId) => "place/" + travelPointId;

        public Texture2D Find(string id)
        {
            foreach (var c in cards) if (c.id == id) return c.image;
            return null;
        }

        static PostcardSet _set;
        static bool _loading, _failed;
        static readonly List<(string id, Action<Texture2D> done)> Waiting = new();

        /// <summary>The loaded set (null until it is there).</summary>
        public static PostcardSet Loaded => _set;

        /// <summary>
        /// Calls <paramref name="done"/> with the postcard of <paramref name="id"/> — at once when the set is loaded,
        /// else when it arrives; never when there is no picture for the id (the tile keeps its plain look).
        /// </summary>
        public static void Request(string id, Action<Texture2D> done)
        {
            if (done == null || string.IsNullOrEmpty(id) || !Application.isPlaying) return;
            if (_set != null)
            {
                var tex = _set.Find(id);
                if (tex != null) done(tex);
                return;
            }
            if (_failed) return;
            Waiting.Add((id, done));
            if (_loading) return;
            _loading = true;
            PostcardLoader.Run(LifeContent.Load<PostcardSet>(Address, Arrived));
        }

        /// <summary>The load coroutine ended: LifeContent warns and never calls back on a failed load — stop asking for the
        /// rest of the session.</summary>
        internal static void LoadEnded()
        {
            if (_set != null) return;
            _loading = false;
            _failed = true;
            Waiting.Clear();
        }

        static void Arrived(PostcardSet set)
        {
            _set = set;
            _loading = false;
            var waiting = Waiting.ToArray();
            Waiting.Clear();
            foreach (var (id, done) in waiting)
            {
                var tex = set.Find(id);
                if (tex != null) done(tex);
            }
        }

        // Statics survive play-mode restarts in the editor (no domain reload).
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics()
        {
            _set = null;
            _loading = _failed = false;
            Waiting.Clear();
        }


    }
}
