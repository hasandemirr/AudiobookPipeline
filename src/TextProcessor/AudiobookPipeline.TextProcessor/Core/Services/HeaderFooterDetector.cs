namespace AudiobookPipeline.TextProcessor.Core.Services;

public class HeaderFooterDetector
{
    private readonly int _minRepeatCount;

    public HeaderFooterDetector(int minRepeatCount = 3)
    {
        _minRepeatCount = minRepeatCount;
    }

    // Tüm sayfa metinlerini ver, tekrar eden satırları bul
    public HashSet<string> DetectRepeatedLines(
        List<string> pageTexts)
    {
        var lineCounts = new Dictionary<string, int>(
            StringComparer.OrdinalIgnoreCase);

        foreach (var pageText in pageTexts)
        {
            var lines = pageText.Split('\n')
                .Select(l => l.Trim())
                .Where(l => l.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase);

            foreach (var line in lines)
            {
                lineCounts.TryGetValue(line, out int count);
                lineCounts[line] = count + 1;
            }
        }

        return lineCounts
            .Where(kv => kv.Value >= _minRepeatCount)
            .Select(kv => kv.Key)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    public string RemoveRepeatedLines(string pageText,
        HashSet<string> repeatedLines)
    {
        var lines = pageText.Split('\n')
            .Where(l => !repeatedLines.Contains(l.Trim()));
        return string.Join("\n", lines);
    }
}
