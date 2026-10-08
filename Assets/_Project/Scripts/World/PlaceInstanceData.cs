using UnityEngine;

namespace JapanMap.World
{
    /// <summary>
    /// Library models of a large place (Tokyo: ~5 000 facade modules) drawn instanced instead of as
    /// GameObjects — one GameObject per module was thousands of draw calls. Written by the place import;
    /// each instance keeps its full matrix (frontage modules are stretched in width and depth).
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/World/Place Instance Data")]
    public sealed class PlaceInstanceData : InstanceData
    {
        public Matrix4x4[] matrices = { };

        public override Matrix4x4 Matrix(int i) => matrices[i];
    }
}
