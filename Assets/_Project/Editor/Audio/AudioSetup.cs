using System.Collections.Generic;
using System.IO;
using JapanMap.Audio;
using JapanMap.Vehicles;
using UnityEditor;
using UnityEngine;

namespace JapanMap.Editor.Audio
{
    /// <summary>
    /// Sound import (one rule for every clip under Art/Audio) and the banks: an engine bank per car from the stand-in
    /// loops (rpm steps as rendered by Tools/render-sounds.mjs: 30/50/70/92 % of the car's redline), and
    /// the game's sound bank with every name, group and level. Missing clips stay empty slots (silent) so the asset
    /// session can drop recordings in by name. Re-running keeps hand-tuned levels of existing entries.
    /// </summary>
    public sealed class AudioSetup : AssetPostprocessor
    {
        public const string ArtDir = "Assets/_Project/Art/Audio";
        public const string StandIn = ArtDir + "/StandIn";
        public const string DataDir = "Assets/_Project/Data/Audio";
        public const string BankPath = DataDir + "/Sounds.asset";
        static readonly float[] Steps = { 0.3f, 0.5f, 0.7f, 0.92f };

        void OnPreprocessAudio()
        {
            if (!assetPath.StartsWith(ArtDir)) return;
            var importer = (AudioImporter)assetImporter;
            importer.forceToMono = true;
            importer.loadInBackground = false;
            var s = importer.defaultSampleSettings;
            // Short loops and one-shots decompressed (exact pitch and loop), long beds stay compressed. 22 kHz and a low
            // quality: measured +2.26 MB of download at 32 kHz / 0.4 for the 130 stand-ins.
            var longClip = assetPath.Contains("Ambience") || assetPath.Contains("Music");
            s.loadType = longClip ? AudioClipLoadType.CompressedInMemory : AudioClipLoadType.DecompressOnLoad;
            s.compressionFormat = AudioCompressionFormat.Vorbis;
            s.quality = 0.2f;
            s.sampleRateSetting = AudioSampleRateSetting.OverrideSampleRate;
            s.sampleRateOverride = 22050;
            // Loaded with the scene: without it the first play of each one-shot decoded the clip on the spot
            // (1.0–1.5 ms hitch on the first break, impact or bell; measured in Phase 11).
            s.preloadAudioData = true;
            importer.defaultSampleSettings = s;
        }

