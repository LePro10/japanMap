# CODEMAP – Scripts
Automatisch erzeugt 2026-10-22 (190 Dateien). Nicht von Hand pflegen – neu erzeugen mit dem Skill `codemap`. Zuerst hier nachsehen, dann nur die passenden Dateien lesen.

## Audio/
- **EngineSound.cs** — class EngineSound : MonoBehaviour: Tier, Running, Bank, LayerLevel, IntakeLevel, OnLevel, OffLevel, MainPitch, DeepLevel, tierLayers, liftRpmShare, Bind(), Drive()
- **EngineSoundBank.cs** — class EngineSoundBank : ScriptableObject; struct Step: rpm, carId, idle, idleRpm, steps, lift
- **Sfx.cs** — class Sfx : MonoBehaviour: Last, Played, Bank, Configure(), Play()
- **SoundBank.cs** — class SoundBank : ScriptableObject; struct Entry: name, group, clip; struct Ambience: name, at, radius, clip, loop, gap, entries, ambience, music, musicGap, TryGet()
- **SoundMix.cs** — enum SoundGroup; class SoundMix: Volume(), SetVolume(), Default(), DuckMusic(), Gain()
- **TyreSound.cs** — class TyreSound : MonoBehaviour; enum Ground: SkidLevel, RollLevel(), Running, Scrape, ScrapeLevel, Drive()

## Core/
- **AutoDrive.cs** — interface IAutoDrive; class AutoDrive: Current, IsActive
- **Bootstrapper.cs** — class Bootstrapper : MonoBehaviour: Instance, IsBooted, Systems, InitializeSystems()
- **CameraShot.cs** — class CameraShot: Render()
- **GameLayers.cs** — class GameLayers: NotGround, CameraObstacles, Layer()
- **GameOptions.cs** — class GameOptions: Steering, ChaseDistance, CameraShake, Mph, UiScale, AutoThrottle, ButtonScale, LeftHanded, Vibration, ReducedMotion, Bindings, LandscapeHintSeen, Speed(), SpeedUnit
- **GameSystem.cs** — class GameSystem : MonoBehaviour: IsInitialized
- **IBootGate.cs** — interface IBootGate
- **IRoadLocator.cs** — interface IRoadLocator
- **QualityCalibration.cs** — class QualityCalibration : ScriptableObject: warmupSeconds, sampleSeconds, minFps, lowGpus, mediumGpus; class QualityCalibrator; enum Verdict: LastFps, Restart(), Add(), Guess()
- **QualitySystem.cs** — class QualitySystem : GameSystem: Tiers, Hold, IsAuto, Settled, MeasuredFps, Current, SetTier(), Recalibrate(), FromUrl(), UrlParam(), ChooseDefault()
- **StandInMesh.cs** — class StandInPalette: BaseColor, Material, For(), Uv(); class BoxMeshBuilder: Box(), ToMesh()
- **Unlocks.cs** — enum FeatureId; interface IUnlockQuery; class Unlocks: IsUnlocked(), Hint(); class AllUnlocked : IUnlockQuery: IsUnlocked(), Requirement()

## Core/Platform/
- **GamePlatform.cs** — enum AdOutcome; class PlatformUser: Id, Name; interface IGamePlatform; class GamePlatform: AdRunning, Muted, WorldReady, GameplayStarts, GameplayStops, Playing, ShouldPlay, Tick(), ShowRewarded(), ShowMidgame(), RaiseUserChanged(); class OfflinePlatform : IGamePlatform; enum AdSim: Simulate, SimSeconds, Requests, MidgameRequests, Name, AdsEnabled, AdBlocked, RequestRewarded(), RequestMidgame(), Pump(), GameplayStart(), GameplayStop(), HappyTime(), User

## Core/Save/
- **SaveStores.cs** — interface ISaveStore; class SaveStores; class PlayerPrefsStore : ISaveStore: Name, TryRead(), Write(), Delete(); class MemoryStore : ISaveStore: Name, TryRead(), Write(), Delete()
- **SaveSync.cs** — class SaveSummary; class CarHead: id, owned, sparks, playSeconds, savedAt, cars, discoveries, Cars, Meaningful, Parse(), Saved, Played; class SaveConflict: Owner; class SaveSync: Pending, Reconcile(), Resolve(), Recovery(), SwapRecovery(), Mirror(); class MirroredStore : ISaveStore: Owner, Name, TryRead(), Write(), Delete()

## Core/Ui/
- **PageBridge.cs** — class PageBridge : MonoBehaviour: Loaded, Share, Stage
- **StartFlow.cs** — class StartFlow; enum Phase: Holding, Progress()
- **TouchGlyph.cs** — enum TouchGlyph; class TouchGlyphElement : VisualElement: Glyph, Paint()
- **TouchKit.cs** — class TouchKit: Circle(), Glyph(), Hold(), Tap(); class Group: Add(), ReleaseAll(); class Stick: Axes, Held, ReleaseAll(), Place()
- **UiLayoutProbe.cs** — class UiLayoutProbe: Check(), Summary()
- **UiPanel.cs** — enum FormFactor; class UiPanel: Scales, Form, IsPhone, IsPortrait, Size, Safe, Scale, Get(), Refresh(), DevicePixelRatio()
- **UiPanelDriver.cs** — class UiPanelDriver : MonoBehaviour
- **UiStack.cs** — class UiStack: Clear(), Count, Top, Push(), Pop(), Contains(), Back()

