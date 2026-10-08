using System.Text;
using UnityEngine;

namespace JapanMap.Tests.Vehicles
{
    /// <summary>Writes every body contact above an impulse threshold into a trace (debugging drives).</summary>
    public sealed class BodyContactLog : MonoBehaviour
    {
        [System.NonSerialized] public StringBuilder sb;
        [System.NonSerialized] public System.Func<float> time;
        [System.NonSerialized] public float minImpulse;

        void OnCollisionEnter(Collision c) => Log("enter", c);
        void OnCollisionStay(Collision c) => Log("stay", c);

        void Log(string kind, Collision c)
        {
            if (sb == null || c.impulse.magnitude < minImpulse) return;
            var n = c.contactCount > 0 ? c.GetContact(0).normal : Vector3.zero;
            var p = c.contactCount > 0 ? c.GetContact(0).point : Vector3.zero;
            sb.AppendLine($"   {time():F2} BODY {kind} {c.collider.name} n={n:F2} at {p:F2} impulse {c.impulse.magnitude:F0}");
        }
    }
}
