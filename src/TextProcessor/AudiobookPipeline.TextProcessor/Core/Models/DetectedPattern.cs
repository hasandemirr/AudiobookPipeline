namespace AudiobookPipeline.TextProcessor.Core.Models;

public class DetectedPattern
{
    public string Text { get; set; } = string.Empty;

    // "first" | "last" | "any"
    public string Position { get; set; } = string.Empty;

    public int PageCount { get; set; }
    public int TotalPages { get; set; }

    // "high" | "medium" | "low"
    public string Confidence { get; set; } = string.Empty;

    public bool IsPageNumber { get; set; }
    public bool IsCheckedByDefault { get; set; }
}
