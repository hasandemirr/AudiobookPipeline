namespace AudiobookPipeline.TextProcessor.Core.Models;

public class ChunkEntry
{
    public string Id { get; set; } = string.Empty;
    public int CharCount { get; set; }
    public string Status { get; set; } = "pending";
    public double? AudioDurationSec { get; set; }
    public int Retries { get; set; }
}
