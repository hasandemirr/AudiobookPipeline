namespace AudiobookPipeline.TextProcessor.Core.Models;

public class ChunkEntry
{
    public string Id { get; set; } = string.Empty;

    // Which section this chunk came from (book-wide list is ordered via Order).
    public string SectionId { get; set; } = string.Empty;

    // Sequential order across the whole book (render + merge follow this).
    public int Order { get; set; }

    // Chunk text lives in render.json (the render manifest is its source of truth).
    public string Text { get; set; } = string.Empty;

    public int CharCount { get; set; }

    // Page span this chunk covers (may cross pages for sentence integrity).
    public int? PageStart { get; set; }
    public int? PageEnd { get; set; }

    public ChunkStatus Status { get; set; } = ChunkStatus.Pending;

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
