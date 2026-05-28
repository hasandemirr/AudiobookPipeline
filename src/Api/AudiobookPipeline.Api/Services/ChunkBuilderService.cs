using AudiobookPipeline.Api.Config;
using AudiobookPipeline.TextProcessor.Core.Models;
using Microsoft.Extensions.Options;
using System.Text;

namespace AudiobookPipeline.Api.Services;

// Builds render chunks from a section's pages. Pure logic: given pages + a
// section id + a starting order index, returns ordered ChunkEntry[].
// Rules:
//   - Split text into sentences (sentence is atomic — never cut mid-sentence).
//   - Greedily pack sentences into chunks up to MaxChars (tunable).
//   - A single sentence longer than MaxChars is split at punctuation
//     (comma, then ; : — …, then quote, then whitespace) and flagged IsLong.
//   - PageStart/PageEnd are informational markers (where the chunk's text came
//     from in the PDF), not a packing constraint.
public class ChunkBuilderService
{
    private readonly int _maxChars;

    public ChunkBuilderService(IOptions<ChunkConfig> cfg)
    {
        _maxChars = cfg.Value.MaxChars > 0 ? cfg.Value.MaxChars : 280;
    }

    // A sentence tagged with the page it came from.
    private record Sentence(string Text, int Page);

    // Build chunks for one section. `startOrder` is the running book-wide order.
    // Returns the chunks; caller advances order by the returned count.
    public List<ChunkEntry> BuildForSection(
        string sectionId, List<PageContent> pages, int startOrder)
    {
        var sentences = new List<Sentence>();
        foreach (var page in pages)
        {
            foreach (var s in SplitSentences(page.Text ?? string.Empty))
            {
                var trimmed = s.Trim();
                if (trimmed.Length > 0)
                    sentences.Add(new Sentence(trimmed, page.PageNumber));
            }
        }

        var chunks = new List<ChunkEntry>();
        var order = startOrder;

        var buffer = new StringBuilder();
        var bufStartPage = 0;
        var bufEndPage = 0;

        void Flush()
        {
            if (buffer.Length == 0) return;
            var text = buffer.ToString().Trim();
            if (text.Length == 0) { buffer.Clear(); return; }
            chunks.Add(new ChunkEntry
            {
                Id = $"{sectionId}_{order:D5}",
                SectionId = sectionId,
                Order = order,
                Text = text,
                CharCount = text.Length,
                PageStart = bufStartPage,
                PageEnd = bufEndPage,
                Status = ChunkStatus.Pending,
                IsLong = false,
            });
            order++;
            buffer.Clear();
        }

        foreach (var sentence in sentences)
        {
            // Oversized single sentence -> split at punctuation, each part its
            // own IsLong chunk. Flush whatever is buffered first.
            if (sentence.Text.Length > _maxChars)
            {
                Flush();
                foreach (var part in SplitLongSentence(sentence.Text))
                {
                    var ptext = part.Trim();
                    if (ptext.Length == 0) continue;
                    chunks.Add(new ChunkEntry
                    {
                        Id = $"{sectionId}_{order:D5}",
                        SectionId = sectionId,
                        Order = order,
                        Text = ptext,
                        CharCount = ptext.Length,
                        PageStart = sentence.Page,
                        PageEnd = sentence.Page,
                        Status = ChunkStatus.Pending,
                        IsLong = true,
                    });
                    order++;
                }
                continue;
            }

            // Would adding this sentence exceed the limit? Flush and start fresh.
            var addedLen = buffer.Length == 0
                ? sentence.Text.Length
                : buffer.Length + 1 + sentence.Text.Length;
            if (buffer.Length > 0 && addedLen > _maxChars)
                Flush();

            if (buffer.Length == 0)
            {
                bufStartPage = sentence.Page;
                buffer.Append(sentence.Text);
            }
            else
            {
                buffer.Append(' ').Append(sentence.Text);
            }
            bufEndPage = sentence.Page;
        }
        Flush();

        return chunks;
    }

    // Sentence splitter: breaks on . ! ? followed by whitespace/end. Keeps the
    // terminator with the sentence. Simple by design (tuning can come later).
    private static IEnumerable<string> SplitSentences(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) yield break;

        var sb = new StringBuilder();
        for (int i = 0; i < text.Length; i++)
        {
            var c = text[i];
            sb.Append(c);
            if (c == '.' || c == '!' || c == '?')
            {
                // Look ahead: sentence ends if next is whitespace or end.
                var next = i + 1 < text.Length ? text[i + 1] : ' ';
                if (char.IsWhiteSpace(next) || i + 1 == text.Length)
                {
                    yield return sb.ToString();
                    sb.Clear();
                }
            }
        }
        if (sb.Length > 0) yield return sb.ToString();
    }

    // Split an oversized sentence at the best available boundary, packing parts
    // up to MaxChars. Boundary priority: comma, then ; : — …, then quote, then
    // whitespace. Falls back to a hard cut if no boundary exists.
    private IEnumerable<string> SplitLongSentence(string sentence)
    {
        var remaining = sentence.Trim();
        while (remaining.Length > _maxChars)
        {
            var window = remaining.Substring(0, _maxChars);
            int cut = BestBoundary(window);
            if (cut <= 0) cut = _maxChars; // hard cut as last resort
            yield return remaining.Substring(0, cut).Trim();
            remaining = remaining.Substring(cut).Trim();
        }
        if (remaining.Length > 0) yield return remaining;
    }

    // Find the last acceptable boundary within the window (highest priority
    // boundary that appears latest). Returns index AFTER the boundary char.
    private static int BestBoundary(string window)
    {
        char[][] tiers =
        {
            new[] { ',' },
            new[] { ';', ':', '—', '–' },
            new[] { '"', '”', '»', '«' },
        };
        foreach (var tier in tiers)
        {
            int best = -1;
            foreach (var ch in tier)
            {
                int idx = window.LastIndexOf(ch);
                if (idx > best) best = idx;
            }
            if (best > 0) return best + 1;
        }
        int ws = window.LastIndexOf(' ');
        return ws > 0 ? ws + 1 : -1;
    }
}