## DevTools/
- **AudioCapture.cs** — class AudioCapture : MonoBehaviour: Recording, Begin()
- **FrameProbe.cs** — class FrameProbe : MonoBehaviour
- **FrameTimeStats.cs** — class FrameTimeStats: Count, AverageMs, Add()
- **StatsOverlay.cs** — class StatsOverlay : GameSystem; struct Snapshot: RenderStatsValid, Count(), Visible, Last

## Gameplay/
- **CarAudio.cs** — class CarAudio : MonoBehaviour: Engine, Tyres, LastImpact, BankAddress(), Prefetch()
- **CarCall.cs** — class CarCall; struct Spot: position, heading, distance, onRoad, TryFind()
- **PlayerModeController.cs** — class PlayerModeController : MonoBehaviour; enum Mode: Current, Actions, Walker, Car, Driver, Prompt, Message, MessageAt, PressVehicle(), SetSuspended(), Suspended, Seat(), PressCall(), QuietPrompts
- **PlayerModeUi.cs** — class PlayerModeUi : MonoBehaviour: ShowTouch()

## Gameplay/Career/
- **CareerChain.cs** — class CareerChain : IUnlockQuery: Settings, Count, Claim(), Title(), Complete, Current, Chapter(), Opener(), IsUnlocked(), Requirement(), Raise(), TotalReward(), Needs(), Problems()
- **CareerOverlay.cs** — class CareerOverlay; struct Banner: icon, gold, sound, Touch, Goal, LastBanner, CardShown, Root, Show(), Meter(), Done(), Hide(), Visible(), Attach()
- **CareerSettings.cs** — enum CareerGoal; enum CareerTarget; class CareerSettings : ScriptableObject; struct Step: id, chapter, title, hint, touchHint, goal, amount, reward, unlocks, waypoint, fund, typicalSeconds; struct Feature: id, name, blurb, icon, steps, features, completeReward, skipSparks, doneHold, bannerSeconds, afterIntro, speedHold, noAutoDrive, Info()
- **CareerSystem.cs** — class CareerSystem : MonoBehaviour: RunInEditor, Instance, Active, Chain, Settings, Overlay, Step, Bind(), Skip(), Summary()

## Gameplay/Content/
- **ContentStreamer.cs** — class ContentStreamer : MonoBehaviour; struct Place: address, centre, editorPath, Instance, Places, IsLoaded(), LoadedPlaces, AllPlaces

## Gameplay/Discovery/
- **DiscoveryPuzzle.cs** — enum PuzzleStep; class DiscoveryPuzzle: Done, Reset(), Press()
- **DiscoverySet.cs** — class DiscoverySet : ScriptableObject; enum Trigger; struct Button: label, offset; struct Card: id, region, title, hint, position, ground, yaw, trigger, buttons, answer, gaps, reward, cards, useReach
- **DiscoverySystem.cs** — class DiscoverySystem : MonoBehaviour: Set, Found, Prompt, Use()

## Gameplay/Drift/
- **ContactRelay.cs** — class ContactRelay : MonoBehaviour
- **DriftChain.cs** — struct DriftSample: speed, forwardSpeed, slip, airborne, inZone; enum ChainEnd; class DriftChain: Banked, Pending, Active, Scoring, Multiplier, DriftTime, InZone, LinkLeft, Rate(), Step(), Contact(), Bank(), Reset()
- **DriftScorer.cs** — class DriftScorer : MonoBehaviour: Chain, Zones, Zone, PaysSparks, LastContactKmh, Configure()
- **DriftSettings.cs** — class DriftSettings : ScriptableObject: minKmh, minAngle, maxAngle, baseRate, refKmh, refAngle, speedCap, speedCapKmh, angleCap, angleCapDeg, multiplierSteps, linkGap, switchBonus, switchCooldown
- **DriftZoneSet.cs** — class DriftZoneSet : ScriptableObject; struct Zone: id, title, center, radius, size, yaw, Contains(), zones, IndexAt()

