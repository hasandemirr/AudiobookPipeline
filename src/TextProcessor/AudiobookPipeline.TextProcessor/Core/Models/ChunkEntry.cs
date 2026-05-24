namespace AudiobookPipeline.TextProcessor.Core.Models;

public class ChunkEntry
{
    public string Id { get; set; } = string.Empty;

    // Chunk text lives in the manifest (single source of truth).
    public string Text { get; set; } = string.Empty;

    public int CharCount { get; set; }

    // pending | done | failed
    public string Status { get; set; } = "pending";

    // Rendered audio file (workspace/{slug}/audio/{id}.wav); null until rendered.
    public string? AudioPath { get; set; }

    public double? AudioDurationSec { get; set; }

    // SRT timing: this chunk's full text spans [start, end] of audio.
    public long? SubtitleStartMs { get; set; }
    public long? SubtitleEndMs { get; set; }

    // True when a single sentence exceeded the char limit and was split
    // at a comma/quote boundary (flagged in the UI).
    public bool IsLong { get; set; }

    public int Retries { get; set; }
}
