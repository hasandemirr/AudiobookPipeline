using UglyToad.PdfPig;
using UglyToad.PdfPig.Outline;
using AudiobookPipeline.TextProcessor.Core.Models;

namespace AudiobookPipeline.TextProcessor.Core.Services;

public class TocParserService
{
    private static readonly HashSet<string> SkipTitles = new(
        StringComparer.OrdinalIgnoreCase)
    {
        "dizin", "index", "kaynakça", "bibliyografya",
        "içindekiler", "künye", "telif", "teşekkür"
    };

    public List<TocEntry> Parse(string pdfPath)
    {
        var entries = new List<TocEntry>();

        using var doc = PdfDocument.Open(pdfPath);
        
        if (!doc.TryGetBookmarks(out var bookmarks))
            return entries;

        foreach (var node in bookmarks.Roots)
            ProcessNode(node, 1, entries, doc.NumberOfPages);

        // PageEnd hesapla
        for (int i = 0; i < entries.Count - 1; i++)
            entries[i].PageEnd = entries[i + 1].PageStart - 1;

        if (entries.Count > 0)
            entries[^1].PageEnd = doc.NumberOfPages;

        return entries;
    }

    private void ProcessNode(BookmarkNode node, int level,
        List<TocEntry> entries, int totalPages)
    {
        if (node is DocumentBookmarkNode docNode)
        {
            var entry = new TocEntry
            {
                Level = level,
                Title = docNode.Title,
                PageStart = docNode.PageNumber,
                Narrate = !SkipTitles.Contains(
                    docNode.Title.Trim().ToLowerInvariant())
            };
            entries.Add(entry);
        }

        foreach (var child in node.Children)
            ProcessNode(child, level + 1, entries, totalPages);
    }

    public bool HasToc(string pdfPath)
    {
        using var doc = PdfDocument.Open(pdfPath);
        return doc.TryGetBookmarks(out _);
    }
}