## Gameplay/Economy/
- **AdPolicy.cs** — class AdPolicy: Active, CanOfferResultBonus(), CanOfferLoanAd(), CanShowMidgame, MidgameAsked(), ResultWatched(), LoanWatched()
- **AdSettings.cs** — class AdSettings : ScriptableObject: resultBonus, minEventSeconds, firstVisitMinutes, resultPerWindow, resultWindowMinutes, loanSeconds, loanPrice, loanWarnSeconds, loanStopSeconds, loanAdGapMinutes, midgame, midgameFirstMinutes, midgameGapMinutes, rewardedGapMinutes
- **EconomySettings.cs** — enum MilestoneKind; class EconomySettings : ScriptableObject; struct Milestone: kind, threshold, reward, scorePerSpark, scoreSparkCap, scoreCapWindow, regionReward, allRegionsReward, discoveryReward, firstMedalReward, milestones, speedHoldSeconds, eventSparksPerSecond, sessionBand
- **EconomySim.cs** — class EconomySim; struct Profile: name, how, sparks, oneTime, ordinary, approach; struct EventRate: sparks, PerMinute; struct DriftStyle: name, crashEvery, inZone, Career, travelSeconds, Casual, Skilled, Rate(), EventRates(), DriftSparks(), RacingSparks(), Profiles(), ApproachFloor, DriftCeiling
- **RewardedOffers.cs** — class RewardedOffers : MonoBehaviour: Instance, Settings, Policy, ResultOffered, ResultLabel, LoanAdLabel, LoanBuyLabel, WatchResultAd(), MidgamesAsked, AtBreak(), Break(), BorrowByAd(), BorrowForSparks()
- **ScoreSparkBank.cs** — class ScoreSparkBank: Convert()
- **SparksWallet.cs** — class SparksWallet : MonoBehaviour: Settings, Balance, Frozen, Configure(), Add(), Spend(), Restore(), AddScore()

## Gameplay/Garage/
- **CarPortraits.cs** — class CarPortraits: Get(), ClearWaiting(), Count, Pump()
- **GarageSettings.cs** — class GarageSettings : ScriptableObject: entry, entryRadius, entryKmh, bay, bayHeading, exit, exitHeading, cameraAt, lookAt, fieldOfView, testDriveSeconds, testDriveAt, testDriveHeading, applyBelowKmh
- **GarageSystem.cs** — class GarageSystem : MonoBehaviour: IsOpen, InBay, Shown, Status, TestDriveSeconds, TestDriving, TestDriveLeft, Lending, TestCar, WasTested(), LoanWarnSeconds, LoanStopSeconds, Screen, Settings

## Gameplay/Hud/
- **AnalogCluster.cs** — class AnalogCluster : VisualElement: Set()
- **CockpitDisplay.cs** — class CockpitDisplay : MonoBehaviour: Active, Cluster, HeadUp, Wheel, SeatParts, Bind()
- **GameplayHud.cs** — class GameplayHud : MonoBehaviour: Instrument, CockpitShowsSpeed, Lines, Root, Minimap, LastToast, SheetText, Configure(), SetGoal(), GoalLabel, ShowSkill(), Flash(), SetPrompt(), PromptText
- **Instrument.cs** — class Instrument : VisualElement: GearText, SpeedText, Set()
- **RepairPrompt.cs** — class RepairPrompt : MonoBehaviour: Visible, Bind(), Press()
- **SpeedLines.cs** — class SpeedLines : VisualElement: Amount, Tick()
- **SpeedPost.cs** — class SpeedPost : MonoBehaviour: Weight, Bind()
- **WorldPins.cs** — class WorldPins : MonoBehaviour: Instance; class Pin: Owner, At, Color, Visible, Box, Distance, Add(), SetVisible(), RemoveAll(), Debug, Shown()

## Gameplay/Intro/
- **FirstDrive.cs** — class FirstDrive : MonoBehaviour; enum Beat: RunInEditor, Current, Settings, WillRun, Earned, Rolled, Skipped, Begin(), Skip()
- **IntroOverlay.cs** — class IntroOverlay: Key, Touch, Gas, Nitro, Roll, Drift, Attach(), Show(), Hide(), Cinema(), Title(), Slow(), Prompt(), Hit()
- **IntroSettings.cs** — class IntroSettings : ScriptableObject: rampId, runUp, startSpeed, airSlow, rollSlow, airWait, slowRate, titleSeconds, nitroAt, autoNitroAt, nitroStall, turnSpeed, driftHold, driftTimeout

## Gameplay/Life/
- **ActorSet.cs** — class ActorSet : ScriptableObject; struct Actor: position, yaw, actors
- **InteriorSet.cs** — class InteriorSet : ScriptableObject; struct Box: finish; class Interior: id, boxes, interiors, Finish()
- **LifeContent.cs** — class LifeContent
- **Pedestrian.cs** — class Pedestrian : MonoBehaviour; enum State: Current, OwnPose, Figure, Agent, Knocked, Hits, Build(), Spawn(), CastShadows(), Knock()
- **PedestrianCrowd.cs** — class PedestrianCrowd : MonoBehaviour: People, Settings
- **PedestrianSettings.cs** — class PedestrianSettings : ScriptableObject: countHigh, countLow, far, near, pop, wanderRadius, maxPause, shadowDistance, speed, height, radius, hitMinSpeed, hitDrag, launchUp
- **PlaceActors.cs** — class PlaceActors : MonoBehaviour; class Live: actor, go, figure, clip, animal, person, phase, renderers, Count, Data, Active
- **ShopInteriors.cs** — class ShopInteriors : MonoBehaviour: Built

