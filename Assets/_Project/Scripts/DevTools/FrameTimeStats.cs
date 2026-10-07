namespace JapanMap.DevTools
{
    /// <summary>Rolling average and worst frame time over the last N frames.</summary>
    public sealed class FrameTimeStats
    {
        readonly float[] _samples;
        int _count;
        int _next;
        float _sum;

        public FrameTimeStats(int window) => _samples = new float[window];

        public int Count => _count;
        public float AverageMs => _count == 0 ? 0f : _sum / _count;

        public float WorstMs
        {
            get
            {
                var worst = 0f;
                for (var i = 0; i < _count; i++)
                    if (_samples[i] > worst) worst = _samples[i];
                return worst;
            }
        }

        public void Add(float ms)
        {
            if (_count == _samples.Length) _sum -= _samples[_next];
            else _count++;
            _samples[_next] = ms;
            _sum += ms;
            _next = (_next + 1) % _samples.Length;
        }
    }
}
