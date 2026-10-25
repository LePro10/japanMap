using System.Collections;
using System.Linq;
using JapanMap.Core;
using JapanMap.Gameplay;
using JapanMap.Gameplay.Smash;
using JapanMap.Vehicles;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace JapanMap.Tests.Vehicles
{
    /// <summary>
    /// Car damage on the game's own path (D47): the spawned player car driven into a house wall, a tree, a delineator
    /// and a bench at set speeds; Unity's collision decides, the damage is read back. Expected: a wall at 60 km/h dents
    /// the front, at 110 it wrecks it and may tear a wheel off (then the car hangs on that hub and pulls); a tree at 60
    /// leaves a clear dent; small things almost nothing; respawn, the key T and the HUD's REPAIR put everything back.
    /// Each hit and each frame of crumpling stays inside the 2 ms budget.
    /// </summary>
    [FreshSave]
    public class VehicleDamagePlayTests
    {
        Keyboard _keyboard;
        InputSettings.EditorInputBehaviorInPlayMode _focus;
        InputSettings.BackgroundBehavior _background;

        [SetUp]
        public void SetUp()
        {
            _focus = InputSystem.settings.editorInputBehaviorInPlayMode;
            InputSystem.settings.editorInputBehaviorInPlayMode = InputSettings.EditorInputBehaviorInPlayMode.AllDeviceInputAlwaysGoesToGameView;
            _background = InputSystem.settings.backgroundBehavior;
            InputSystem.settings.backgroundBehavior = InputSettings.BackgroundBehavior.IgnoreFocus;
            _keyboard = InputSystem.AddDevice<Keyboard>("DamageTestKeyboard");
            InputSystem.EnableDevice(_keyboard);
        }

        [TearDown]
        public void TearDown()
        {
            InputSystem.settings.editorInputBehaviorInPlayMode = _focus;
            InputSystem.settings.backgroundBehavior = _background;
            if (_keyboard != null) InputSystem.RemoveDevice(_keyboard);
            if (Bootstrapper.Instance != null) Object.Destroy(Bootstrapper.Instance.gameObject);
        }

        static IEnumerator BootGame()
        {
            SceneManager.LoadScene(Bootstrapper.BootSceneName);
            yield return null;
            var waited = 0f;
            while (SceneManager.GetActiveScene().name != "Game" && waited < 10f)
            {
                waited += Time.unscaledDeltaTime;
                yield return null;
            }
            for (var f = 0; f < 10; f++) yield return null;
        }

        static VehicleController Board()
        {
            var mode = Object.FindAnyObjectByType<PlayerModeController>();
            if (mode.Current == PlayerModeController.Mode.Walking) mode.PressVehicle();
            return mode.Car;
        }

        /// <summary>Lets the crumpling finish (it is spread over frames) and returns the car's damage.</summary>
        static IEnumerator Settle(VehicleDamage d, float seconds = 1.5f)
        {
            var until = Time.time + seconds;
            while (Time.time < until) yield return null;
            Assert.That(d.Deformer.Busy, Is.False, "the crush has finished within the time");
        }

        /// <summary>The flat wall of the motor shop at Sakura Commons (a real house): the car 16 m before it, square on.</summary>
        static IEnumerator RamHouse(VehicleController car, float kmh, float angle = 0f)
        {
            var o = new Vector3(560f, 0f, -470f);
            car.Place(o, 0f, fromAbove: 50f);
            yield return new WaitForFixedUpdate();
            var from = car.transform.position + Vector3.up;
            var mask = ~GameLayers.NotGround;
            RaycastHit best = default;
            var found = false;
            for (var k = 0; k < 36; k++)
            {
                var d = Quaternion.Euler(0f, k * 10f, 0f) * Vector3.forward;
                if (!Physics.Raycast(from, d, out var h, 80f, mask, QueryTriggerInteraction.Ignore)) continue;
                if (h.distance < 10f || h.collider is TerrainCollider || Mathf.Abs(h.normal.y) > 0.2f) continue;
                if (h.collider.GetComponentInParent<Breakable>() != null) continue;
                if (!found || h.distance < best.distance) { best = h; found = true; }
            }
            Assert.IsTrue(found, "a house wall near the start");
            var n = new Vector3(best.normal.x, 0f, best.normal.z).normalized;
            // At an angle the front corner meets the wall first.
            n = Quaternion.Euler(0f, angle, 0f) * n;
            car.Place(best.point + n * 16f, Mathf.Atan2(-n.x, -n.z) * Mathf.Rad2Deg, fromAbove: 3f);
            yield return new WaitForFixedUpdate();
            car.Body.linearVelocity = -n * (kmh / 3.6f);
            for (var i = 0; i < 90; i++)
            {
                car.Input = default;
                yield return new WaitForFixedUpdate();
            }
        }

        [UnityTest]
        public IEnumerator HouseWall_At60_DentsTheFront_KeepsTheWheels()
        {
            yield return BootGame();
            var car = Board();
            var d = car.GetComponent<VehicleDamage>();
            Assert.NotNull(d, "the player's car takes damage");
            Assert.IsTrue(d.Bound, "bound to its model");
            yield return RamHouse(car, 60f);
            yield return Settle(d);
            Debug.Log($"[Damage] wall 60: Δv {d.Last.deltaV:F1}, crush {d.Deformer.MaxDisplacement:F2} m, marks {d.Marks.Count}, wheels lost {d.WheelsLost} bent {d.BentWheels}, hit {d.WorstHitMs:F2} ms ({d.WorstDetail}), frame {d.WorstWorkMs:F2} ms");
            Assert.That(d.Last.deltaV, Is.InRange(12f, 20f), "a 60 km/h stop");
            Assert.That(d.Deformer.MaxDisplacement, Is.InRange(0.12f, 0.42f), "a real dent, not a wreck");
            Assert.That(d.WheelsLost, Is.EqualTo(0), "wheels stay on at 60");
            Assert.That(d.Marks.Count, Is.GreaterThan(0), "paint scraped where it hit");
            // The front took it: the moved vertices are in the front half.
            var shell = d.Deformer.Shell;
            var front = shell.rest.Max(v => v.z);
            var movedRear = Enumerable.Range(0, shell.rest.Length).Count(i => shell.rest[i].z < front - 2f && (shell.pos[i] - shell.rest[i]).sqrMagnitude > 1e-6f);
            Assert.That(movedRear, Is.EqualTo(0), "the rear is untouched");
            // Round 4: square on at 60 the windscreen cracks too — the hit's own crack stays at the bumper, far from it.
            Assert.That(d.ScreenCracks, Is.EqualTo(1), "the windscreen cracked");
            var screen = d.ScreenCentre(0);
            Assert.IsTrue(screen.HasValue, "the car has a windscreen");
            var eye = VehicleVisuals.FindPrefix(car.transform, "eye");
            var local = car.transform.InverseTransformPoint(d.Deformer.Body.TransformPoint(screen.Value));
            var eyeLocal = car.transform.InverseTransformPoint(eye.position);
            Assert.That(local.z - eyeLocal.z, Is.InRange(0.2f, 1.6f), $"the windscreen centre {local:F2} lies ahead of the eye {eyeLocal:F2}");
        }

        /// <summary>Only a hard hit on the nose or tail reaches the windscreen / rear window; a side hit or a light knock does not.</summary>
        [UnityTest]
        public IEnumerator Windscreen_CracksOnHardEndHits_NotFromTheSide_NorLight()
        {
            yield return BootGame();
            var car = Board();
            var d = car.GetComponent<VehicleDamage>();
            var t = car.transform;
            var nose = t.position + t.forward * 2f + t.up * 0.5f;
            Assert.IsFalse(d.Take(nose, -t.forward, 8f, 10f, t.right).screenCracked, "a light knock leaves the windscreen");
            Assert.IsFalse(d.Take(t.position + t.right + t.up * 0.5f, -t.right, 20f, 10f, t.forward).screenCracked, "a side hit leaves it");
            Assert.IsTrue(d.Take(nose, -t.forward, 16f, 10f, t.right).screenCracked, "a hard hit on the nose cracks it");
            Assert.IsTrue(d.Take(t.position - t.forward * 2f + t.up * 0.5f, t.forward, 16f, 10f, t.right).screenCracked, "a hard hit on the tail cracks the rear window");
            Assert.That(d.ScreenCracks, Is.EqualTo(2));
            yield return Settle(d);
            d.Repair();
            Assert.That(d.ScreenCracks, Is.EqualTo(0), "repair clears them");
        }

        [UnityTest]
        public IEnumerator HouseWall_At110_WrecksTheFront_AWheelComesOff_TheCarHangsAndPulls()
        {
            yield return BootGame();
            var car = Board();
            var d = car.GetComponent<VehicleDamage>();
            // Front corner first (25° to the wall): one wheel takes it.
            yield return RamHouse(car, 110f, 25f);
            yield return Settle(d);
            Debug.Log($"[Damage] wall 110 at 25°: Δv {d.Last.deltaV:F1}, crush {d.Deformer.MaxDisplacement:F2} m, marks {d.Marks.Count}, wheels lost {d.WheelsLost} bent {d.BentWheels}, hit {d.WorstHitMs:F2} ms ({d.WorstDetail}), frame {d.WorstWorkMs:F2} ms");
            Assert.That(d.Deformer.MaxDisplacement, Is.GreaterThan(0.5f), "the front is crushed");
            Assert.That(d.WheelsLost, Is.GreaterThanOrEqualTo(1), "a wheel tore off");
            var lost = Enumerable.Range(0, 4).First(d.IsWheelLost);
            Assert.That(d.WheelsLost, Is.EqualTo(1), "a corner hit takes one wheel");
            Assert.IsTrue(car.Wheels[lost].missing, "physics knows: that corner is on its hub");
            Assert.NotNull(GameObject.Find("LooseWheel"), "the wheel lies in the world");

            // Drive on, straight, without steering: the corner hangs low and the car pulls to it, metal on the road.
            var roads = (JapanMap.World.RoadNetwork)Object.FindAnyObjectByType<VehicleRespawn>().Locator;
            roads.TryNearest(new Vector3(560f, 0f, -560f), Vector3.forward, 200f, out var p, out var f);
            car.Place(p, Mathf.Atan2(f.x, f.z) * Mathf.Rad2Deg, fromAbove: 3f); // not a respawn: the damage stays
            for (var i = 0; i < 40; i++) yield return new WaitForFixedUpdate();
            var hub = car.transform.TransformPoint(car.Wheels[lost].local).y;
            var other = car.transform.TransformPoint(car.Wheels[lost ^ 1].local).y;
            Assert.That(other - hub, Is.GreaterThan(0.08f), $"the corner without a wheel hangs ({hub:F2} vs {other:F2})");
            var yaw0 = car.transform.eulerAngles.y;
            var scrape = 0f;
            // W on the keyboard (the player's input path; a test's car.Input is overwritten by DriverInput each step).
            InputSystem.QueueStateEvent(_keyboard, new KeyboardState(Key.W));
            InputSystem.Update();
            for (var i = 0; i < 150; i++)
            {
                yield return new WaitForFixedUpdate();
                scrape = Mathf.Max(scrape, d.Scrape);
            }
            InputSystem.QueueStateEvent(_keyboard, new KeyboardState());
            InputSystem.Update();
            var turned = Mathf.DeltaAngle(yaw0, car.transform.eulerAngles.y);
            var side = Mathf.Sign(car.Wheels[lost].local.x); // + = right
            Debug.Log($"[Damage] on the hub: turned {turned:F1}° (lost wheel {lost}, side {side}), scrape {scrape:F2}, speed {car.Telemetry.speed * 3.6f:F0} km/h");
            Assert.That(turned * side, Is.GreaterThan(4f), "pulls towards the missing wheel");
            Assert.That(scrape, Is.GreaterThan(0.05f), "the hub grinds (sparks, sound)");
            Assert.That(car.Telemetry.speed, Is.GreaterThan(3f), "but it still drives: engine and steering are whole");
        }

        [UnityTest]
        public IEnumerator Tree_At60_LeavesAClearDent_NoWheelLost()
        {
            yield return BootGame();
            var car = Board();
            var d = car.GetComponent<VehicleDamage>();
            var smash = Object.FindAnyObjectByType<SmashSystem>();
            var veg = Object.FindObjectsByType<JapanMap.World.InstanceRenderer>().First(r => r.data is JapanMap.World.VegetationData);
            // A ring cherry of Sakura Commons on open ground (as SmashTests).
            var ring = new Vector3(550f, 0f, -510f);
            var index = Enumerable.Range(0, veg.data.Count)
                .Where(i => Mathf.Abs(new Vector2(veg.data.positions[i].x - ring.x, veg.data.positions[i].z - ring.z).magnitude - 62f) < 5f)
                .OrderBy(i => veg.data.positions[i].x).First();
            var tree = veg.data.positions[index];
            var outward = new Vector3(tree.x - ring.x, 0f, tree.z - ring.z).normalized;
            car.Place(tree - outward * 14f, Mathf.Atan2(outward.x, outward.z) * Mathf.Rad2Deg, fromAbove: 3f);
            for (var i = 0; i < 5; i++) yield return new WaitForFixedUpdate();
            car.Body.linearVelocity = outward * (60f / 3.6f);
            for (var i = 0; i < 90; i++)
            {
                car.Input = new DriveInput { throttle = 0.3f };
                yield return new WaitForFixedUpdate();
            }
            yield return Settle(d);
            Debug.Log($"[Damage] tree 60: broken {veg.IsHidden(index)}, Δv {d.Last.deltaV:F1}, crush {d.Deformer.MaxDisplacement:F2} m, wheels lost {d.WheelsLost} bent {d.BentWheels}");
            Assert.IsTrue(veg.IsHidden(index), "the tree broke");
            Assert.That(smash.TreesBroken, Is.EqualTo(1));
            Assert.That(d.Deformer.MaxDisplacement, Is.InRange(0.05f, 0.25f), "a clear dent, the car drives on");
            Assert.That(d.WheelsLost, Is.EqualTo(0), "a tree does not tear wheels off");
        }

        [UnityTest]
        public IEnumerator SmallThings_AtSpeed_LeaveAScratchAtMost()
        {
            yield return BootGame();
            var car = Board();
            var d = car.GetComponent<VehicleDamage>();
            var smash = Object.FindAnyObjectByType<SmashSystem>();
            foreach (var kind in new[] { "light", "fence" })
            {
                // Alone: nothing else breakable within 6 m (a park lamp beside the bench took the hit once).
            var target = smash.Breakables.Where(b => b.Kind.name == kind && !b.Broken && (kind != "light" || b.GetComponentInChildren<Renderer>() != null) && (kind != "fence" || b.name.StartsWith("bench") || b.name.StartsWith("parkBench"))
                                                     && !smash.Breakables.Any(o => o != b && (o.transform.position - b.transform.position).sqrMagnitude < 36f))
                    .OrderBy(b => (b.transform.position - car.transform.position).sqrMagnitude).First();
                // As SmashTests.RamAt: from the road beside it, at an angle (behind a roadside thing there are houses).
                var c = target.transform.position;
                var roads = (JapanMap.World.RoadNetwork)Object.FindAnyObjectByType<VehicleRespawn>().Locator;
                roads.TryNearest(c, Vector3.forward, 30f, out var road, out var dir);
                car.Place(road - dir * 12f, 0f, fromAbove: 3f);
                yield return new WaitForFixedUpdate();
                var aim = c - car.transform.position;
                aim.y = 0f;
                car.Place(car.transform.position, Mathf.Atan2(aim.x, aim.z) * Mathf.Rad2Deg, fromAbove: 1f);
                d.Repair(); // only this hit counts
                var log = "";
                void Note(VehicleDamage.Impact h) => log += $" [{(h.other != null ? h.other.name : "-")} Δv {h.deltaV:F1} dent {h.dent:F2}{(h.brokeThrough ? " broke" : "")}]";
                d.Impacted += Note;
                car.Body.linearVelocity = aim.normalized * (50f / 3.6f);
                // Through it, then brake: only this hit counts, not the house behind it.
                var after = -1;
                for (var i = 0; i < 120 && (after < 0 || i < after + 25); i++)
                {
                    if (target.Broken && after < 0) after = i;
                    car.Input = after >= 0 && i > after + 4 ? new DriveInput { brake = 1f, handbrake = true } : new DriveInput { throttle = 0.3f };
                    yield return new WaitForFixedUpdate();
                }
                yield return Settle(d, 0.5f);
                d.Impacted -= Note;
                Debug.Log($"[Damage] {kind} ({target.name}) at 50: broken {target.Broken}, crush {d.Deformer.MaxDisplacement:F3} m, hits{log}");
                // A plastic post bends and springs back (D47), the rest breaks.
                if (kind == "light") Assert.That(target.Flexed, Is.GreaterThan(0), $"{target.name} bent over");
                else Assert.IsTrue(target.Broken, $"{target.name} broke");

                Assert.That(d.Deformer.MaxDisplacement, Is.LessThan(0.03f), $"{kind}: hardly a mark on the car");
            }
        }

        [UnityTest]
        public IEnumerator Repair_ByRespawn_KeyT_AndTheHudButton_PutsEverythingBack()
        {
            yield return BootGame();
            var car = Board();
            var d = car.GetComponent<VehicleDamage>();
            var shell = d.Deformer.Shell;

            IEnumerator Wreck()
            {
                // Corner first like the wheel-loss test: head-on at 110 tore a wheel off only sometimes (red in the full run).
                yield return RamHouse(car, 110f, 25f);
                yield return Settle(d);
                Assert.That(d.NeedsRepair, "wrecked");
                Assert.That(d.WheelsLost, Is.GreaterThan(0));
            }

            void AssertWhole(string how)
            {
                Assert.That(d.Damage01, Is.EqualTo(0f), $"{how}: no damage left");
                Assert.That(d.WheelsLost + d.BentWheels, Is.EqualTo(0), $"{how}: wheels on and true");
                var drawn = shell.filter.sharedMesh.vertices;
                var modelled = shell.shared.vertices;
                Assert.That(Enumerable.Range(0, drawn.Length).Max(i => (drawn[i] - modelled[i]).magnitude), Is.LessThan(1e-5f), $"{how}: the drawn body is the modelled one");
                Assert.That(d.Marks.Count, Is.EqualTo(0), $"{how}: no scratches");
                Assert.That(car.SteerBias, Is.EqualTo(0f), $"{how}: no pull");
                Assert.That(car.Wheels.All(w => !w.missing), $"{how}: physics has four wheels");
                Assert.IsNull(GameObject.Find("LooseWheel"), $"{how}: the lost wheel is back on the car");
            }

            yield return Wreck();
            Object.FindAnyObjectByType<VehicleRespawn>().Respawn();
            yield return null;
            AssertWhole("respawn");

            yield return Wreck();
            InputSystem.QueueStateEvent(_keyboard, new KeyboardState(Key.T));
            InputSystem.Update();
            yield return null;
            InputSystem.QueueStateEvent(_keyboard, new KeyboardState());
            InputSystem.Update();
            yield return null;
            AssertWhole("key T");

            yield return Wreck();
            var prompt = Object.FindAnyObjectByType<JapanMap.Gameplay.Hud.RepairPrompt>();
            Assert.NotNull(prompt, "the HUD has the repair pill");
            yield return null;
            Assert.IsTrue(prompt.Visible, "it shows while the car is hurt");
            prompt.Press();
            yield return null;
            AssertWhole("REPAIR button");
            yield return null;
            Assert.IsFalse(prompt.Visible, "and goes when the car is whole");
        }

        [UnityTest]
        public IEnumerator RepairPill_ClearOfTheHud_InEveryForm()
        {
            yield return BootGame();
            var car = Board();
            yield return RamHouse(car, 110f, 25f);
            yield return Settle(car.GetComponent<VehicleDamage>());
            var prompt = Object.FindAnyObjectByType<JapanMap.Gameplay.Hud.RepairPrompt>();
            var hud = Object.FindAnyObjectByType<JapanMap.Gameplay.Hud.GameplayHud>();
            try
            {
                // Upright the pill lay on the tacho (2026-10-25): the top centre there is only the gap beside the minimap.
                foreach (var (form, w, h) in new[] { (JapanMap.Core.Ui.FormFactor.Desktop, 1920, 1080), (JapanMap.Core.Ui.FormFactor.PhoneLandscape, 844, 390), (JapanMap.Core.Ui.FormFactor.PhonePortrait, 390, 844) })
                {
                    yield return Content.UiShots.Layout(form, w, h, 0.3f);
                    Assert.IsTrue(prompt.Visible, $"{form}: the pill shows on the wreck");
                    var pill = prompt.Pill.worldBound;
                    Assert.IsFalse(pill.Overlaps(hud.Instrument.worldBound), $"{form}: pill {pill} on the instrument {hud.Instrument.worldBound}");
                    if (hud.Minimap != null) Assert.IsFalse(pill.Overlaps(hud.Minimap.worldBound), $"{form}: pill {pill} on the minimap {hud.Minimap.worldBound}");
                    foreach (var doc in Object.FindObjectsByType<UnityEngine.UIElements.UIDocument>())
                        UnityEngine.UIElements.UQueryExtensions.Query<UnityEngine.UIElements.VisualElement>(doc.rootVisualElement, className: "jm-touch").ForEach(b =>
                        {
                            for (var e = b; e != null; e = e.parent)
                                if (e.resolvedStyle.display == UnityEngine.UIElements.DisplayStyle.None) return;
                            if (b.worldBound.width < 1f) return;
                            Assert.IsFalse(pill.Overlaps(b.worldBound), $"{form}: pill {pill} on a touch button {b.worldBound}");
                        });
                }
            }
            finally
            {
                Content.UiShots.RestorePanel();
                JapanMap.Core.Ui.UiPanel.ForcedForm = null;
                JapanMap.Core.Ui.UiPanel.Refresh(force: true);
            }
        }

        [UnityTest]
        public IEnumerator Cost_OfAHit_AndOfEachFrame_WithinBudget()
        {
            yield return BootGame();
            var car = Board();
            var d = car.GetComponent<VehicleDamage>();
            // A first crash warms up (editor: code compiled on first use — the web build has no JIT).
            yield return RamHouse(car, 60f);
            yield return Settle(d);
            d.Repair();
            d.ResetCost();
            // The garbage of the tests before (a full run: 200 boots) is not this hit's work: collect it before measuring.
            System.GC.Collect();
            yield return null;
            yield return RamHouse(car, 110f);
            yield return Settle(d);
            var line = $"damage cost: hit {d.WorstHitMs:F2} ms ({d.WorstDetail}), crumple frame {d.WorstWorkMs:F2} ms, crush {d.Deformer.MaxDisplacement:F2} m";
            Debug.Log(line);
            System.IO.File.WriteAllText("Captures/damage-cost.txt", line + "\n");
            Assert.That(d.WorstHitMs, Is.LessThan(2f), line);
            Assert.That(d.WorstWorkMs, Is.LessThan(2f), line);
        }
    }
}