## Gameplay/Map/
- **AutoDriveSettings.cs** — class AutoDriveSettings : ScriptableObject: maxSpeedKmh, gripShare, braking, lookAheadMin, lookAheadSeconds, laneShare, minLaneWidth, cornerStart, cornerFull, crossingReach, crossingKmh, spacing, gapBase, gapSeconds
- **AutoDriver.cs** — class AutoDriver : MonoBehaviour, IAutoDrive: IsActive, HasDestination, Pilot, Route, Replans, Recoveries, Refusal, LastStop, Instance, Cinematic, Bind(), SetActive()
- **MapSystem.cs** — enum MapFilter; class MapSystem : MonoBehaviour: Bounds, Roads, Regions, RegionWatch, Base, ClueRadius, Discoveries, Races, Travel, Progress, Waypoint, Paper, Amber, Sakura
- **MapView.cs** — struct MapPin: at, icon, color, size, id, heading, circle; class MapView : VisualElement: Bounds, Centre, Span, Pins, PinTapped, SetBase(), SetRoute(), Look(), PixelsPerMetre, ToLocal(), ToWorld(), SetLabels(), SetPins(), PinAt()
- **NextGoalGuide.cs** — class NextGoalGuide : MonoBehaviour: LastGoal
- **Postcard.cs** — class Postcard: Render()
- **RouteGraph.cs** — enum Crossing : byte; class RouteGraph: NodeCount, IsCrossing(), CrossingAt(), WidthAt(), Nearest(), Find()
- **RouteGuide.cs** — class RouteGuide : MonoBehaviour: Instance, Graph, Path, Version, OnRoad, Remaining, Reveal, Bind()

## Gameplay/Menu/
- **CarsScreen.cs** — class CarsScreen : MenuScreen; enum Page: Title, Icon, Feature, Text, Back(), Closed(), Narrow, ShowTune(), Build(), Update(); class StatBar: Value
- **GameMenu.cs** — class MenuScreen: Title, Short, Icon, Menu, Build(), Back(), Closed(), Text, Action, Update(), Narrow, Feature; class GameMenu : MonoBehaviour: IsOpen, Current, Screens, Theme, Panel, Player, Hud, Progress, Title, Root, Text, Instance, Add(), Escape()
- **MapScreen.cs** — class MapScreen : MenuScreen: Narrow, Feature, Title, Icon, Text, View, Selected, Back(), Closed(), Build(), Update(), Select()
- **MenuCamera.cs** — class MenuCamera : MonoBehaviour: Active
- **MenuTiles.cs** — class MenuTiles; class Spec: Name, Icon, Kicker, Title, Body, Value, Meter, Note, Action, Style, Feature, Click, Car, Picture
- **PhotoScreen.cs** — class PhotoScreen : MenuScreen: Title, Icon, Action, Feature, Build()
- **PlayScreen.cs** — class PlayScreen : MenuScreen: Title, Icon, Text, Update(), Build()
- **PostcardLoader.cs** — class PostcardLoader : MonoBehaviour: Run()
- **PostcardSet.cs** — class PostcardSet : ScriptableObject; struct Card: id, image, cards, EventId(), PlaceId(), Find(), Loaded, Request()
- **SettingsScreen.cs** — class SettingsScreen : MenuScreen: Pages, Title, Icon, Text, Page, KeysOpen, ShowPage(), HasTouch, Back(), Closed(), Build(), NearestCamera(), ShowChoice()
- **TitleScreen.cs** — class TitleScreen : MonoBehaviour; enum State: RunInEditor, Current, Continue, StartButton, SettingsButton, Root, Instance, Create(), Refocus(), SkipTutorial(), Begin()
- **Travel.cs** — class Travel : MonoBehaviour: Points, Last, Unlocked(), ToCommons(), To(), ToEvent()
- **TravelPoints.cs** — class TravelPoints : ScriptableObject; struct Point: id, title, region, at, heading, icon, points

## Gameplay/Progress/
- **DailySettings.cs** — enum DailyGoal; class DailySettings : ScriptableObject; struct Challenge: goal, title, target, reward, streakRewards, delay, challenges
- **DailySystem.cs** — class DailySystem : MonoBehaviour: Instance, AutoBonus, Now, Day(), Today, Settings, Challenge, ChallengeProgress, ChallengeDone, Streak, Left, Index(), CheckBonus(), Report()
- **PlayerProgress.cs** — class PlayerProgress : MonoBehaviour, ICarLoadout: Data, LoadedFrom, StoreName, Tuning, Fleet, Wallet, SaveCount, Resumed, UnlockAllFromUrl(), MarkDirty(), Flush(), Claimed(), Grant(), Owns()
- **ProgressData.cs** — class CarState: id, owned, tune, setup, paint, paints, wheels, wheelSets, aero, aeroKits; class BestEntry: car, tune, seconds, score, balance; class EventRecord: id, runs, finishes, bestTier, bests; class DrivingRecords: cards; class RecordCard: kind, value, car, place, at; class ProgressData: version, sparks, claims, purchases, selectedCar, cars, regions, discoveries, decals, events, records, hasLastPosition, lastPosition, lastYaw; class ProgressStore; enum Source: Load(), Save()

