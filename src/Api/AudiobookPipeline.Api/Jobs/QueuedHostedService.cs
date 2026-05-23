namespace AudiobookPipeline.Api.Jobs;

public class QueuedHostedService : BackgroundService
{
    private readonly BackgroundTaskQueue _queue;
    private readonly ILogger<QueuedHostedService> _logger;

    public QueuedHostedService(
        BackgroundTaskQueue queue,
        ILogger<QueuedHostedService> logger)
    {
        _queue  = queue;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(
        CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "[JobQueue] Worker started.");

        await foreach (var job in
            _queue.ReadAllAsync(stoppingToken))
        {
            try
            {
                _logger.LogInformation(
                    "[JobQueue] Starting job: {Job}",
                    job.GetType().Name);

                await job.ExecuteAsync(stoppingToken);

                _logger.LogInformation(
                    "[JobQueue] Completed job: {Job}",
                    job.GetType().Name);
            }
            catch (OperationCanceledException)
            {
                _logger.LogWarning(
                    "[JobQueue] Job cancelled: {Job}",
                    job.GetType().Name);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex,
                    "[JobQueue] Job failed: {Job}",
                    job.GetType().Name);
            }
        }
    }
}
