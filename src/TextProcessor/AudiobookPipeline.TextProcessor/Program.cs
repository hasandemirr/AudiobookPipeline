using AudiobookPipeline.TextProcessor.Core.Models;
using AudiobookPipeline.TextProcessor.Core.Services;

if (args.Length < 2)
{
    Console.WriteLine(
        "Kullanım: dotnet run <pdf_yolu> <book_slug>");
    return;
}

var pdfPathInput = args[0];
var slug = args[1];

var repoRoot = FindRepoRoot(AppContext.BaseDirectory);
var assetsDir  = Path.Combine(repoRoot, "assets");
var workspaceDir = Path.Combine(repoRoot, "workspace");

Console.WriteLine($"Repo kökü: {repoRoot}");

var pdfPath = pdfPathInput;
if (!Path.IsPathRooted(pdfPath))
    pdfPath = Path.Combine(repoRoot, pdfPath);

var workspaceRoot = Path.Combine(workspaceDir, slug);
var sectionsDir   = Path.Combine(workspaceRoot, "sections");
var manifestPath  = Path.Combine(workspaceRoot, "manifest.json");
var rulesPath     = Path.Combine(repoRoot, "src", "TextProcessor",
                       "AudiobookPipeline.TextProcessor",
                       "Core", "Rules", "ocr_rules.json");

Directory.CreateDirectory(sectionsDir);

// Servisler
var tocParser    = new TocParserService();
var extractor    = new PdfExtractService();
var detector     = new HeaderFooterDetector(minRepeatCount: 3);
var ocrFix       = new OcrFixService(rulesPath);
var manifestSvc  = new ManifestService();

Console.WriteLine($"PDF: {pdfPath}");
Console.WriteLine($"Slug: {slug}");

// 1. TOC
var toc = tocParser.HasToc(pdfPath)
    ? tocParser.Parse(pdfPath)
    : new List<TocEntry>
      {
          new TocEntry
          {
              Level = 1,
              Title = "Tam Metin",
              PageStart = 1,
              PageEnd = int.MaxValue,
              Narrate = true
          }
      };
Console.WriteLine($"Bölüm sayısı: {toc.Count}");

// 2. Tüm sayfaları extract et (header/footer tespiti için)
var allPages = extractor.ExtractPages(pdfPath);
var allTexts = allPages.Select(p => p.Text).ToList();
var repeatedLines = detector.DetectRepeatedLines(allTexts);
Console.WriteLine($"Tekrar eden satır: {repeatedLines.Count}");

// 3. Bölüm bazlı dosya üret
var manifest = manifestSvc.Load(manifestPath);
manifest.Book = slug;
manifest.Toc = toc;
manifest.Sections = new List<Section>();

for (int i = 0; i < toc.Count; i++)
{
    var entry = toc[i];
    var sectionId = $"section_{i + 1:D4}";
    var fileName = $"{i + 1:D3}_{Slugify(entry.Title)}.txt";
    var txtPath = Path.Combine(sectionsDir, fileName);

    var sectionPages = allPages
        .Where(p => p.PageNumber >= entry.PageStart
                 && p.PageNumber <= entry.PageEnd)
        .ToList();

    var rawText = string.Join("\n\n",
        sectionPages.Select(p =>
        {
            var t = extractor.RemovePageNumbers(p.Text);
            t = detector.RemoveRepeatedLines(t, repeatedLines);
            t = extractor.JoinBrokenLines(t);
            return extractor.FormatPageWithMarker(p.PageNumber, t);
        }));

    var fixedText = ocrFix.Apply(rawText);
    File.WriteAllText(txtPath, fixedText,
        System.Text.Encoding.UTF8);

    manifest.Sections.Add(new Section
    {
        Id = sectionId,
        Title = entry.Title,
        PageStart = entry.PageStart,
        PageEnd = entry.PageEnd,
        Status = "extracted",
        Narrate = entry.Narrate,
        TxtPath = txtPath
    });

    Console.WriteLine(
        $"  [{sectionId}] {entry.Title} " +
        $"(S.{entry.PageStart}-{entry.PageEnd}) " +
        $"→ {fileName}");
}

manifestSvc.Save(manifestPath, manifest);
Console.WriteLine($"\nManifest: {manifestPath}");
Console.WriteLine("EXTRACT TAMAMLANDI");

static string Slugify(string title)
{
    return System.Text.RegularExpressions.Regex
        .Replace(title.ToLowerInvariant(), @"[^a-z0-9]", "_")
        .Trim('_')[..Math.Min(30, title.Length)];
}

static string FindRepoRoot(string startPath)
{
    var dir = new DirectoryInfo(startPath);
    while (dir != null)
    {
        if (File.Exists(Path.Combine(dir.FullName, ".gitignore")))
            return dir.FullName;
        dir = dir.Parent;
    }
    throw new InvalidOperationException(
        "Repo kökü bulunamadı. .gitignore dosyası eksik olabilir.");
}
