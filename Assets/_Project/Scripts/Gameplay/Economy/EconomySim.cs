using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using JapanMap.Gameplay.Drift;
using JapanMap.Gameplay.Races;
using JapanMap.Vehicles;
using UnityEngine;

namespace JapanMap.Gameplay.Economy
{
    /// <summary>
    /// Simulates ten-minute sessions from the game's real sources and rules — event payouts and measured
    /// event times, the drift chain itself, the score bank with its cap, region/discovery/medal/milestone
    /// payments — and sets them against car and tuning prices. The table is docs/ECONOMY.md; a test keeps
    /// it current and checks the ASTRA band (2 400–3 600 per ordinary session).
    /// </summary>
    public sealed class EconomySim
    {
        public const float Session = 600f;

        /// <summary>A way of playing for ten minutes; one-time bonuses are listed separately.</summary>
        public struct Profile
        {
            public string name;
            public string how;
            public int sparks;
            public int oneTime;
            /// <summary>Ordinary session: must land in the band. Otherwise a drift-only or first-visit reference.</summary>
            public bool ordinary;
            /// <summary>Drift only: limited by the score cap, should come close to the band (ASTRA: "can approach it").</summary>
            public bool approach;
        }

        public struct EventRate
        {
            public string id, title, result;
            public float seconds, cycle;
            public int sparks;
            public float PerMinute => sparks / cycle * 60f;
        }

        /// <summary>A drift pattern: chains of this length at this speed/angle, gaps between, a crash every n-th chain.</summary>
        public struct DriftStyle
        {
            public string name;
            public float chainSeconds, gapSeconds, kmh, angle, switchEvery;
            public int crashEvery;
            public bool inZone;
        }

        readonly EconomySettings _e;
        readonly DriftSettings _d;
        readonly RaceEventSet _events;
        readonly VehicleFleet _fleet;
        readonly TuningSettings _tuning;

        /// <summary>Time around an event: drive to the next beacon, read the card, look at the result, s.</summary>
        public float travelSeconds = 60f, joinSeconds = 15f, resultSeconds = 10f;

        public static readonly DriftStyle Casual = new()
        {
            name = "Drift, gelegentlich", chainSeconds = 6f, gapSeconds = 4f, kmh = 45f, angle = 22f, crashEvery = 4, inZone = true,
        };
        public static readonly DriftStyle Skilled = new()
        {
            name = "Drift, geübt", chainSeconds = 25f, gapSeconds = 4f, kmh = 60f, angle = 35f, switchEvery = 3f, crashEvery = 5, inZone = true,
        };

        public EconomySim(EconomySettings e, DriftSettings d, RaceEventSet events, VehicleFleet fleet, TuningSettings tuning)
        {
            _e = e;
            _d = d;
            _events = events;
            _fleet = fleet;
            _tuning = tuning;
        }

        /// <summary>
        /// What one event pays at an ordinary result: races 2nd place (65 % of the bonus), time trials within
        /// 10 % of the benchmark (half bonus), drift events silver (two thirds) — RaceDirector's own rules.
        /// </summary>
        public EventRate Rate(RaceEventSet.Event ev)
        {
            int sparks;
            string result;
            switch (ev.kind)
            {
                case RaceKind.Race:
                    sparks = ev.completion + Mathf.RoundToInt(ev.bonus * 0.65f);
                    result = "2.";
                    break;
                case RaceKind.TimeTrial:
                    sparks = ev.completion + ev.bonus / 2;
                    result = "≤ 10 % über Ziel";
                    break;
                default:
                    sparks = ev.completion + ev.bonus * 2 / 3;
                    result = "Silber";
                    break;
            }
            var seconds = ev.typicalSeconds > 0f ? ev.typicalSeconds : 150f;
            return new EventRate
            {
                id = ev.id, title = ev.title, result = result, seconds = seconds, sparks = sparks,
                cycle = seconds + travelSeconds + joinSeconds + resultSeconds,
            };
        }

