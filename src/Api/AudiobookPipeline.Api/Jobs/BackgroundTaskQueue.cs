using System.Threading.Channels;

namespace AudiobookPipeline.Api.Jobs;

public class BackgroundTaskQueue
{
    private readonly Channel<IJob> _queue =
        Channel.CreateUnbounded<IJob>(
            new UnboundedChannelOptions
            {
                SingleReader = true
            });

    public ValueTask EnqueueAsync(IJob job) =>
        _queue.Writer.WriteAsync(job);

    public IAsyncEnumerable<IJob> ReadAllAsync(
        CancellationToken ct) =>
        _queue.Reader.ReadAllAsync(ct);
}
