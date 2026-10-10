using JapanMap.Gameplay.Records;
using JapanMap.UI;
using UnityEngine.UIElements;

namespace JapanMap.Gameplay.Menu
{
    /// <summary>The Photo tab starts photo mode from the current view (ASTRA §10: "Photo tab or P").</summary>
    public sealed class PhotoScreen : MenuScreen
    {
        readonly PhotoMode _photo;

        public PhotoScreen(PhotoMode photo) => _photo = photo;

        public override string Title => "Photo";
        public override Icon Icon => Icon.Photo;
        public override bool Action => true;

        public override void Build(VisualElement body) => _photo.Open();
    }
}
