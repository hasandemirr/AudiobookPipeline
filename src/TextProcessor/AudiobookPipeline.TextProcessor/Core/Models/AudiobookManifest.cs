namespace AudiobookPipeline.TextProcessor.Core.Models;

// Audiobook context manifest (meta only). Chunks live separately in chunks.json
// (different write cadence: chunks change often during render, meta rarely).
// An audiobook is an independent entity (M1): once created from a book or txt,
// it is a snapshot (K1) — changes to the source never affect it.
public class AudiobookManifest
{
    public string Slug { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;

    // pdf | txt — where the content originally came from.
    public string SourceType { get; set; } = string.Empty;

    // For pdf: the source book slug (informational only — no live link).
    // For txt: the original uploaded file name.
    public string SourceRef { get; set; } = string.Empty;

    public string CreatedAt { get; set; } = string.Empty;
    public string UpdatedAt { get; set; } = string.Empty;

    // idle | chunking | rendering | done | failed
    public string RenderStatus { get; set; } = "idle";

    public AudiobookOutput Output { get; set; } = new();
}

public class AudiobookOutput
{
    public string? MergedPath { get; set; }
    public string? Format { get; set; }
    public string? SrtPath { get; set; }
}
