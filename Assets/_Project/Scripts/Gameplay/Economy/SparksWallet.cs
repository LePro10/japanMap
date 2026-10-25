using System;
using UnityEngine;

namespace JapanMap.Gameplay.Economy
{
    /// <summary>
    /// The player's Sparks. Scores convert at a fixed rate with a rolling cap (<see cref="ScoreSparkBank"/>).
    /// The balance is restored from the save by <c>Progress</c>; every change raises <see cref="Changed"/>.
    /// </summary>
    public sealed class SparksWallet : MonoBehaviour
    {
        [SerializeField] EconomySettings settings;

        readonly ScoreSparkBank _bank = new();

        public EconomySettings Settings => settings;
        public int Balance { get; private set; }
        /// <summary>amount, reason — for the HUD.</summary>
        public event Action<int, string> Earned;
        /// <summary>Any change of the balance (earn, spend, load).</summary>
        public event Action Changed;
        /// <summary>When set, nothing is earned (secret practice turbo, test drives — ASTRA §9).</summary>
        public bool Frozen { get; set; }

        /// <summary>Sandbox: every purchase succeeds and costs nothing (legacy Profile: tune and paint free).</summary>
        public bool Free { get; set; }

        public void Configure(EconomySettings s) => settings = s;

        /// <summary>Would <see cref="Spend"/> succeed? Shops ask this, never the balance, so the sandbox opens every button.</summary>
        public bool CanAfford(int amount) => amount >= 0 && (Free || amount <= Balance);

        public void Add(int amount, string reason)
        {
            if (amount <= 0 || Frozen) return;
            Balance = Mathf.Min(settings != null ? settings.maxBalance : int.MaxValue, Balance + amount);
            Earned?.Invoke(amount, reason);
            Changed?.Invoke();
        }

        /// <summary>Pays <paramref name="amount"/> if the balance allows it; false leaves the balance untouched.</summary>
        public bool Spend(int amount)
        {
            if (!CanAfford(amount)) return false;
            if (amount == 0 || Free) return true;
            Balance -= amount;
            Changed?.Invoke();
            return true;
        }

        /// <summary>Balance from the save (clamped, never negative).</summary>
        public void Restore(int balance)
        {
            Balance = Mathf.Clamp(balance, 0, settings != null ? settings.maxBalance : int.MaxValue);
            Changed?.Invoke();
        }

        /// <summary>Converts banked drift/stunt score; returns the Sparks actually paid (cap applied).</summary>
        public int AddScore(float score, string reason) => AddScore(score, reason, Time.time);

        public int AddScore(float score, string reason, float now)
        {
            if (Frozen) return 0;
            var paid = _bank.Convert(settings, score, now);
            if (paid > 0) Add(paid, reason);
            return paid;
        }
    }
}
