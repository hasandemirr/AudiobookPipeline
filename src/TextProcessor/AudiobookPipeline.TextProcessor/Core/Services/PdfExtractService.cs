using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;
using AudiobookPipeline.TextProcessor.Core.Models;

namespace AudiobookPipeline.TextProcessor.Core.Services;

public class PdfExtractService
{
    public List<(int PageNumber, string Text)> ExtractPages(
        string pdfPath, int pageStart = 1, int pageEnd = int.MaxValue)
    {
        var pages = new List<(int, string)>();

        using var doc = PdfDocument.Open(pdfPath);
        int end = Math.Min(pageEnd, doc.NumberOfPages);

        for (int i = pageStart; i <= end; i++)
        {
            var page = doc.GetPage(i);
            var text = ExtractPageText(page);
            if (!string.IsNullOrWhiteSpace(text))
                pages.Add((i, text));
        }

        return pages;
    }

    private string ExtractPageText(Page page)
    {
        var words = page.GetWords().ToList();
        if (!words.Any()) return string.Empty;

        var lineGroups = words
            .GroupBy(w => Math.Round(w.BoundingBox.Bottom, 0))
            .OrderByDescending(g => g.Key);

        var lines = new List<string>();
        foreach (var g in lineGroups)
        {
            var ordered   = g.OrderBy(w => w.BoundingBox.Left).ToList();
            var digits    = ordered.Where(w =>
                System.Text.RegularExpressions.Regex
                    .IsMatch(w.Text.Trim(), @"^\d{1,4}$")).ToList();
            var nonDigits = ordered.Except(digits).ToList();

            if (digits.Any() && nonDigits.Any())
            {
                lines.Add(string.Join(" ", digits.Select(w => w.Text)));
                lines.Add(string.Join(" ", nonDigits.Select(w => w.Text)));
            }
            else
            {
                lines.Add(string.Join(" ", ordered.Select(w => w.Text)));
            }
        }
        return string.Join("\n", lines);
    }

    public bool IsPageNumber(string line)
    {
        return System.Text.RegularExpressions.Regex.IsMatch(
            line.Trim(), @"^\d{1,4}$");
    }

    public string RemovePageNumbers(string text)
    {
        var lines = text.Split('\n');
        var filtered = lines.Where(l => !IsPageNumber(l));
        return string.Join("\n", filtered);
    }

    public string StripEmbeddedPageNumbers(string text)
    {
        // Remove isolated 1-4 digit numbers at end of a line
        // preceded by whitespace: e.g. "kaybolmu\u015Ftu ve 30"
        var result = System.Text.RegularExpressions.Regex
            .Replace(text, @"(?m)[ \t]+\d{1,4}[ \t]*$", "");
        // Remove isolated 1-4 digit numbers at start of a line
        // followed by whitespace: e.g. "30 noidel \u00E7al\u0131lar\u0131"
        result = System.Text.RegularExpressions.Regex
            .Replace(result, @"(?m)^[ \t]*\d{1,4}[ \t]+", "");
        return result;
    }

    public string JoinBrokenLines(string text)
    {
        var lines = text.Split('\n');
        var result = new System.Text.StringBuilder();
        
        for (int i = 0; i < lines.Length; i++)
        {
            var line = lines[i].TrimEnd();
            
            // Bo\u015F sat\u0131r \u2014 paragraf sonu, koru
            if (string.IsNullOrWhiteSpace(line))
            {
                result.AppendLine();
                continue;
            }
            
            // Son sat\u0131rsa direkt ekle
            if (i == lines.Length - 1)
            {
                result.Append(line);
                break;
            }
            
            var nextLine = lines[i + 1].TrimStart();
            bool nextIsEmpty = string.IsNullOrWhiteSpace(nextLine);

            // Durum 0a: Mevcut sat\u0131r k\u0131sa b\u00FCy\u00FCk harf header (HOMEROS, \u0130LYADA vb.)
            // Kesinlikle tek sat\u0131r olarak koru, birle\u015Ftirme
            if (IsShortUpperCase(line))
            {
                result.AppendLine(line);
                continue;
            }

            // Durum 0b: Sonraki sat\u0131r k\u0131sa b\u00FCy\u00FCk harf header ise
            // mevcut sat\u0131r\u0131 ona yap\u0131\u015Ft\u0131rma, kendi ba\u015F\u0131na b\u0131rak
            if (!nextIsEmpty && IsShortUpperCase(nextLine))
            {
                result.AppendLine(line);
                continue;
            }
            
            // Durum 1: Tire ile b\u00F6l\u00FCnm\u00FC\u015F kelime
            // "ol-" + "mu\u015Ftur" \u2192 "olmu\u015Ftur"
            if (line.EndsWith("-") && !nextIsEmpty)
            {
                result.Append(line[..^1]); // tireyi kald\u0131r
                // sonraki sat\u0131r\u0131 birle\u015Ftir, d\u00F6ng\u00FC devam eder
                continue;
            }
            
            // Durum 2: Paragraf sonu \u2014 nokta/soru/\u00FCnlem + bo\u015F sat\u0131r
            // Oldu\u011Fu gibi b\u0131rak
            if (nextIsEmpty)
            {
                result.AppendLine(line);
                continue;
            }
            
            // Durum 3: C\u00FCmle sonu \u2014 nokta/soru/\u00FCnlem ile bitiyor
            // Paragraf devam ediyor olabilir, bo\u015Flukla birle\u015Ftir
            var sentenceEnders = new[] { '.', '?', '!', ':', ';', '"', '\u201D', '\u00BB' };
            if (sentenceEnders.Contains(line[^1]))
            {
                result.AppendLine(line);
                continue;
            }
            
            // Durum 4: Sat\u0131r ortas\u0131 k\u0131r\u0131k \u2014 bo\u015Flukla birle\u015Ftir
            result.Append(line + " ");
        }
        
        return result.ToString().TrimEnd();
    }

    private static bool IsShortUpperCase(string line)
    {
        var trimmed = line.Trim();
        return trimmed.Length > 1
            && trimmed.Length < 30
            && trimmed == trimmed.ToUpperInvariant();
    }

    public string FormatPageWithMarker(int pageNumber, string text)
    {
        return $"=== SAYFA {pageNumber} ===\n{text}";
    }
}