## Gameplay/Races/
- **RaceDirector.cs** — class RaceDirector : MonoBehaviour; enum State; class Entrant: name, car, pilot, progress, isPlayer, rescues, trace; struct Result: eventId, place, seconds, score, sparks, medal, completed, car, Current, Set, Event, Track, Entrants, Elapsed, Ghost, GhostCar
- **RaceGhost.cs** — class RaceGhost: car, hz, seconds, Count, Duration, Key(), Add(), Sample(), TimeAt(), Encode(), Decode()
- **RaceEventSet.cs** — enum RaceKind; class RaceEventSet : ScriptableObject; struct Event: id, title, kind, road, reverse, startOffset, laps, rivals, rivalCar, loanCar, checkpointsPerLap, completion, bonus, medals; struct CarTime: car, seconds, Benchmark(); struct Rival: name, maxKmh, lookAheadSeconds, paint, events, rivals, countdown, checkpointSlack, gridRow, gridFirst, sprintStart, rescueMetres, rescueSeconds, followGap
- **RaceProgress.cs** — class RaceProgress: Progress, Arc, Distance, Passed, TotalCheckpoints, Laps, Finished, FinishTime, CheckpointProgress(), CheckpointPoint(), Update(), IsAheadOf()
- **RaceTrack.cs** — class RaceTrack: Closed, Length, HalfWidth, Count, Points, Wrap(), Delta(), PointAt(), TangentAt(), Nearest(), Line()

## Gameplay/Records/
- **PhotoMode.cs** — class PhotoMode : MonoBehaviour: IsOpen, ShowingResult, LastPhoto, LastSize, Open(), Close(), Step(), Capture(), Download()
- **RecordKeeper.cs** — class RecordKeeper : MonoBehaviour: Headline, CardsTaken, Value(), Title(), Format(), LoadCard()
- **RecordsSheet.cs** — class RecordsSheet : MonoBehaviour: IsOpen, Text, Screen, Toggle(), Open(), Close(); class RecordsScreen : MenuScreen: Title, Icon, Text, Closed(), Build()

## Gameplay/Regions/
- **RegionSet.cs** — class RegionSet : ScriptableObject; struct Box: Contains(); struct Region: id, title, detail, color, circleCenter, circleRadius, boxes, except, labelAt, IsRest, Contains(), regions, dwellSeconds, moveMetres
- **RegionWatch.cs** — class RegionWatch : MonoBehaviour: Regions, Current, Explored

## Gameplay/Smash/
- **Breakable.cs** — class Breakable : MonoBehaviour: Broken, Flexing, Flexed, BrokenAt, Kind, Bind(), ShouldBreak()
- **BreakableRelay.cs** — class BreakableRelay : MonoBehaviour: target
- **BreakableSettings.cs** — class BreakableSettings : ScriptableObject; enum Way; class Kind: name, way, match, minSpeed, energy, carLoss, split, mass, color, kinds, tree, treeCrownPieces, treeCrown, treeCrownPiece
- **MeshCutter.cs** — class MeshCutter; class Cut: centre, radius, height, CachedCuts, TryCut(), Warm(), TrySlices(), Has(); class Builder: Faces, Tri(), Polygon(), Raw(), ToMesh()
- **SmashSystem.cs** — class SmashSystem : MonoBehaviour; class Piece: body, renderer, filter, collider, bornAt, Breakables, Breaks, WorstBreakMs, LiveChunks, LivePieces, TreesBroken, WorstDetail, Scan(); struct Visual: mesh, mats, rot; class Flexer: b, axis, rest, at, LiveStumps, Flexing, Hinged, HingedTops, PlanksThrown; class Chunk: go, filter, renderer, body, box, capsule, crown, joint, hinged, Show(), Box(), Capsule(), Crown(), Hinge()

## Gameplay/Stunts/
- **RampSet.cs** — class RampSet : ScriptableObject; struct Ramp: id, title, start, yaw, width, height, riseLength, tableLength, downLength, landingLength, landingWidth, speedHint, baseY, baseSlope
- **StuntJudge.cs** — struct StuntSample: position, forward, up, velocity, airborne, groundedWheels, stuntMode, bodyHit, rampAtLip, hop, airTrick; struct StuntResult: title, points, ramp, repeat; class StuntJudge: InAir, LastLanding, AirTime, Step()
- **StuntScorer.cs** — class StuntScorer : MonoBehaviour: Judge, Ramps, PaysSparks, Last, Count, LastHit
- **StuntSettings.cs** — class StuntSettings : ScriptableObject: spinMinKmh, spinStartRate, spinEndRate, range180, end180Kmh, points180, range360, points360, minAirtime, pointsPerMetre, pointsAir360, pointsAir180, pointsRoll, pointsFlip

## Gameplay/Traffic/
- **TrafficCar.cs** — class TrafficCar : MonoBehaviour: Car, BodyRenderers, Pilot, RoadIndex, Lost, Blocked, Bind(), ResetState()
- **TrafficLooks.cs** — class TrafficLooks : ScriptableObject; struct Model: name, prefab, weight, size, wheelbase, paint; struct Paint: name, color, weight, models, paints, paintMaterial
- **TrafficSettings.cs** — class TrafficSettings : ScriptableObject: countHigh, countLow, roadTypes, excludeRoads, minRoadWidth, maxSpeedKmh, lookAheadMin, laneShare, spawnRange, despawn, gapBase, gapSeconds, stuckSeconds, shadowDistance
- **TrafficSystem.cs** — class TrafficSystem : MonoBehaviour: Cars, Roads

