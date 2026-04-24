namespace AudiobookPipeline.TextProcessor.Core.Models;

public class TocEntry
{
    public int Level { get; set; }
    public string Title { get; set; } = string.Empty;
    public int PageStart { get; set; }
    public int PageEnd { get; set; }
    public bool Narrate { get; set; } = true;
}
