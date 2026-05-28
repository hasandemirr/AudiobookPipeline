namespace AudiobookPipeline.TextProcessor.Core.Models;

// Render-side manifest, stored separately from the book manifest at
// workspace/{slug}/render.json. Chunks live here (not in BookManifest) because
// they have a different lifecycle (frequent status writes during render) and
// would otherwise bloat/contend with the book manifest.
public class RenderManifest
{
    public string Book { get; set; } = string.Empty;
    public string CreatedAt { get; set; } = string.Empty;
    public string UpdatedAt { get; set; } = string.Empty;

    // idle | chunking | rendering | done | failed
    public string RenderStatus { get; set; } = "idle";

    public List<ChunkEntry> Chunks { get; set; } = new();

    public RenderOutput Output { get; set; } = new();
}

public class RenderOutput
{
    public string? MergedPath { get; set; }
    public string? Format { get; set; }
    public string? SrtPath { get; set; }
}
