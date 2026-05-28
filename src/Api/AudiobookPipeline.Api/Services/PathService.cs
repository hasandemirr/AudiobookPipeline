namespace AudiobookPipeline.Api.Services;

public class PathService
{
    private readonly string _root;

    public PathService(IConfiguration config)
    {
        _root = config["WorkspaceRoot"] 
            ?? FindRepoRoot(AppContext.BaseDirectory);
        Console.WriteLine($"[PATH SERVICE] Root: {_root}");
    }

    public string RepoRoot => _root;

    public string ToRelative(string absolutePath)
    {
        if (string.IsNullOrEmpty(absolutePath)) 
            return absolutePath;
        
        if (absolutePath.StartsWith(_root,
            StringComparison.OrdinalIgnoreCase))
            return absolutePath
                .Substring(_root.Length)
                .TrimStart(Path.DirectorySeparatorChar);
        
        return absolutePath;
    }

    public string ToAbsolute(string relativePath)
    {
        if (string.IsNullOrEmpty(relativePath))
            return relativePath;
        
        if (Path.IsPathRooted(relativePath))
            return relativePath;
        
        return Path.Combine(_root, relativePath);
    }

    public string ResolveSectionPath(AudiobookPipeline.TextProcessor.Core.Models.Section section)
    {
        var reviewed = section.ReviewedPath;
        var extracted = section.TxtPath;

        if (!string.IsNullOrEmpty(reviewed))
            reviewed = ToAbsolute(reviewed);
        if (!string.IsNullOrEmpty(extracted))
            extracted = ToAbsolute(extracted);

        return !string.IsNullOrEmpty(reviewed) && File.Exists(reviewed)
            ? reviewed
            : extracted;
    }

    public string WorkspaceDir => Path.Combine(_root, "workspace");
    public string OutputDir   => Path.Combine(_root, "output");
    public string PdfDir      => Path.Combine(_root, "assets", "raw_pdfs");

    public string BookDir(string slug) =>
        Path.Combine(WorkspaceDir, slug);

    public string ManifestPath(string slug) =>
        Path.Combine(BookDir(slug), "manifest.json");

    public string RenderManifestPath(string slug) =>
        Path.Combine(BookDir(slug), "render.json");

    public string SectionsDir(string slug) =>
        Path.Combine(BookDir(slug), "sections");

    public string ReviewedDir(string slug) =>
        Path.Combine(BookDir(slug), "reviewed");

    // Structural page JSON paths (PageContent[]). Derived from the section's
    // .txt pointer filename, with a .json extension.
    public string SectionJsonPath(string slug, string txtFileName) =>
        Path.Combine(SectionsDir(slug),
            Path.ChangeExtension(txtFileName, ".json"));

    public string ReviewedJsonPath(string slug, string txtFileName) =>
        Path.Combine(ReviewedDir(slug),
            Path.ChangeExtension(txtFileName, ".json"));

    public string ExportPath(string slug) =>
        Path.Combine(OutputDir, $"{slug}_export.txt");

    public string OcrRulesPath =>
        Path.Combine(_root, "src", "TextProcessor",
            "AudiobookPipeline.TextProcessor",
            "Core", "Rules", "ocr_rules.json");

    public bool ManifestExists(string slug) =>
        File.Exists(ManifestPath(slug));

    private static string FindRepoRoot(string startPath)
    {
        var dir = new DirectoryInfo(startPath);
        while (dir != null)
        {
            if (File.Exists(Path.Combine(dir.FullName, ".gitignore")))
                return dir.FullName;
            dir = dir.Parent;
        }
        throw new InvalidOperationException(
            "Repo root not found. Is .gitignore missing?");
    }
}
