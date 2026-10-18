using UnityEngine;
using UnityEngine.InputSystem;

namespace JapanMap.Vehicles
{
    /// <summary>
    /// Car lamps (D52): headlights, tail and brake lights, reversing light. Every car-lab car glows (emission); only the
    /// player's car throws real light, per quality tier (High, Medium, Low): spot lights, a beam pattern on the road and a
    /// faint light cone. URP light cookies stay off (they double the lit shader variants, D36) — the pattern on the road
    /// comes from the additive beam quad instead.
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Vehicles/Headlight Settings")]
    public sealed class HeadlightSettings : ScriptableObject
    {
        [Tooltip("Drive.inputactions: the Drive/Headlights action (L, gamepad LB) toggles; a double tap is the high beam.")]
        public InputActionAsset actions;

        [Header("Per tier (High, Medium, Low)")]
        [Tooltip("Real spot lights on the player's car: two (one per lamp), one (centred), none.")]
        public Vector3Int spots = new(2, 1, 0);
        [Tooltip("Faint additive light cones in front of the lamps (1 = on).")]
        public Vector3Int cones = new(1, 0, 0);
        [Tooltip("Brightness of the beam pattern on the road. The wet road mirrors the spots away from the driver, so the pattern carries most of what the driver sees; Low has no spot at all.")]
        public Vector3 poolStrength = new(0.45f, 0.6f, 0.85f);

        [Header("Spot lights")]
        public Color lightColor = new(1f, 0.93f, 0.82f);
        [Tooltip("Intensity of one spot (the single Medium spot gets both lamps' worth).")]
        public float lowIntensity = 140f;
        public float lowRange = 42f;
        [Tooltip("Outer and inner cone angle, degrees.")]
        public Vector2 lowAngle = new(70f, 40f);
        [Tooltip("Aimed down by, degrees (a low beam lights the road, not the faces of oncoming drivers).")]
        public float lowPitch = 4f;
        public float highIntensity = 260f;
        public float highRange = 75f;
        public Vector2 highAngle = new(52f, 26f);
        public float highPitch = 0.8f;

        [Header("Beam pattern on the road")]
        public Material beamMaterial;
        [Tooltip("Pattern starts this far ahead of the lamps, m.")]
        public float poolStart = 0.1f;
        [Tooltip("Length and far width of the pattern, low beam, m.")]
        public Vector2 lowPool = new(40f, 13f);
        public Vector2 highPool = new(44f, 14f);
        [Tooltip("Pattern colour (HDR, additive), multiplied by the tier's strength.")]
        public Color poolColor = new(0.95f, 0.82f, 0.62f);
        [Tooltip("From the driver's seat (camera within coneHideDistance) the pattern lies flat to the eye and the grazing fade "
            + "dims its far half: the road was only ~15 % brighter with the lights on (Round 4). Multiplier there.")]
        public float seatPoolBoost = 2.4f;

        [Header("Light cones (High only)")]
        public Material coneMaterial;
        public float coneLength = 7f;
        public float coneRadius = 1.3f;
        public Color coneColor = new(0.05f, 0.048f, 0.042f);
        [Tooltip("Cones hide when the camera is this close to the car (cockpit view: no haze over the windscreen), m.")]
        public float coneHideDistance = 2.5f;

        [Header("Lamp glass (emission multipliers of the model's own glow)")]
        public float headOff = 0.04f;
        public float headOn = 1.6f;
        public float headHigh = 2.4f;
        public float tailOff = 0.08f;
        public float tailOn = 1f;
        public float brake = 4.5f;
        [Tooltip("How fast lamps fade between states, 1/s.")]
        public float fade = 14f;

        [Header("Glow sprites (reversing light; rear light of cars without tail lamps)")]
        public Material glowMaterial;
        public Color reverseColor = new(2.2f, 2.2f, 2.1f);
        public float reverseSize = 0.22f;
        [Tooltip("A white spot backwards while reversing (High and Medium), intensity and range.")]
        public Vector2 reverseLight = new(20f, 12f);
        public Color rainLightColor = new(2.4f, 0.08f, 0.06f);

        [Header("Pop-up headlights (popup_L/R)")]
        [Tooltip("Opening angle about the hinge, degrees (car lab: 1.05 rad).")]
        public float popupAngle = -60f;
        public float popupSpeed = 5f;
    }
}