        public List<EventRate> EventRates() => _events.events.Select(Rate).ToList();

        /// <summary>Sparks from free-roam drift in <paramref name="seconds"/>, through DriftChain and the score bank.</summary>
        public int DriftSparks(DriftStyle style, float seconds, out float banked)
        {
            const float dt = 1f / 50f;
            var chain = new DriftChain(_d);
            var bank = new ScoreSparkBank();
            var paid = 0;
            var chains = 0;
            float t = 0f, inChain = 0f, flip = 0f;
            var side = 1f;
            var pendingCrash = false;
            chain.Ended += (end, credit, _) => paid += bank.Convert(_e, credit, t);
            while (t < seconds)
            {
                var drifting = inChain < style.chainSeconds;
                if (drifting && style.switchEvery > 0f && (flip += dt) >= style.switchEvery)
                {
                    flip = 0f;
                    side = -side;
                }
                var v = style.kmh / 3.6f;
                var slip = drifting ? side * style.angle * Mathf.Deg2Rad : 0f;
                chain.Step(dt, new DriftSample { speed = v, forwardSpeed = v, slip = slip, inZone = style.inZone });
                inChain += dt;
                if (drifting && inChain >= style.chainSeconds)
                {
                    chains++;
                    pendingCrash = style.crashEvery > 0 && chains % style.crashEvery == 0;
                    if (pendingCrash) chain.Contact(_d.crashKmh + 5f);
                }
                if (inChain >= style.chainSeconds + style.gapSeconds) inChain = 0f;
                t += dt;
            }
            chain.Bank();
            banked = chain.Banked;
            return paid;
        }

        /// <summary>Sparks from as many events as fit, at the catalogue's average rate (a session cuts events anywhere).</summary>
        public int RacingSparks(float seconds)
        {
            var rates = EventRates();
            var sparks = rates.Sum(r => r.sparks);
            var time = rates.Sum(r => r.cycle);
            return Mathf.RoundToInt(sparks / time * seconds);
        }

        public List<Profile> Profiles()
        {
            var list = new List<Profile>();
            var racing = RacingSparks(Session);
            list.Add(new Profile
            {
                name = "Rennfahrer", ordinary = true, sparks = racing,
                how = $"Veranstaltungen nacheinander, je {travelSeconds:0} s Anfahrt + {joinSeconds:0} s Karte + {resultSeconds:0} s Ergebnis; gewöhnliches Ergebnis",
            });
            list.Add(new Profile
            {
                name = Skilled.name, approach = true, sparks = DriftSparks(Skilled, Session, out _),
                how = $"Ketten {Skilled.chainSeconds:0} s mit {Skilled.kmh:0} km/h, {Skilled.angle:0}°, Seitenwechsel alle {Skilled.switchEvery:0} s, jede {Skilled.crashEvery}. Kette ein Crash; in der Driftzone",
            });
            var mixedRace = RacingSparks(Session / 2f);
            var mixedDrift = DriftSparks(Casual, Session / 2f, out _);
            list.Add(new Profile
            {
                name = "Gemischt", ordinary = true, sparks = mixedRace + mixedDrift,
                how = "5 min Veranstaltungen + 5 min gelegentlich driften",
            });
            list.Add(new Profile
            {
                name = Casual.name, ordinary = false, sparks = DriftSparks(Casual, Session, out _),
                how = $"Ketten {Casual.chainSeconds:0} s mit {Casual.kmh:0} km/h, {Casual.angle:0}°, jede {Casual.crashEvery}. Kette ein Crash; in der Driftzone — Einstieg, kein Ziel-Profil",
            });
            // First visit: three regions, two discoveries, one event with its first medal, two easy
            // milestones (160 km/h, 10 km), the rest casual drift — one-time money listed apart.
            var firstEvent = Rate(_events.events[0]);
            var firstDrift = DriftSparks(Casual, Session - firstEvent.cycle - 240f, out _);
            list.Add(new Profile
            {
                name = "Erste Sitzung", ordinary = false, sparks = firstEvent.sparks + firstDrift,
                oneTime = 3 * _e.regionReward + 2 * _e.discoveryReward + _e.firstMedalReward + 2 * MilestoneReward(),
                how = $"3 Regionen + 2 Entdeckungen (4 min), 1 Veranstaltung ({firstEvent.title}) mit erster Medaille, 2 Meilensteine, Rest gelegentlich driften",
            });
            return list;
        }

