using System;
using JapanMap.Core;
using JapanMap.UI;
using UnityEngine;

namespace JapanMap.Gameplay.Career
{
    /// <summary>What ticks a career step off — each one a real event or saved fact, never time alone.</summary>
    public enum CareerGoal
    {
        IntroDone, GarageOpen, BuyTune, BuyPaint, DriftChain, Stunt, Burst, Speed, MapOpen, AutoDrive, ReachEvent,
        FinishEvents, MenuPlay, MenuRecords, Photo, FastTravel, TestDrive, OwnCars, MedalTier,
    }

    /// <summary>Where the waypoint goes when a step begins.</summary>
    public enum CareerTarget { None, Garage, NextEvent }

    /// <summary>
    /// The career (D50, docs/CAREER.md): the long first session as data — a chain of steps, each with one goal, the
    /// text the player reads (keys and touch apart), Sparks, and the features it opens (<see cref="Unlocks"/>).
    /// The defaults below are the designed chain; the asset is Data/Gameplay/Career.asset.
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Gameplay/Career Settings", fileName = "Career")]
    public sealed class CareerSettings : ScriptableObject
    {
        [Serializable]
        public struct Step
        {
            [Tooltip("Stable id; the save holds career:<id> once done. Never rename a shipped id.")]
            public string id;
            [Tooltip("Chapter name shown above the goal; consecutive steps with the same name form one chapter.")]
            public string chapter;
            [Tooltip("The goal, imperative (also the 'Unlocks: …' line of what it opens).")]
            public string title;
            [Tooltip("How, with keys (desktop).")]
            public string hint;
            [Tooltip("How, on a touch screen (button names, no keys).")]
            public string touchHint;
            public CareerGoal goal;
            [Tooltip("Goal amount: drift points, km/h, events, cars, medal tier (1 bronze … 3 gold).")]
            public float amount;
            [Tooltip("Sparks on completion (on top of what the action pays itself).")]
            public int reward;
            public FeatureId[] unlocks;
            public CareerTarget waypoint;
            [Tooltip("A buy step: tops the balance up once to the cheapest thing it asks for — never a dead end.")]
            public bool fund;
            [Tooltip("Estimated seconds for a first-time player (docs/CAREER.md, the economy table).")]
            public float typicalSeconds;
        }

        [Serializable]
        public struct Feature
        {
            public FeatureId id;
            [Tooltip("Banner title: UNLOCKED · <name>.")]
            public string name;
            public string blurb;
            public Icon icon;
        }

