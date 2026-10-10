using JapanMap.Core;

namespace JapanMap.World
{
    /// <summary>Boot waits for the terrain (it has no fallback; Required gate).</summary>
    public sealed class StartContentGate : GameSystem, IBootGate
    {
        public bool Ready => StreamedTerrain.Ready;
        public bool Required => true;

        protected override void OnInitialize() => StreamedTerrain.Preload();
    }
}