        /// <summary>Drift-only sessions are capped (400 per 90 s = 2 667 per 10 min); they should reach 90 % of the band's floor.</summary>
        public float ApproachFloor => _e.sessionBand.x * 0.9f;
        public float DriftCeiling => _e.scoreSparkCap * Session / _e.scoreCapWindow;

        int MilestoneReward() => _e.milestones.Length > 0 ? _e.milestones[0].reward : 0;

        public int OneTimeTotal() =>
            _e.regionReward * 8 + _e.allRegionsReward + _e.discoveryReward * 24 + _e.firstMedalReward * _events.events.Length
            + _e.milestones.Sum(m => m.reward);

        public int MedianOrdinary()
        {
            var v = Profiles().Where(p => p.ordinary).Select(p => p.sparks).OrderBy(x => x).ToList();
            return v.Count % 2 == 1 ? v[v.Count / 2] : (v[v.Count / 2 - 1] + v[v.Count / 2]) / 2;
        }

        public int FullTunePrice() => CarTune.All.Sum(c => _tuning.Cost(c, 0, 2));
        public int StreetTunePrice() => CarTune.All.Sum(c => _tuning.Cost(c, 0, 1));

        public string Markdown()
        {
            var ci = CultureInfo.GetCultureInfo("de-DE");
            string N(float x) => x.ToString("#,0", ci);
            var sb = new StringBuilder();
            sb.AppendLine("# Sparks-Wirtschaft — simuliert");
            sb.AppendLine();
            sb.AppendLine("> **Erzeugt** von `EconomySim` (Menü „JapanMap/Economy/Write Table“). Nicht von Hand ändern: der Test");
            sb.AppendLine("> `EconomyTests.Table_IsCurrent` schlägt fehl, sobald Daten und Tabelle auseinanderlaufen.");
            sb.AppendLine($"> Quellen: `Data/Gameplay/EconomySettings`, `RaceEvents` (gemessene Zeiten), `DriftSettings` (Kette), `Data/Vehicles/*` (Preise), `Tuning`.");
            sb.AppendLine();
            sb.AppendLine($"Ziel (ASTRA §9): **{N(_e.sessionBand.x)}–{N(_e.sessionBand.y)} Sparks** je gewöhnlicher 10-Minuten-Sitzung, ohne Einmal-Boni und Werbung; Preiseinheit {N(_e.sessionUnit)}.");
            sb.AppendLine();
            sb.AppendLine("## 10-Minuten-Sitzungen");
            sb.AppendLine();
            sb.AppendLine("| Spielweise | Sparks | einmalig dazu | im Ziel? | Annahme |");
            sb.AppendLine("|---|---:|---:|---|---|");
            foreach (var p in Profiles())
            {
                var ok = p.approach ? (p.sparks >= ApproachFloor ? "nähert sich (Deckel)" : "**zu wenig**")
                    : !p.ordinary ? "—" : p.sparks >= _e.sessionBand.x && p.sparks <= _e.sessionBand.y ? "ja" : "**nein**";
                sb.AppendLine($"| {p.name} | {N(p.sparks)} | {(p.oneTime > 0 ? N(p.oneTime) : "")} | {ok} | {p.how} |");
            }
            sb.AppendLine();
            sb.AppendLine("## Veranstaltungen je Minute");
            sb.AppendLine();
            var rates = EventRates();
            var median = rates.Select(r => r.PerMinute).OrderBy(x => x).ElementAt(rates.Count / 2);
            sb.AppendLine($"Median {N(median)} Sparks/min (mit Anfahrt). ASTRA §11: mehr als {_e.outlierFactor:0.0}× Median = neu abstimmen.");
            sb.AppendLine();
            sb.AppendLine("| Veranstaltung | Ergebnis | Fahrzeit s | Zyklus s | Sparks | Sparks/min |");
            sb.AppendLine("|---|---|---:|---:|---:|---:|");
            foreach (var r in rates)
                sb.AppendLine($"| {r.title} | {r.result} | {r.seconds:0} | {r.cycle:0} | {N(r.sparks)} | {N(r.PerMinute)}{(r.PerMinute > median * _e.outlierFactor ? " ⚠" : "")} |");
            sb.AppendLine();
            sb.AppendLine("## Preise gegen Sitzungen");
            sb.AppendLine();
            var unit = MedianOrdinary();
            sb.AppendLine($"Reines Driften ist durch den Deckel ({_e.scoreSparkCap} je {_e.scoreCapWindow:0} s) auf höchstens {N(DriftCeiling)} je 10 min begrenzt — Absicht: Kreisen im Hof soll nie der schnellste Weg sein.");
            sb.AppendLine();
            sb.AppendLine($"Gerechnet mit dem Mittel der Ziel-Profile: **{N(unit)} Sparks/Sitzung**. Einmal-Geld im ganzen Spiel: {N(OneTimeTotal())}.");
            sb.AppendLine();
            sb.AppendLine("| Kauf | Preis | Sitzungen |");
            sb.AppendLine("|---|---:|---:|");
            foreach (var v in _fleet.vehicles.Where(v => v != null).OrderBy(v => v.price))
                sb.AppendLine($"| {v.displayName} | {(v.price == 0 ? "Start" : N(v.price))} | {(v.price == 0 ? "—" : (v.price / (float)unit).ToString("0.0", ci))} |");
            sb.AppendLine($"| Street-Paket (4 Teile, ein Auto) | {N(StreetTunePrice())} | {(StreetTunePrice() / (float)unit).ToString("0.0", ci)} |");
            sb.AppendLine($"| Volles Tuning (Street + Sport, ein Auto) | {N(FullTunePrice())} | {(FullTunePrice() / (float)unit).ToString("0.0", ci)} |");
            sb.AppendLine($"| Lackfarbe | {N(_tuning.paintPrice)} | {(_tuning.paintPrice / (float)unit).ToString("0.00", ci)} |");
            var cars = _fleet.vehicles.Where(v => v != null).Sum(v => v.price);
            sb.AppendLine($"| Alle Autos | {N(cars)} | {(cars / (float)unit).ToString("0", ci)} |");
            sb.AppendLine();
            sb.AppendLine("## Erster Kauf");
            sb.AppendLine();
            var first = Profiles().First(p => p.name == "Erste Sitzung");
            var cheapest = _fleet.vehicles.Where(v => v != null && v.price > 0).OrderBy(v => v.price).First();
            var after1 = first.sparks + first.oneTime;
            sb.AppendLine($"Nach der ersten Sitzung: {N(after1)} Sparks → günstigstes Auto ({cheapest.displayName}, {N(cheapest.price)}) " +
                          (after1 >= cheapest.price ? "**sofort** kaufbar." : $"nach etwa {Mathf.CeilToInt((cheapest.price - after1) / (float)unit) + 1} Sitzungen."));
            sb.AppendLine($"Street-Paket für das Startauto ({N(StreetTunePrice())}) " + (after1 >= StreetTunePrice() ? "ebenfalls sofort." : "in Sitzung 2."));
            return sb.ToString();
        }
    }
}
