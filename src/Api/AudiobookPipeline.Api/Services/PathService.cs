namespace AudiobookPipeline.Api.Services;

public class PathService
{
    private readonly string _root;

    public PathService(IConfiguration config)
    {
        _root = config["WorkspaceRoot"] 
            ?? FindRepoRoot(AppContext.BaseDirectory);
    }

    public string RepoRoot => _root;
    public string WorkspaceDir => Path.Combine(_root, "workspace");
    public string OutputDir   => Path.Combine(_root, "output");
    public string PdfDir      => Path.Combine(_root, "assets", "raw_pdfs");

    public string BookDir(string slug) =>
        Path.Combine(WorkspaceDir, slug);

    public string ManifestPath(string slug) =>
        Path.Combine(BookDir(slug), "manifest.json");

    public string SectionsDir(string slug) =>
        Path.Combine(BookDir(slug), "sections");

    public string ReviewedDir(string slug) =>
        Path.Combine(BookDir(slug), "reviewed");

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
