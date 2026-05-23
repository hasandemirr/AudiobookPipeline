using AudiobookPipeline.Api.Hubs;
using AudiobookPipeline.Api.Services;
using AudiobookPipeline.TextProcessor.Core.Models;
using AudiobookPipeline.TextProcessor.Core.Services;
using Microsoft.AspNetCore.SignalR;
using AudiobookPipeline.Api.Config;

namespace AudiobookPipeline.Api.Jobs;

public class ExtractJob : IJob
{
    private readonly string _slug;
    private readonly string _pdfPath;
    private readonly PathService _paths;
    private readonly ManifestService _svc;
    private readonly IHubContext<ProgressHub> _hub;
    private readonly TocParserService _tocParser;
    private readonly PdfExtractService _extractor;
    private readonly HeaderFooterDetector _detector;
    private readonly OcrFixService _ocrFix;
    private readonly ExtractConfig _extractConfig;

    public ExtractJob(
        string slug,
        string pdfPath,
        PathService paths,
        ManifestService svc,
        IHubContext<ProgressHub> hub,
        TocParserService tocParser,
        PdfExtractService extractor,
        HeaderFooterDetector detector,
        OcrFixService ocrFix,
        ExtractConfig extractConfig)
    {
        _slug          = slug;
        _pdfPath       = pdfPath;
        _paths         = paths;
        _svc           = svc;
        _hub           = hub;
        _tocParser     = tocParser;
        _extractor     = extractor;
        _detector      = detector;
        _ocrFix        = ocrFix;
        _extractConfig = extractConfig;
    }

    public async Task ExecuteAsync(CancellationToken cancellationToken)
    {
        var manifestPath = _paths.ManifestPath(_slug);

        async Task Notify(string message, int percent,
            bool done = false, bool error = false) =>
            await _hub.Clients.All.SendAsync("ExtractProgress",
                new { slug = _slug, message, percent, done, error }, cancellationToken);

        try
        {
            _svc.Lock(manifestPath, "extract");
            await Notify("Extract started...", 0);

            var sectionsDir = _paths.SectionsDir(_slug);
            Directory.CreateDirectory(sectionsDir);

            await Notify("Reading TOC...", 5);

            var toc = _tocParser.HasToc(_pdfPath)
                ? _tocParser.Parse(_pdfPath)
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

            var allPages  = _extractor.ExtractPages(_pdfPath);
            var allTexts  = allPages.Select(p => p.Text).ToList();
            
            var detectedPatterns = _detector.DetectPatterns(allTexts);

            var manifest  = _svc.Load(manifestPath);
            manifest.Book = _slug;
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
                            var t = _extractor.RemovePageNumbers(p.Text);
                            t = _extractor.StripEmbeddedPageNumbers(t);
                            t = _extractor.JoinBrokenLines(t);
                            return _extractor.FormatPageWithMarker(
                                p.PageNumber, t);
                        }));

                File.WriteAllText(txtPath, _ocrFix.Apply(text),
                    System.Text.Encoding.UTF8);

                manifest.Sections.Add(new Section
                {
                    Id        = sectionId,
                    Title     = entry.Title,
                    PageStart = entry.PageStart,
                    PageEnd   = entry.PageEnd,
                    Status    = "extracted",
                    Narrate   = entry.Narrate,
                    TxtPath   = _paths.ToRelative(txtPath)
                });

                var pct = 10 + (int)((i + 1.0) / toc.Count * 85);
                await Notify(
                    $"[{i + 1}/{toc.Count}] {entry.Title}", pct);
            }

            _svc.Save(manifestPath, manifest);
            _svc.Unlock(manifestPath);
            await Notify("Completed.", 100, done: true);
        }
        catch (Exception ex)
        {
            _svc.Unlock(manifestPath);
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
