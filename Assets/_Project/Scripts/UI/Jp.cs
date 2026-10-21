using System.Collections.Generic;

namespace JapanMap.UI
{
    /// <summary>
    /// The Japanese words of the "Night Meet" UI (D55), in one place: they only accompany English (players read the
    /// English), and the Japanese font is a static atlas of exactly these characters (Editor/Ui/UiFonts — run
    /// "JapanMap/UI/Build Fonts" after adding one; FontCoverageTests turns red otherwise).
    /// </summary>
    public static class Jp
    {
        // Menu tabs (kana over the English label).
        public const string Play = "プレイ";
        public const string Garage = "ガレージ";
        public const string Map = "マップ";
        public const string Records = "きろく";
        public const string Settings = "せってい";
        public const string Photo = "しゃしん";

        // Tile kickers.
        public const string Paused = "一時停止";
        public const string Race = "レース";
        public const string Career = "経歴";
        public const string Daily = "今日";
        public const string Home = "帰る";
        public const string NextCar = "次の車";
        public const string Tune = "整備";

        // Hanko stamps.
        public const string Found = "発見";
        public const string Done = "済";
        public const string New = "新";
        public const string Best = "記録";
        public const string Mine = "愛車";
        public const string Finish = "完";
        public const string Rain = "雨";
        public const string Gold = "金";
        public const string Silver = "銀";
        public const string Bronze = "銅";
        public static string Place(int position) => position >= 1 && position <= 9 ? "一二三四五六七八九"[position - 1] + "位" : Finish;

        // Brand and screens.
        public const string Title = "雨上がり";
        public const string Meet = "夜の走行会";
        public const string Result = "結果";
        public const string Loading = "読込中";
        public const string North = "北";
        public const string Landscape = "横向き";
        public const string Controls = "操作";

        // Map pin glyphs.
        public const string PinHome = "家";
        public const string PinPark = "駐";
        public const string PinVillage = "村";
        public const string PinTemple = "寺";
        public const string PinHarbour = "港";
        public const string PinPass = "峠";

        static readonly Dictionary<string, string> Regions = new()
        {
            ["Sakura Commons"] = "桜コモンズ",
            ["Needle Works"] = "ニードル工場",
            ["Tideglass Harbour"] = "潮硝子港",
            ["Neo Tokyo"] = "ネオ東京",
            ["Cinder Pass"] = "灰の峠",
            ["Bellwood"] = "鈴の森",
            ["Stillwater Terraces"] = "静水の棚田",
            ["Longshore"] = "長い浜",
        };

        /// <summary>A region's Japanese name by its English title ("" when there is none).</summary>
        public static string Region(string title) => title != null && Regions.TryGetValue(title, out var jp) ? jp : "";
    }
}
