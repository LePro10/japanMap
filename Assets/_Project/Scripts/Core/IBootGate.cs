namespace JapanMap.Core
{
    /// <summary>
    /// A boot system the first scene must wait for (the platform SDK, before the save is read). The Bootstrapper
    /// waits until every gate is ready, at most its timeout — a gate that never opens must not stop the game.
    /// A <see cref="Required"/> gate (content the world cannot exist without: the terrain) is waited for to the end.
    /// </summary>
    public interface IBootGate
    {
        bool Ready { get; }
        bool Required => false;
    }
}
