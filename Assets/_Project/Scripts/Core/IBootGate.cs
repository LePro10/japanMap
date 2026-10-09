namespace JapanMap.Core
{
    /// <summary>
    /// A boot system the first scene must wait for (the platform SDK, before the save is read). The Bootstrapper
    /// waits until every gate is ready, at most its timeout — a gate that never opens must not stop the game.
    /// </summary>
    public interface IBootGate
    {
        bool Ready { get; }
    }
}