        public Step[] steps =
        {
            new() { id = "first-drive", chapter = "First Drive", title = "Finish the first drive", hint = "", touchHint = "",
                goal = CareerGoal.IntroDone, unlocks = new[] { FeatureId.Garage, FeatureId.Tuning }, typicalSeconds = 90 },
            new() { id = "open-bay", chapter = "Open Bay", title = "Drive into the Open Bay", hint = "Follow the arrow · stop at the bay, press E",
                touchHint = "Follow the arrow · stop at the bay, tap USE", goal = CareerGoal.GarageOpen, reward = 100, waypoint = CareerTarget.Garage, typicalSeconds = 20 },
            new() { id = "first-upgrade", chapter = "Open Bay", title = "Buy your first upgrade", hint = "Tune · pick a part · Street",
                touchHint = "Tune · pick a part · Street", goal = CareerGoal.BuyTune, reward = 300, unlocks = new[] { FeatureId.Paint }, fund = true, typicalSeconds = 40 },
            new() { id = "first-paint", chapter = "Open Bay", title = "Give it a new colour", hint = "Appearance · pick a colour",
                touchHint = "Appearance · pick a colour", goal = CareerGoal.BuyPaint, reward = 200, fund = true, typicalSeconds = 30 },
            new() { id = "drift-chain", chapter = "Street Skills", title = "Bank a {0:N0} point drift", hint = "Hold Space and steer · let go to bank",
                touchHint = "Hold DRIFT and steer · let go to bank", goal = CareerGoal.DriftChain, amount = 2000, reward = 200, typicalSeconds = 45 },
            new() { id = "stunt", chapter = "Street Skills", title = "Pull a stunt", hint = "Space twice · steer for a 360",
                touchHint = "Tap STUNT · steer for a 360", goal = CareerGoal.Stunt, reward = 200, typicalSeconds = 30 },
            new() { id = "burst", chapter = "Street Skills", title = "Fire a nitro burst", hint = "Shift twice, fast",
                touchHint = "Tap BOOST twice, fast", goal = CareerGoal.Burst, reward = 200, typicalSeconds = 20 },
            new() { id = "top-speed", chapter = "Street Skills", title = "Hit {0:0} km/h", hint = "Find a long road · nitro helps",
                touchHint = "Find a long road · BOOST helps", goal = CareerGoal.Speed, amount = 160, reward = 200,
                unlocks = new[] { FeatureId.Map, FeatureId.Waypoints, FeatureId.Races }, typicalSeconds = 40 },
            new() { id = "open-map", chapter = "First Race", title = "Open the map", hint = "M", touchHint = "MENU · Map",
                goal = CareerGoal.MapOpen, reward = 100, unlocks = new[] { FeatureId.AutoDrive }, typicalSeconds = 20 },
            new() { id = "auto-drive", chapter = "First Race", title = "Let the car drive you there", hint = "Auto-drive · steer to take over",
                touchHint = "AUTO · steer to take over", goal = CareerGoal.AutoDrive, reward = 200, waypoint = CareerTarget.NextEvent, typicalSeconds = 30 },
            new() { id = "reach-race", chapter = "First Race", title = "Get to the start", hint = "Follow the arrow to the beacon",
                touchHint = "Follow the arrow to the beacon", goal = CareerGoal.ReachEvent, amount = 30, waypoint = CareerTarget.NextEvent, typicalSeconds = 60 },
            new() { id = "first-race", chapter = "First Race", title = "Finish your first race", hint = "Stop at the beacon · E to join",
                touchHint = "Stop at the beacon · tap USE to join", goal = CareerGoal.FinishEvents, amount = 1, reward = 500,
                unlocks = new[] { FeatureId.Daily, FeatureId.Records }, waypoint = CareerTarget.NextEvent, typicalSeconds = 240 },
            new() { id = "daily", chapter = "Every Day", title = "Check today's challenge", hint = "Esc · Play", touchHint = "MENU · Play",
                goal = CareerGoal.MenuPlay, reward = 100, typicalSeconds = 15 },
            new() { id = "records", chapter = "Every Day", title = "Look at your records", hint = "Tab", touchHint = "MENU · Records",
                goal = CareerGoal.MenuRecords, reward = 100, unlocks = new[] { FeatureId.Photo }, typicalSeconds = 15 },
            new() { id = "photo", chapter = "Picture It", title = "Take a photo", hint = "P · frame it · Enter", touchHint = "MENU · Photo · tap the shutter",
                goal = CareerGoal.Photo, reward = 200, unlocks = new[] { FeatureId.FastTravel }, typicalSeconds = 45 },
            new() { id = "fast-travel", chapter = "Go Places", title = "Fast travel anywhere", hint = "M · pick a place · Travel",
                touchHint = "MENU · Map · pick a place · Travel", goal = CareerGoal.FastTravel, reward = 100,
                unlocks = new[] { FeatureId.TestDrive, FeatureId.CarShop }, typicalSeconds = 30 },
            new() { id = "test-drive", chapter = "Second Car", title = "Test drive another car", hint = "Esc · Cars · pick one · Test drive",
                touchHint = "MENU · Cars · pick one · Test drive", goal = CareerGoal.TestDrive, reward = 200, typicalSeconds = 90 },
            new() { id = "second-car", chapter = "Second Car", title = "Buy your second car", hint = "Esc · Cars · Buy", touchHint = "MENU · Cars · Buy",
                goal = CareerGoal.OwnCars, amount = 2, reward = 500, fund = true, typicalSeconds = 60 },
            new() { id = "three-events", chapter = "Make a Name", title = "Finish {0:0} different events", hint = "Follow the arrow to the next one",
                touchHint = "Follow the arrow to the next one", goal = CareerGoal.FinishEvents, amount = 3, reward = 500, waypoint = CareerTarget.NextEvent, typicalSeconds = 480 },
            new() { id = "silver", chapter = "Make a Name", title = "Take silver or better", hint = "Second place, or a silver score",
                touchHint = "Second place, or a silver score", goal = CareerGoal.MedalTier, amount = 2, reward = 500, waypoint = CareerTarget.NextEvent, typicalSeconds = 240 },
        };

