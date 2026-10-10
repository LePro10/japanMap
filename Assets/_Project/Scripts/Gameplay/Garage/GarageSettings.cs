using UnityEngine;

namespace JapanMap.Gameplay.Garage
{
    /// <summary>
    /// Where the garage is and how it is framed. The Open Bay of Sakura Commons (ASTRA §2: the garage of the
    /// starting court; legacy GarageStage was a closed indoor bay). Positions measured from the Open Bay colliders
    /// (opening x 568–576 at z −484.9, lift slab at z −477.5).
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Gameplay/Garage Settings")]
    public sealed class GarageSettings : ScriptableObject
    {
        [Tooltip("Middle of the entry zone in front of the bay door (x, z).")]
        public Vector2 entry = new(572f, -491f);
        public float entryRadius = 8f;
        [Tooltip("The garage opens only below this speed, km/h (same rule as joining an event).")]
        public float entryKmh = 15f;
        [Tooltip("Where the car stands while the garage is open (x, y, z) and its heading.")]
        public Vector3 bay = new(572f, 27f, -481f);
        public float bayHeading = 180f;
        [Tooltip("Where the car is put when the garage closes, facing out of the court.")]
        public Vector3 exit = new(572f, 27f, -492f);
        public float exitHeading = 180f;
        [Tooltip("Garage camera position and the point it looks at.")]
        public Vector3 cameraAt = new(576.5f, 28.6f, -489.5f);
        public Vector3 lookAt = new(572f, 27.6f, -481f);
        public float fieldOfView = 45f;
        [Tooltip("Free test drive of a car not owned, s (ASTRA §6/§10: 90).")]
        public float testDriveSeconds = 90f;
        [Tooltip("Where a test drive starts (the practice spur out of the court) and its heading.")]
        public Vector3 testDriveAt = new(572f, 27f, -492f);
        public float testDriveHeading = 180f;
        [Tooltip("Changes made in the menu reach the car once it is slower than this, km/h (never swap a car at speed).")]
        public float applyBelowKmh = 8f;
    }
}