## OnFoot/
- **FigureSet.cs** — class FigureSet : ScriptableObject; struct Clip: name, speed, loop; struct Prop: name, prefab, rightHand, upright; struct Look: role, bodies, clip, prop, weight; struct AnimalLook: kind, prefabs, player, clips, props, looks, animals, standBelow, runFrom, rateRange, fade, SpeedOf(), TryProp(), TryLook()
- **HitoFigure.cs** — class HitoFigure : MonoBehaviour: Clip, Prop, Spawn(), Hold(), Play(), Move(), CastShadows()
- **WalkCameraRig.cs** — class WalkCameraRig : MonoBehaviour: Camera, Yaw, Pitch, Live, Bind(), SetLive()
- **WalkCameraSettings.cs** — class WalkCameraSettings : ScriptableObject: distance, height, targetHeight, mouseSensitivity, stickSpeed, pitchMin, pitchMax, pitchStart, damping, fov, near, collisionRadius, bob, bobFreq
- **WalkTouchControls.cs** — class WalkTouchControls : MonoBehaviour: Visible, SetVisible()
- **WalkerInput.cs** — class WalkerInput : MonoBehaviour: MouseLook, StickLook, TouchLook, Zoom, SetTouch()
- **WalkerMotor.cs** — struct WalkInput: move, sprint, slide, jump; class WalkerMotor : MonoBehaviour: CameraHeading, Settings, Yaw, Grounded, Jumping, Sliding, Speed, Velocity, GroundNormal, Cycle, Lean, SlideAmount, Configure(), Place()
- **WalkerSettings.cs** — class WalkerSettings : ScriptableObject: height, radius, stepHeight, slopeLimit, walkSpeed, runSpeed, accel, brake, airControl, turnRate, jumpSpeed, gravity, coyote, jumpBuffer

## Platform/
- **CrazyGamesPlatform.cs** — class CrazyGamesPlatform : GameSystem, IBootGate: Ready, Mode; class CrazyPortal : IGamePlatform: ToUser(), SetUser(), Name, AdsEnabled, AdBlocked, RequestRewarded(), RequestMidgame(), GameplayStart(), GameplayStop(), HappyTime(), User, AccountsAvailable, LogIn(); class CrazyDataStore : ISaveStore: Name, TryRead(), Write(), Delete()

## UI/
- **Jp.cs** — class Jp: Place(), Region()
- **NightMeet.cs** — class Palette: Yoru, Yoru2, Washi, WashiDim, Sumi, Momo, Sora, Mikan, Shu, Ok, Hex(), A(); class Ticket : VisualElement: NotchY, Perforation, Paper; class Hanko : VisualElement: Word, Ink, Stamp(); class Slant : VisualElement: Fill, Lean; class Nm: Key(), Hint(), Telop(), Kicker(), Superword(), Tier(), FadeUp(), FadeLeft(), Buttons()
- **Ui.cs** — class Ui: Box(), Row(), Text(), H1(), H2(), Small(), Button(), On(), Show(), Shown(), SliderRow(), ChoiceRow(), Smooth(), Spacer()
- **UiIcon.cs** — enum Icon; class UiIcon : VisualElement: Paint()

