using System.Runtime.CompilerServices;

// Tests may reach internals; production modules may not.
[assembly: InternalsVisibleTo("JapanMap.Tests.EditMode")]
[assembly: InternalsVisibleTo("JapanMap.Tests.PlayMode")]
