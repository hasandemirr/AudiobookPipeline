namespace AudiobookPipeline.TextProcessor.Core.Models;

public class Section
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public int PageStart { get; set; }
    public int PageEnd { get; set; }
    public string Status { get; set; } = "extracted";
    public bool Narrate { get; set; } = true;
    public string TxtPath { get; set; } = string.Empty;
    public string ReviewedPath { get; set; } = string.Empty;
}
