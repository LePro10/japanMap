using System;
using UnityEngine;

namespace JapanMap.Gameplay.Progress
{
    public enum DailyGoal { TopSpeed, DriftChain, JumpDistance, Airtime, FinishEvent, Distance, Discovery }

    /// <summary>
    /// A reason to come back tomorrow (CrazyGames: "daily hooks like login bonuses or quests" lift day-1 retention;
    /// there was none, 2026-10-13): Sparks for the first drive of each day, growing with the streak, and one challenge
    /// a day — the same one for every player that day.
    /// </summary>
    [CreateAssetMenu(menuName = "JapanMap/Gameplay/Daily Settings")]
    public sealed class DailySettings : ScriptableObject
    {
        [Serializable]
        public struct Challenge
        {
            public DailyGoal goal;
            [Tooltip("Shown on the card; {0} is the target.")]
            public string title;
            public float target;
            public int reward;
        }

        [Tooltip("Sparks for day 1, 2, 3 … of a streak; the last value repeats.")]
        public int[] streakRewards = { 300, 400, 500, 650, 800, 1000, 1500 };
        [Tooltip("The bonus waits until the first drive has ended and the player has played this long, s.")]
        public float delay = 4f;

        public Challenge[] challenges =
        {
            new() { goal = DailyGoal.TopSpeed, title = "Hit {0:0} km/h", target = 170f, reward = 700 },
            new() { goal = DailyGoal.DriftChain, title = "Bank a {0:N0} point drift chain", target = 4000f, reward = 800 },
            new() { goal = DailyGoal.JumpDistance, title = "Jump {0:0} m off a ramp", target = 35f, reward = 700 },
            new() { goal = DailyGoal.Airtime, title = "Stay {0:0.0} s in the air", target = 2.2f, reward = 700 },
            new() { goal = DailyGoal.FinishEvent, title = "Finish {0:0} events", target = 2f, reward = 900 },
            new() { goal = DailyGoal.Distance, title = "Drive {0:0} km", target = 8f, reward = 600 },
            new() { goal = DailyGoal.Discovery, title = "Find {0:0} discovery", target = 1f, reward = 800 },
        };
    }
}
