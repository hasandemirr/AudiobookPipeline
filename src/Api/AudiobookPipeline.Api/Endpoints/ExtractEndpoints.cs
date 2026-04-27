using AudiobookPipeline.Api.Hubs;
using AudiobookPipeline.Api.Services;
using AudiobookPipeline.TextProcessor.Core.Models;
using AudiobookPipeline.TextProcessor.Core.Services;
using Microsoft.AspNetCore.SignalR;

namespace AudiobookPipeline.Api.Endpoints;

public static class ExtractEndpoints
{
    public static void Map(WebApplication app)
    {
        app.MapPost("/api/books/extract", Extract);
    }

    private static async Task<IResult> Extract(
        HttpRequest request,
        PathService paths,
        ManifestService svc,
        IHubContext<ProgressHub> hub,
        IConfiguration config)
    {
        if (!request.HasFormContentType)
            return Results.BadRequest(
                new { message = "Form data required." });

        var form = await request.ReadFormAsync();
        var slug = form["slug"].ToString();
        var file = form.Files.GetFile("pdf");

        if (string.IsNullOrWhiteSpace(slug))
            return Results.BadRequest(
                new { message = "slug is required." });

        if (file is null || file.Length == 0)
            return Results.BadRequest(
                new { message = "PDF file is required." });

        // Conflict check
        if (paths.ManifestExists(slug))
        {
            if (svc.IsLocked(paths.ManifestPath(slug)))
                return Results.Conflict(new
                {
                    message = $"{slug} is currently being processed.",
                    isLocked = true
                });

            if (form["force"].ToString() != "true")
                return Results.Conflict(new
                {
                    message = $"{slug} already exists. Send force=true to overwrite.",
                    isLocked = false,
                    exists = true
                });
        }

        // Save PDF
        Directory.CreateDirectory(paths.PdfDir);
        var pdfPath = Path.Combine(paths.PdfDir, file.FileName);
        using (var stream = File.Create(pdfPath))
            await file.CopyToAsync(stream);

        // Run extract in background
        _ = Task.Run(() => RunExtract(
            slug, pdfPath, paths, svc, hub, config));

        return Results.Accepted(null, new
        {
            message = "Extract started.",
            slug
        });
    }

    private static async Task RunExtract(
        string slug,
        string pdfPath,
        PathService paths,
        ManifestService svc,
        IHubContext<ProgressHub> hub,
        IConfiguration config)
    {
        var manifestPath = paths.ManifestPath(slug);

        async Task Notify(string message, int percent,
            bool done = false, bool error = false) =>
            await hub.Clients.All.SendAsync("ExtractProgress",
                new { slug, message, percent, done, error });

        try
        {
            svc.Lock(manifestPath, "extract");
            await Notify("Extract started...", 0);

            var sectionsDir = paths.SectionsDir(slug);
            Directory.CreateDirectory(sectionsDir);

            var tocParser = new TocParserService();
            var extractor = new PdfExtractService();
            
            var minRepeat = config.GetValue<int>("Extract:HeaderFooterMinRepeatCount", 3);
            var scanLines = config.GetValue<int>("Extract:HeaderFooterScanLines", 3);
            var detector  = new HeaderFooterDetector(
                minRepeatCount: minRepeat,
                scanLines: scanLines);
            var ocrFix    = new OcrFixService(paths.OcrRulesPath);

            await Notify("Reading TOC...", 5);

            var toc = tocParser.HasToc(pdfPath)
                ? tocParser.Parse(pdfPath)
                : new List<TocEntry>
                  {
                      new() {
                          Level = 1, Title = "Full Text",
                          PageStart = 1,
                          PageEnd = int.MaxValue,
                          Narrate = true
                      }
                  };

            await Notify("Extracting pages...", 10);

            var allPages  = extractor.ExtractPages(pdfPath);
            var allTexts  = allPages.Select(p => p.Text).ToList();
            
            var detectedPatterns = detector.DetectPatterns(allTexts);

            var manifest  = svc.Load(manifestPath);
            manifest.Book = slug;
            manifest.Toc  = toc;
            manifest.Sections = new List<Section>();

            manifest.RepeatedLines = detectedPatterns
                .Select(p => p.Text)
                .ToList();

            manifest.DetectedPatterns = detectedPatterns
                .Select(p => new DetectedPattern
                {
                    Text               = p.Text,
                    Position           = p.Position,
                    PageCount          = p.PageCount,
                    TotalPages         = p.TotalPages,
                    Confidence         = p.Confidence,
                    IsPageNumber       = p.IsPageNumber,
                    IsCheckedByDefault = p.IsCheckedByDefault,
                })
                .ToList();

            for (int i = 0; i < toc.Count; i++)
            {
                var entry     = toc[i];
                var sectionId = $"section_{i + 1:D4}";
                var fileName  = $"{i + 1:D3}_{Slugify(entry.Title)}.txt";
                var txtPath   = Path.Combine(sectionsDir, fileName);

                var text = string.Join("\n\n",
                    allPages
                        .Where(p => p.PageNumber >= entry.PageStart
                                 && p.PageNumber <= entry.PageEnd)
                        .Select(p =>
                        {
                            var t = extractor.RemovePageNumbers(p.Text);
                            t = extractor.StripEmbeddedPageNumbers(t);
                            t = extractor.JoinBrokenLines(t);
                            return extractor.FormatPageWithMarker(
                                p.PageNumber, t);
                        }));

                File.WriteAllText(txtPath, ocrFix.Apply(text),
                    System.Text.Encoding.UTF8);

                manifest.Sections.Add(new Section
                {
                    Id        = sectionId,
                    Title     = entry.Title,
                    PageStart = entry.PageStart,
                    PageEnd   = entry.PageEnd,
                    Status    = "extracted",
                    Narrate   = entry.Narrate,
                    TxtPath   = paths.ToRelative(txtPath)
                });

                var pct = 10 + (int)((i + 1.0) / toc.Count * 85);
                await Notify(
                    $"[{i + 1}/{toc.Count}] {entry.Title}", pct);
            }

            svc.Save(manifestPath, manifest);
            svc.Unlock(manifestPath);
            await Notify("Completed.", 100, done: true);
        }
        catch (Exception ex)
        {
            svc.Unlock(manifestPath);
            await Notify(ex.Message, -1, error: true);
        }
    }

    private static string Slugify(string title)
    {
        var slug = System.Text.RegularExpressions.Regex
            .Replace(title.ToLowerInvariant(), @"[^a-z0-9]", "_")
            .Trim('_');
        
        return slug[..Math.Min(30, slug.Length)];
    }
}