        public Feature[] features =
        {
            new() { id = FeatureId.Garage, name = "Open Bay", blurb = "Your garage at Sakura Commons", icon = Icon.Garage },
            new() { id = FeatureId.Tuning, name = "Tuning", blurb = "Engine, brakes, suspension, tyres", icon = Icon.Tune },
            new() { id = FeatureId.Paint, name = "Paint & looks", blurb = "Colours, rims and body kits", icon = Icon.Car },
            new() { id = FeatureId.Map, name = "Map", blurb = "Press M · set a waypoint anywhere", icon = Icon.Map },
            new() { id = FeatureId.Waypoints, name = "Waypoints", blurb = "A line on the road to wherever you point", icon = Icon.Map },
            new() { id = FeatureId.Races, name = "Events", blurb = "Races, time trials and drift runs", icon = Icon.Flag },
            new() { id = FeatureId.AutoDrive, name = "Auto-drive", blurb = "The car drives itself to your waypoint", icon = Icon.Wheel },
            new() { id = FeatureId.Daily, name = "Daily challenge", blurb = "A new goal every day, a streak bonus", icon = Icon.Daily },
            new() { id = FeatureId.Records, name = "Records", blurb = "Top speed, longest jump, best times", icon = Icon.Records },
            new() { id = FeatureId.Photo, name = "Photo mode", blurb = "Press P · frame your car", icon = Icon.Photo },
            new() { id = FeatureId.FastTravel, name = "Fast travel", blurb = "Jump to any place you have found", icon = Icon.Home },
            new() { id = FeatureId.TestDrive, name = "Test drives", blurb = "Try any car for free", icon = Icon.Car },
            new() { id = FeatureId.CarShop, name = "Car dealer", blurb = "Nine more cars to own", icon = Icon.Car },
        };

        [Header("Rewards")]
        [Tooltip("Sparks for the whole career, with the 'Career complete' banner.")]
        public int completeReward = 1000;
        [Tooltip("Skip tutorial: what the skipped first drive and first steps would have paid, roughly (a skipper can buy a part at once).")]
        public int skipSparks = 3000;

        [Header("Feel")]
        [Tooltip("Real seconds the ticked-off goal stays (check mark, +Sparks) before the next one slides in.")]
        public float doneHold = 1.4f;
        [Tooltip("Real seconds an UNLOCKED banner stays.")]
        public float bannerSeconds = 2.6f;
        [Tooltip("After the first drive ends, the first banner waits this long (its last toast stays readable), s.")]
        public float afterIntro = 2.6f;
        [Tooltip("Speed goal: seconds above the target.")]
        public float speedHold = 0.3f;
        [Tooltip("Auto-drive step: when no auto-drive exists in this build, the step passes after this long, s.")]
        public float noAutoDrive = 1.5f;

        public Feature? Info(FeatureId id)
        {
            foreach (var f in features) if (f.id == id) return f;
            return null;
        }
    }
}
