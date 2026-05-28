namespace AudiobookPipeline.TextProcessor.Core.Models;

// Render lifecycle of a single chunk.
// Pending -> Rendering -> Done; Done -> Stale (text edited after render);
// Stale -> Rendering; Failed -> Pending (retry).
public enum ChunkStatus
{
    Pending,
    Rendering,
    Done,
    Failed,
    Stale
}
