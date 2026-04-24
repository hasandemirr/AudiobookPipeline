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
        // Kelimeleri Y pozisyonuna göre satırlara grupla
        var words = page.GetWords().ToList();
        if (!words.Any()) return string.Empty;

        var lineGroups = words
            .GroupBy(w => Math.Round(w.BoundingBox.Bottom, 0))
            .OrderByDescending(g => g.Key);

        var lines = lineGroups
            .Select(g => string.Join(" ",
                g.OrderBy(w => w.BoundingBox.Left)
                 .Select(w => w.Text)));

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

    public string JoinBrokenLines(string text)
    {
        var lines = text.Split('\n');
        var result = new System.Text.StringBuilder();
        
        for (int i = 0; i < lines.Length; i++)
        {
            var line = lines[i].TrimEnd();
            
            // Boş satır — paragraf sonu, koru
            if (string.IsNullOrWhiteSpace(line))
            {
                result.AppendLine();
                continue;
            }
            
            // Son satırsa direkt ekle
            if (i == lines.Length - 1)
            {
                result.Append(line);
                break;
            }
            
            var nextLine = lines[i + 1].TrimStart();
            bool nextIsEmpty = string.IsNullOrWhiteSpace(nextLine);
            
            // Durum 1: Tire ile bölünmüş kelime
            // "ol-" + "muştur" → "olmuştur"
            if (line.EndsWith("-") && !nextIsEmpty)
            {
                result.Append(line[..^1]); // tireyi kaldır
                // sonraki satırı birleştir, döngü devam eder
                continue;
            }
            
            // Durum 2: Paragraf sonu — nokta/soru/ünlem + boş satır
            // Olduğu gibi bırak
            if (nextIsEmpty)
            {
                result.AppendLine(line);
                continue;
            }
            
            // Durum 3: Cümle sonu — nokta/soru/ünlem ile bitiyor
            // Paragraf devam ediyor olabilir, boşlukla birleştir
            var sentenceEnders = new[] { '.', '?', '!', ':', ';', '"', '”', '»' };
            if (sentenceEnders.Contains(line[^1]))
            {
                result.AppendLine(line);
                continue;
            }
            
            // Durum 4: Satır ortası kırık — boşlukla birleştir
            result.Append(line + " ");
        }
        
        return result.ToString().TrimEnd();
    }

    public string FormatPageWithMarker(int pageNumber, string text)
    {
        return $"=== SAYFA {pageNumber} ===\n{text}";
    }
}