## Vehicles/
- **ArcadeDynamics.cs** — class ArcadeDynamics: NitroEarnScale, BurstScale, Spec, Boost, Bursting, Drift, SteerAngle, Grip, SetSpec(), SetChassis(), AddBoost(), Reset(), Step(); struct Longitudinal_
- **ArcadeSpec.cs** — class ArcadeSpec: latG, latGrip, driftLatGrip, yawResponse, maxYawRate, downforce, downforceSpeed, driftAngle, driftYawGain, powerOversteer, liftOversteer, driftRise, driftFall, catchAssist
- **ArcadeTuning.cs** — class ArcadeTuning : ScriptableObject: shift; struct PerSurface: surfaceGrip, surfaceDrag, gripBlend, aquaplaneDepth, aquaplaneLoss, steepFull, steepNone, physicsComHeightShare, collisionMode, bodyContactOffset, bodyUnderLift, bodyLengthShare, driveRetainSpeed, gradeAssist
- **CarBodyDeformer.cs** — class CarBodyDeformer; class Part: filter, tris, restFace, faceNow, faceStamp, stamp, movedList, normalCursor, restBounds, subMeshes, materials; struct SubMeshInfo; struct Dent: point, dir, seed, Parts, Body, MaxDisplacement, LastMoved, LastPlane, Damaged, Timing, PrepareNext(), CopyNext(), Prepare(), Field(); class Job: dent, droop; class Droop: end, side, amount, EnqueueDroop(), Enqueue(), Knee(), Busy, Apply(), Work(), WorstWorkMs, WorstWorkDetail, ResetCost(), Finish(), RemoveTriangles()
- **CarCameraRig.cs** — class CarCameraRig : MonoBehaviour; enum Mode: Current, Spec, Head, CockpitCamera, Settings, Chase, Cinematic, Attach(), Toggle(), SetLive(), ShakeFactor, CockpitFov(), Rumble
- **CarCameraSettings.cs** — class CarCameraSettings : ScriptableObject: distance, distanceFast, height, targetHeight, velocityBlend, velocityBlendSpeed, headingRate, positionDamping, lookAhead, lookAheadMax, fov, fovFast, fovSpeed, fovBoost
- **CarLoadout.cs** — interface ICarLoadout; class CarLooks: Apply(), Paint()
- **CarModels.cs** — class CarModels: Get(), HasModel(), Ready(), EditorSync, Request(), IsLoading(), LoadedCount
- **CinematicCamera.cs** — class CinematicCamera : MonoBehaviour: Running, Showing, Current, Cuts, EyeOffset, CameraTransform, Init(), Begin(), End(), ToggleShowing(), PoseIsClear()
- **CinematicCameraSettings.cs** — enum CineShot; class CinematicCameraSettings : ScriptableObject; struct Shot: kind, weight, seconds, fov, offset, damping, handheld, randomSide, shots, firstShot, clearance, occlusionGrace, minGroundHeight, orbitSpeed
- **CockpitHead.cs** — class CockpitHead; struct Input: surface, airborne, bump, shift, landing, impact, Euler, Offset, Shake, Reset(), Step()
- **CockpitSettings.cs** — enum CockpitWheel; enum CockpitCluster; class CockpitSpec: carId, eyeOffset, fov, pitch, near, wheel, wheelSize, wheelRatio, wheelMax, wheelOffset, cluster, clusterOffset, clusterScale, headUp; class CockpitSettings : ScriptableObject: fallback, cars, For()
- **CockpitView.cs** — class CockpitView: Triangles, Opaque(), Hidden(), GroundFrom()
- **CockpitWheelMesh.cs** — class CockpitWheelMesh: Hands(), Build(); class Builder: ToMesh(), Torus(), Capsule(), Cylinder(), Box()
- **DamageEffects.cs** — class DamageEffects: SparksEmitted, BitsEmitted, SetTier(), Sparks(), Bits(), Destroy()
- **DamageMarks.cs** — class DamageMarks; enum Tile; class Mark: part, verts, tris, uv, Count, LastAdd, MaterialFor(), Add(), Rebuild(), Warm(), Warmed, Clear(), Destroy(), AtlasReady
- **DriveTouchControls.cs** — class DriveTouchControls : MonoBehaviour: Engaged, Visible, SetVisible()
- **DriveTypes.cs** — enum Surface; struct DriveInput: throttle, brake, steer, handbrake, boost, stunt, trick, burst; enum AirTrick; struct PlanarEnv: vLong, vLat, surface, circuit, waterDepth, airborne, support, slopeAccel, timeToLand; struct PlanarResult: accelLong, accelLat, yawRate, pitchRate, rollRate, flipRate, hop, airTrick, drift, slip, skid, wheelspin, boosting, boost
- **DriverInput.cs** — class DriverInput : MonoBehaviour: StuntArmed, LookBackHeld, Look, Zoom, PressBurst(), SetTouch(), ToggleStunt(), PressRespawn(), PressRepair(), Raw, PressCamera()
- **Gearbox.cs** — struct GearboxSpec: gears, idle, redline, limiter, shiftTime, spread; struct ShiftStrategy: up, down, brakeDown, hold, topGearMargin, launch, limiterCut, Default; class Gearbox: Gear, Rpm, Load, Shifts, LimiterHits, LastShiftUp, Spec, Shifting, Configure(), Reset(), GearTop(), Step(), Label()
- **HeadlightSettings.cs** — class HeadlightSettings : ScriptableObject: actions, spots, cones, poolStrength, lightColor, lowIntensity, lowRange, lowAngle, lowPitch, highIntensity, highRange, highAngle, highPitch, beamMaterial
- **HeadlightSwitch.cs** — enum HeadlightMode; class HeadlightSwitch: Bind(), On, Reload(), Press()
- **Headlights.cs** — class Headlights : MonoBehaviour; enum Kind; struct Lamp: material, baseColor, kind; struct Layout: IsPlayer, LightsOn, HeadLevel, TailLevel, ReverseLevel, PopupOpen, Lamps, LampMaterialCount, ActiveSpots, PoolVisible, PoolLevel, ActiveCones, Bind(), FindLayout(); class Accum: Add(), TryGet(), TierIndex()
- **PathFollower.cs** — class PathFollower : MonoBehaviour: car, path, closed, gripShare, maxSpeedKmh, lookAheadMin, lookAheadSeconds, stopAtEnd, braking, slowForHeading, lateral, Travelled, Length, Offset
- **PendingModel.cs** — class PendingModel : MonoBehaviour: Material, Wait()
- **PlayerCarSpawner.cs** — class PlayerCarSpawner : MonoBehaviour: Current, Fleet, Loadout, Spawn(), SpawnAt(), Build(), AttachModel()
- **TuningSettings.cs** — enum TuneCategory; enum CarSetupMode; struct CarTune: Code, All; struct CarFine: height, camber, track; (TuningSettings: Clamp(), Stance()); class TuningSettings : ScriptableObject; struct Category: id, title, categories, engineForce, engineTopSpeed, brakeDistance, steeringDelay, tyreGrip, driftCatch, driftLock, dirtFalloff, dirtLift, safeCrawl, palette
- **VehicleController.cs** — class VehicleController : MonoBehaviour: Input, HoldStill, Definition, Tuning, Body, Dynamics, Telemetry, Wheels; struct Wheel: local, front, grounded, compression, load, hitCollider, hitTriangle, missing, SteerBias, SetWheelMissing(), Configure(), Spec, Gearbox, Place(); struct VehicleTelemetry: boost, boosting, airborne, groundedWheels, surface, support, hop, airTrick
- **VehicleDamage.cs** — class VehicleDamage : MonoBehaviour; struct Impact: deltaV, dent, screenCracked, wheelLost, wheelsBent, bumperHangs, brokeThrough, other; class Pending: other, soft, softDeltaV, Settings, Deformer, Marks, Effects, Bound, NeedsRepair, WheelsLost, BentWheels, IsWheelLost(), Bend(), Last
- **VehicleDamageSettings.cs** — class VehicleDamageSettings : ScriptableObject: dentFrom, scuffFrom, depthPerDeltaV, depthPerDeltaV2, maxDepth, radiusBase, radiusPerDeltaV, radiusOverObject, narrowDepth, narrowBelow, maxDisplacement, gatherSteps, frameBudgetMs, droopFrom
- **VehicleDefinition.cs** — enum VehicleCategory; class VehicleDefinition : ScriptableObject: id, displayName, category, legacyId, model, modelAsset, EditorModel, price, factoryPaint, mass, wheelbase, cgHeight, wheelRadius, bodySize
- **VehicleEffects.cs** — class VehicleEffects : MonoBehaviour: Bursts, Bind()
- **VehicleEffectsSettings.cs** — class VehicleEffectsSettings : ScriptableObject: skidMaterial, smokeMaterial, markFromSkid, markWidth, markSeconds, smokeRate, dustFullSpeed, smokeColor, dustColor, flameMaterial, shockMaterial, flameCore, flameEdge, burstFlame
- **VehicleFleet.cs** — class VehicleFleet : ScriptableObject: tuning, effects, damage, vehicles, defaultId, Get(), Default
- **VehicleRespawn.cs** — class VehicleRespawn : MonoBehaviour: Locator, Respawn()
- **VehicleVisuals.cs** — class VehicleVisuals : MonoBehaviour: BodyRoot, Wheel(), SetWobble(), SetStance(), Detach(), Reattach(), Bind(), FindPrefix(), IsTuningOption()