        [MenuItem("JapanMap/Audio/Build Banks")]
        public static string Build()
        {
            Directory.CreateDirectory(DataDir);
            var made = new List<string>();
            foreach (var guid in AssetDatabase.FindAssets("t:JapanMap.Vehicles.VehicleDefinition", new[] { "Assets/_Project/Data/Vehicles" }))
            {
                var def = AssetDatabase.LoadAssetAtPath<VehicleDefinition>(AssetDatabase.GUIDToAssetPath(guid));
                var path = $"{DataDir}/Engine_{def.id}.asset";
                var bank = AssetDatabase.LoadAssetAtPath<EngineSoundBank>(path);
                var created = bank == null;
                if (created) bank = ScriptableObject.CreateInstance<EngineSoundBank>();
                bank.carId = def.id;
                bank.idle = Clip($"Engine_{def.id}_idle");
                bank.idleRpm = def.gearbox.idle;
                bank.lift = Clip($"Lift_{def.id}");
                bank.steps = new EngineSoundBank.Step[Steps.Length];
                for (var i = 0; i < Steps.Length; i++)
                    bank.steps[i] = new EngineSoundBank.Step { rpm = def.gearbox.redline * Steps[i], onLoad = Clip($"Engine_{def.id}_on{i}"), offLoad = Clip($"Engine_{def.id}_off{i}") };
                if (created) AssetDatabase.CreateAsset(bank, path);
                else EditorUtility.SetDirty(bank);
                made.Add(def.id);
            }
            var sounds = AssetDatabase.LoadAssetAtPath<SoundBank>(BankPath);
            var fresh = sounds == null;
            if (fresh) sounds = ScriptableObject.CreateInstance<SoundBank>();
            var old = new Dictionary<string, SoundBank.Entry>();
            foreach (var e in sounds.entries) old[e.name] = e;
            var list = new List<SoundBank.Entry>();
            void E(string name, SoundGroup g, float volume, float jitter = 0f)
            {
                var e = old.TryGetValue(name, out var o) ? o : new SoundBank.Entry { name = name, group = g, volume = volume, pitchJitter = jitter };
                e.clip = Clip(name) ?? e.clip;
                list.Add(e);
            }
            // Tyres & impacts
            E("Roll_Asphalt", SoundGroup.Tyres, 1f);
            E("Roll_Gravel", SoundGroup.Tyres, 0.8f);
            E("Roll_Grass", SoundGroup.Tyres, 0.8f);
            E("Roll_Water", SoundGroup.Tyres, 0.35f);
            E("Skid_Asphalt", SoundGroup.Tyres, 1f);
            E("Impact_Car_Soft", SoundGroup.Tyres, 0.6f, 0.08f);
            E("Impact_Car_Mid", SoundGroup.Tyres, 0.75f, 0.08f);
            E("Impact_Car_Hard", SoundGroup.Tyres, 0.9f, 0.06f);
            E("Land_Thump", SoundGroup.Tyres, 0.7f, 0.08f);
            E("Splash", SoundGroup.Tyres, 0.8f, 0.08f);
            E("Break_Rail", SoundGroup.Tyres, 0.7f, 0.06f);
            E("Break_Tree", SoundGroup.Tyres, 0.8f, 0.06f);
            E("Break_Wood", SoundGroup.Tyres, 0.8f, 0.1f);
            E("Break_Cone", SoundGroup.Tyres, 0.8f, 0.1f);
            E("Break_Barrel", SoundGroup.Tyres, 0.7f, 0.08f);
            // World
            E("Wind", SoundGroup.World, 1f);
            E("Whoosh_Up", SoundGroup.World, 0.8f, 0.05f);
            E("Whoosh_Down", SoundGroup.World, 0.8f, 0.05f);
            E("Boost_Burst", SoundGroup.World, 0.9f, 0.04f);
            // Signals (UI group: they play over the paused menu and duck the music)
            E("Bell_Checkpoint", SoundGroup.UI, 1f);
            E("Bell_Lap", SoundGroup.UI, 1f);
            E("Bell_LapBest", SoundGroup.UI, 1f);
            E("Bell_Finish", SoundGroup.UI, 1f);
            E("Bell_Win", SoundGroup.UI, 1f);
            E("Bell_Discovery", SoundGroup.UI, 1f);
            E("Bell_Sparks", SoundGroup.UI, 0.6f, 0.03f);
            E("Countdown_Tick", SoundGroup.UI, 1f);
            E("Countdown_Go", SoundGroup.UI, 1f);
            E("UI_Click", SoundGroup.UI, 0.8f, 0.04f);
            sounds.entries = list.ToArray();

            // Local world sound (ASTRA §6): only the temple bell has a stand-in; the rest are empty slots for the
            // asset session (STATUS lists them with lengths).
            var amb = new List<SoundBank.Ambience>(sounds.ambience);
            void A(string name, float x, float z, float radius, bool loop, Vector2 gap, float volume)
            {
                var i = amb.FindIndex(a => a.name == name);
                var a = i >= 0 ? amb[i] : new SoundBank.Ambience { name = name, at = new Vector2(x, z), radius = radius, loop = loop, gap = gap, volume = volume };
                a.clip = Clip($"Ambience_{name}") ?? a.clip;
                if (i >= 0) amb[i] = a; else amb.Add(a);
            }
            A("TempleBell", 828f, 940f, 420f, false, new Vector2(30f, 55f), 0.8f);
            A("Workshop", 572f, -481f, 120f, true, Vector2.zero, 0.5f);
            A("NeonHum", 700f, -100f, 600f, true, Vector2.zero, 0.4f);
            A("Harbour", -1233f, -1054f, 260f, true, Vector2.zero, 0.5f);
            A("Waterwheel", -1213f, -348f, 220f, true, Vector2.zero, 0.5f);
            A("PassWind", -536f, 495f, 700f, true, Vector2.zero, 0.5f);
            sounds.ambience = amb.ToArray();
            if (fresh) AssetDatabase.CreateAsset(sounds, BankPath);
            else EditorUtility.SetDirty(sounds);
            AssetDatabase.SaveAssets();
            var missing = list.FindAll(e => e.clip == null).ConvertAll(e => e.name);
            var msg = $"[Audio] {made.Count} engine banks, {list.Count} sounds ({missing.Count} without clip{(missing.Count > 0 ? ": " + string.Join(", ", missing) : "")}), {amb.Count} ambience zones";
            Debug.Log(msg);
            return msg;
        }

        /// <summary>A recording (Art/Audio/&lt;name&gt;.wav) wins over the stand-in (Art/Audio/StandIn/SFX_STANDIN_&lt;name&gt;.wav).</summary>
        static AudioClip Clip(string name)
        {
            foreach (var guid in AssetDatabase.FindAssets(name + " t:AudioClip", new[] { ArtDir }))
            {
                var p = AssetDatabase.GUIDToAssetPath(guid);
                if (!p.Contains("/StandIn/") && Path.GetFileNameWithoutExtension(p) == name) return AssetDatabase.LoadAssetAtPath<AudioClip>(p);
            }
            return AssetDatabase.LoadAssetAtPath<AudioClip>($"{StandIn}/SFX_STANDIN_{name}.wav");
        }
    }
}
