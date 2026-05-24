namespace AudiobookPipeline.TextProcessor.Core.Models;

// Structural page unit. Replaces inline "=== SAYFA N ===" string markers as the
// source of truth. Persisted per-section as a JSON list (sections/{id}.json,
// reviewed/{id}.json). Page number is structural, never parsed from text.
public sealed class PageContent
{
    public int PageNumber { get; set; }
    public string Text { get; set; } = string.Empty;
}