## World/
- **InstanceCollider.cs** — class InstanceCollider : MonoBehaviour: Owner, Index
- **InstanceData.cs** — class InstanceData : ScriptableObject; class Prototype: name, lods, material, lodMaterials, lodEnd, maxDistance, shadowLods, shadowProxyLod, colliderRadius, colliderHeight; struct Run; class Chunk: bounds, runs, chunkSize, prototypes, chunks, positions, Count, Matrix()
- **InstanceRenderer.cs** — class InstanceRenderer : MonoBehaviour: data, maxDistance, colliderRadius, LastDrawn, LastCalls, LastMs, Build(), SetHidden(), IsHidden(), TryGetVisual(), FindInstances()
- **LampLightSettings.cs** — class LampLightSettings : ScriptableObject; class Kind: prefix, height, poolRadius, poolColor, lightColor, lightIntensity, lightRange, kinds, lights, poolDistance, pickInterval
- **LampLights.cs** — class LampLights : MonoBehaviour; struct Lamp: Instance, Darken(), LampCount, ActiveLights
- **LookProfile.cs** — class LookProfile : ScriptableObject: sunElevation, sunAzimuth, sunColor, sunIntensity, skyTint, skyGround, skyZenith, skyHorizon, cloudShadow, cloudLit, cloudScale, cloudSpeed, ambientSky, ambientEquator
- **PlaceInstanceData.cs** — class PlaceInstanceData : InstanceData: matrices, Matrix()
- **PlanarReflection.cs** — class PlanarReflection : MonoBehaviour: Active, Size
- **PlanarReflectionSettings.cs** — class PlanarReflectionSettings : ScriptableObject: planeY, region, maxCameraHeight, scale, maxSize, farClip, layers
- **RoadNetwork.cs** — class RoadNetwork : ScriptableObject, IRoadLocator; struct Road: id, type, closed, width, points, roads, TryNearest(), CarriagewayAt()
- **StartContentGate.cs** — class StartContentGate : GameSystem, IBootGate: Ready, Required
- **StreamedTerrain.cs** — class StreamedTerrain : MonoBehaviour: Ready, Failed, MarkPlaceholder(), Preload(), FetchDetails()
- **TerrainPayload.cs** — class TerrainPayload; class Grids: size, heights, alphas, details, holeRes, holes, Read(), EncodeDetails(), Encode(), Decode(), DecodeDetails(), Apply(), ApplyDetails()
- **TerrainQuality.cs** — class TerrainQuality : MonoBehaviour; struct Tier: name, treeDistance, buildingDistance, detailDistance, pixelError, tiers, Apply()
- **VegetationData.cs** — class VegetationData : InstanceData: shapes, Matrix()
- **ViewpointSet.cs** — class ViewpointSet : ScriptableObject; struct Viewpoint: name, position, lookAt, Rotation, viewpoints, TryGet(), Apply()
