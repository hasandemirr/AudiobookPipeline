namespace AudiobookPipeline.Api.Jobs;

public interface IJob
{
    Task ExecuteAsync(CancellationToken cancellationToken);
}
