using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Editor.Map
{
    /// <summary>
    /// Generated meshes are stored as assets so scene files stay small and re-imports keep GUIDs.
    /// </summary>
    public static class MeshAssets
    {
        /// <summary>
        /// Writes <paramref name="mesh"/> to <paramref name="path"/>. An existing asset is refilled
        /// through the Mesh API — EditorUtility.CopySerialized updated the data but left the GPU buffers
        /// of the old mesh in place, so a re-import drew the previous geometry until Unity restarted.
        /// </summary>
        public static Mesh Save(string path, Mesh mesh, bool compact = false)
        {
            var existing = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            mesh.name = System.IO.Path.GetFileNameWithoutExtension(path);
            if (existing == null)
            {
                if (compact) Compact(mesh);
                AssetDatabase.CreateAsset(mesh, path);
                return mesh;
            }
            existing.Clear();
            existing.indexFormat = mesh.indexFormat;
            existing.SetVertices(mesh.vertices);
            existing.SetNormals(mesh.normals);
            if (mesh.tangents.Length > 0) existing.SetTangents(mesh.tangents);
            var uv = new List<Vector2>();
            mesh.GetUVs(0, uv);
            if (uv.Count > 0) existing.SetUVs(0, uv);
            // Extra channels (UV3 = road data for the wet surface shader); cleared above when absent.
            var data = new List<Vector4>();
            for (var ch = 1; ch < 4; ch++)
            {
                mesh.GetUVs(ch, data);
                if (data.Count > 0) existing.SetUVs(ch, data);
            }
            existing.subMeshCount = mesh.subMeshCount;
            for (var s = 0; s < mesh.subMeshCount; s++) existing.SetTriangles(mesh.GetTriangles(s), s);
            existing.RecalculateBounds();
            if (compact) Compact(existing);
            EditorUtility.SetDirty(existing);
            Object.DestroyImmediate(mesh);
            return existing;
        }

        /// <summary>
        /// Smaller vertices for the big generated meshes (roads, paddies are in the start download): normals, tangents
        /// and the extra UV channels as 16-bit floats; positions and UV0 stay 32-bit (UV0.y carries the road's length,
        /// up to kilometres). Roads 64 → 44 bytes per vertex.
        /// </summary>
        public static void Compact(Mesh m)
        {
            var layout = new List<UnityEngine.Rendering.VertexAttributeDescriptor>();
            foreach (var a in m.GetVertexAttributes())
            {
                var d = a;
                d.stream = 0;
                switch (a.attribute)
                {
                    case UnityEngine.Rendering.VertexAttribute.Position:
                    case UnityEngine.Rendering.VertexAttribute.TexCoord0:
                        break;
                    case UnityEngine.Rendering.VertexAttribute.Normal:
                    case UnityEngine.Rendering.VertexAttribute.Tangent:
                        d.format = UnityEngine.Rendering.VertexAttributeFormat.Float16;
                        d.dimension = 4;
                        break;
                    default:
                        if (a.format == UnityEngine.Rendering.VertexAttributeFormat.Float32)
                        {
                            d.format = UnityEngine.Rendering.VertexAttributeFormat.Float16;
                            d.dimension = a.dimension <= 2 ? 2 : 4;
                        }
                        break;
                }
                layout.Add(d);
            }
            m.SetVertexBufferParams(m.vertexCount, layout.ToArray());
        }
    }
}
