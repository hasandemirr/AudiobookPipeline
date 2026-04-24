namespace AudiobookPipeline.TextProcessor.Core.Models;

public class BookManifest
{
    public string Book { get; set; } = string.Empty;
    public string CreatedAt { get; set; } = string.Empty;
    public string UpdatedAt { get; set; } = string.Empty;
    public bool IsLocked { get; set; } = false;
    public string LockedAt { get; set; } = string.Empty;
    public string LockedBy { get; set; } = string.Empty;
    public List<TocEntry> Toc { get; set; } = new();
    public List<Section> Sections { get; set; } = new();
    public List<ChunkEntry> Chunks { get; set; } = new();
}
