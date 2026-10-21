using System.Collections;
using JapanMap.Gameplay.Menu;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace JapanMap.Tests.Content
{
    /// <summary>
    /// PostcardSet.Request as a menu tile uses it: the set streams in once, every waiting tile gets its picture, a later
    /// request answers at once, and an id without a card never calls back (the tile keeps its plain look).
    /// </summary>
    public class PostcardRequestTests
    {
        [UnityTest, Timeout(60000)]
        public IEnumerator Request_LoadsOnce_AnswersKnownIds_IgnoresUnknown()
        {
            Texture2D a = null, b = null;
            var unknown = false;
            PostcardSet.Request(PostcardSet.EventId("neon-circuit"), t => a = t);
            PostcardSet.Request(PostcardSet.PlaceId("temple"), t => b = t);
            PostcardSet.Request("event/no-such-race", _ => unknown = true);
            for (var w = 0f; (a == null || b == null) && w < 20f; w += Time.unscaledDeltaTime) yield return null;
            Assert.NotNull(a, "race card arrives");
            Assert.NotNull(b, "place card arrives");
            Assert.AreEqual(768, a.width);
            Assert.NotNull(PostcardSet.Loaded);

            Texture2D again = null;
            PostcardSet.Request(PostcardSet.EventId("neon-circuit"), t => again = t);
            Assert.AreSame(a, again, "a loaded set answers at once");
            for (var f = 0; f < 10; f++) yield return null;
            Assert.IsFalse(unknown, "no callback for an id without a card");
        }
    }
}
