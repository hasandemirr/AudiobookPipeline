namespace AudiobookPipeline.TextProcessor.Core.Services;

public class HeaderFooterDetector
{
    private readonly int _minRepeatCount;
    private readonly int _scanLines;

    public HeaderFooterDetector(
        int minRepeatCount = 3,
        int scanLines = 3)
    {
        _minRepeatCount = minRepeatCount;
        _scanLines = scanLines;
    }

    public List<DetectedPatternDto> DetectPatterns(
        List<string> pageTexts)
    {
        var totalPages = pageTexts.Count;

        var firstLineCounts = new Dictionary<string, int>(
            StringComparer.OrdinalIgnoreCase);
        var lastLineCounts  = new Dictionary<string, int>(
            StringComparer.OrdinalIgnoreCase);
        var pageNumberCandidates = new Dictionary<int, int>();

        foreach (var pageText in pageTexts)
        {
            var lines = pageText
                .Split('\n')
                .Select(l => l.Trim())
                .Where(l => l.Length > 0)
                .ToList();

            if (lines.Count == 0) continue;

            // First N lines
            foreach (var line in lines.Take(_scanLines)
                .Distinct(StringComparer.OrdinalIgnoreCase))
            {
                firstLineCounts.TryGetValue(line, out int c);
                firstLineCounts[line] = c + 1;
            }

            // Last N lines
            foreach (var line in lines.TakeLast(_scanLines)
                .Distinct(StringComparer.OrdinalIgnoreCase))
            {
                lastLineCounts.TryGetValue(line, out int c);
                lastLineCounts[line] = c + 1;
            }

            // Page number candidates (standalone digits)
            foreach (var line in
                lines.Take(_scanLines)
                .Concat(lines.TakeLast(_scanLines)))
            {
                var trimmed = line.Trim();
                if (int.TryParse(trimmed, out int num)
                    && num > 0 && num < 9999)
                {
                    pageNumberCandidates.TryGetValue(
                        num, out int cnt);
                    pageNumberCandidates[num] = cnt + 1;
                }
            }
        }

        // Detect sequential page numbers
        var pageNums = DetectSequentialNumbers(
            pageNumberCandidates);

        var patterns = new List<DetectedPatternDto>();

        // First line patterns
        foreach (var kv in firstLineCounts
            .Where(x => x.Value >= _minRepeatCount))
        {
            var isPageNum = pageNums.Contains(
                kv.Key.Trim());
            patterns.Add(new DetectedPatternDto
            {
                Text       = kv.Key,
                Position   = "first",
                PageCount  = kv.Value,
                TotalPages = totalPages,
                IsPageNumber = isPageNum,
                Confidence = CalcConfidence(
                    kv.Value, totalPages),
                IsCheckedByDefault = CalcConfidence(
                    kv.Value, totalPages) == "high",
            });
        }

        // Last line patterns
        foreach (var kv in lastLineCounts
            .Where(x => x.Value >= _minRepeatCount))
        {
            // Skip if already in first patterns
            var exists = patterns.Any(p =>
                p.Text.Equals(kv.Key,
                    StringComparison.OrdinalIgnoreCase)
                && p.Position == "last");
            if (exists) continue;

            var isPageNum = pageNums.Contains(
                kv.Key.Trim());
            patterns.Add(new DetectedPatternDto
            {
                Text       = kv.Key,
                Position   = "last",
                PageCount  = kv.Value,
                TotalPages = totalPages,
                IsPageNumber = isPageNum,
                Confidence = CalcConfidence(
                    kv.Value, totalPages),
                IsCheckedByDefault = CalcConfidence(
                    kv.Value, totalPages) == "high",
            });
        }

        // Page numbers as patterns
        foreach (var num in pageNums)
        {
            var alreadyAdded = patterns.Any(p =>
                p.Text.Equals(num,
                    StringComparison.OrdinalIgnoreCase));
            if (alreadyAdded) continue;

            patterns.Add(new DetectedPatternDto
            {
                Text       = num,
                Position   = "last",
                PageCount  = 1,
                TotalPages = totalPages,
                IsPageNumber = true,
                Confidence = "high",
                IsCheckedByDefault = true,
            });
        }

        return patterns
            .OrderByDescending(p => p.PageCount)
            .ToList();
    }

    // Keep for backward compat
    public HashSet<string> DetectRepeatedLines(
        List<string> pageTexts)
    {
        var patterns = DetectPatterns(pageTexts);
        return new HashSet<string>(
            patterns.Select(p => p.Text),
            StringComparer.OrdinalIgnoreCase);
    }

    public string RemoveRepeatedLines(
        string pageText,
        HashSet<string> repeatedLines)
    {
        var lines = pageText.Split('\n')
            .Where(l => !repeatedLines.Contains(l.Trim()));
        return string.Join("\n", lines);
    }

    private static HashSet<string> DetectSequentialNumbers(
        Dictionary<int, int> candidates)
    {
        var nums = candidates.Keys
            .OrderBy(n => n)
            .ToList();
        var sequential = new HashSet<string>();

        for (int i = 0; i < nums.Count - 1; i++)
        {
            if (nums[i + 1] - nums[i] == 1)
            {
                sequential.Add(nums[i].ToString());
                sequential.Add(nums[i + 1].ToString());
            }
        }

        return sequential;
    }

    private static string CalcConfidence(
        int count, int total)
    {
        if (total == 0) return "low";
        var ratio = (double)count / total;
        return ratio >= 0.8 ? "high"
             : ratio >= 0.4 ? "medium"
             : "low";
    }
}

public class DetectedPatternDto
{
    public string Text       { get; set; } = string.Empty;
    public string Position   { get; set; } = string.Empty;
    public int    PageCount  { get; set; }
    public int    TotalPages { get; set; }
    public string Confidence { get; set; } = string.Empty;
    public bool   IsPageNumber       { get; set; }
    public bool   IsCheckedByDefault { get; set; }
}
