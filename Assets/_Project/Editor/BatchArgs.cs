using System;

namespace JapanMap.Editor
{
    /// <summary>Reads "-jmKey value" pairs from the Unity command line (used by Tools/*.mjs).</summary>
    static class BatchArgs
    {
        public static string Get(string key, string fallback)
        {
            var args = Environment.GetCommandLineArgs();
            for (var i = 0; i < args.Length - 1; i++)
                if (string.Equals(args[i], "-" + key, StringComparison.OrdinalIgnoreCase))
                    return args[i + 1];
            return fallback;
        }

        public static int GetInt(string key, int fallback) =>
            int.TryParse(Get(key, null), out var v) ? v : fallback;

        public static bool Has(string key) =>
            Array.Exists(Environment.GetCommandLineArgs(), a => string.Equals(a, "-" + key, StringComparison.OrdinalIgnoreCase));
    }
}
