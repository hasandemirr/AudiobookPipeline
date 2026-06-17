using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using System.IO;
using System.Threading.Tasks;
using System.Collections.Generic;
using System;
using AudiobookPipeline.Api.Services;
using AudiobookPipeline.TextProcessor.Core.Services;
using AudiobookPipeline.TextProcessor.Core.Models;
using AudiobookPipeline.Api.Jobs;
using Microsoft.AspNetCore.SignalR;
using AudiobookPipeline.Api.Hubs;

namespace AudiobookPipeline.Api.Endpoints;

public static class AudiobookEndpoints
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/api/audiobooks", ListAudiobooks);
        app.MapGet("/api/audiobooks/{slug}", GetAudiobook);
        app.MapPost("/api/audiobooks/{slug}/render", StartRender);
        app.MapPut("/api/audiobooks/{slug}/chunks/{id}", UpdateChunk);
        app.MapPost("/api/audiobooks/{slug}/chunks/{id}/split", SplitChunk);
        app.MapPost("/api/audiobooks/{slug}/chunks/{id}/merge-next", MergeNextChunk);
        app.MapPost("/api/audiobooks/{slug}/chunks/{id}/add-after", AddChunkAfter);
        app.MapDelete("/api/audiobooks/{slug}/chunks/{id}", DeleteChunk);
        app.MapDelete("/api/audiobooks/{slug}", DeleteAudiobook);
        app.MapPost("/api/audiobooks/from-book", CreateFromBook);
        app.MapPost("/api/audiobooks/from-text", CreateFromText);
    }

    private static IResult ListAudiobooks(AudiobookService audiobooks)
        => Results.Ok(audiobooks.List());

    private static IResult GetAudiobook(
        string slug, AudiobookService audiobooks)
    {
        if (!audiobooks.Exists(slug))
            return Results.NotFound(new { message = $"{slug} not found." });

        var manifest = audiobooks.LoadManifest(slug);
        var chunks = audiobooks.LoadChunks(slug);
        return Results.Ok(new { manifest, chunks });
    }

    private static async Task<IResult> StartRender(
        string slug,
        AudiobookService audiobooks,
        IHttpClientFactory httpFactory,
        PathService paths,
        AudiobookPipeline.Api.Jobs.BackgroundTaskQueue queue,
        IHubContext<ProgressHub> hub)
    {
        if (!audiobooks.Exists(slug))
            return Results.NotFound();

        var manifest = audiobooks.LoadManifest(slug);
        if (manifest.RenderStatus == "rendering")
            return Results.Conflict(new { message = "Render already in progress." });

        var job = new AudiobookPipeline.Api.Jobs.AudiobookRenderJob(slug, audiobooks, httpFactory, paths, hub);
        await queue.EnqueueAsync(job);

        return Results.Accepted(null, new { message = "Render started.", slug });
    }

    // Update a single chunk's text. Recompute char_count. If the chunk was
    // already rendered (Done), editing invalidates its audio → Stale.
    private static async Task<IResult> UpdateChunk(
        string slug, string id,
        HttpRequest request,
        AudiobookService audiobooks)
    {
        if (!audiobooks.Exists(slug))
            return Results.NotFound(new { message = $"{slug} not found." });

        var body = await new StreamReader(request.Body).ReadToEndAsync();
        UpdateChunkBody? parsed;
        try
        {
            parsed = System.Text.Json.JsonSerializer.Deserialize<UpdateChunkBody>(
                body, JsonOpts);
        }
        catch (System.Text.Json.JsonException)
        {
            return Results.BadRequest(new { message = "Invalid payload." });
        }
        if (parsed?.Text is null)
            return Results.BadRequest(new { message = "text required." });

        var newText = parsed.Text;
        var found = false;
        ChunkEntry? updated = null;

        await audiobooks.UpdateChunksAsync(slug, chunks =>
        {
            var chunk = chunks.FirstOrDefault(c => c.Id == id);
            if (chunk is null) return Task.CompletedTask;
            found = true;
            chunk.Text = newText;
            chunk.CharCount = newText.Length;
            // Done audio no longer matches edited text → mark Stale.
            if (chunk.Status == ChunkStatus.Done)
                chunk.Status = ChunkStatus.Stale;
            updated = chunk;
            return Task.CompletedTask;
        });

        if (!found)
            return Results.NotFound(new { message = $"chunk {id} not found." });

        return Results.Ok(new
        {
            id = updated!.Id,
            char_count = updated.CharCount,
            status = updated.Status.ToString().ToLowerInvariant(),
        });
    }

    private static async Task<IResult> SplitChunk(
        string slug, string id,
        HttpRequest request,
        AudiobookService audiobooks,
        PathService paths)
    {
        if (!audiobooks.Exists(slug))
            return Results.NotFound();

        var body = await new StreamReader(request.Body).ReadToEndAsync();
        SplitChunkBody? parsed;
        try
        {
            parsed = System.Text.Json.JsonSerializer.Deserialize<SplitChunkBody>(body, JsonOpts);
        }
        catch (System.Text.Json.JsonException)
        {
            return Results.BadRequest(new { message = "Invalid payload." });
        }

        if (parsed?.Text is null)
            return Results.BadRequest(new { message = "text required." });

        var text = parsed.Text.Trim();
        var pos = parsed.Position;

        if (pos <= 0 || pos >= text.Length)
            return Results.BadRequest(new { message = "Split position must be inside the text." });

        var text1 = text[..pos].Trim();
        var text2 = text[pos..].Trim();

        if (string.IsNullOrEmpty(text1) || string.IsNullOrEmpty(text2))
            return Results.BadRequest(new { message = "Split position must be inside the text." });

        var chunks = audiobooks.LoadChunks(slug);
        var parent = chunks.FirstOrDefault(c => c.Id == id);
        if (parent is null)
            return Results.NotFound(new { message = $"chunk {id} not found." });

        string? audioFileToDelete = null;
        if (!string.IsNullOrEmpty(parent.AudioPath))
        {
            audioFileToDelete = Path.Combine(paths.AudiobookAudioDir(slug), $"{id}.wav");
        }

        var newId = "";
        var parentOrder = 0;

        await audiobooks.UpdateChunksAsync(slug, list =>
        {
            var p = list.FirstOrDefault(c => c.Id == id);
            if (p is null) return Task.CompletedTask;

            parentOrder = p.Order;

            // Generate new id (max+1, same section):
            var maxIdNum = list
                .Where(c => c.SectionId == p.SectionId)
                .Select(c =>
                {
                    var lastUnderscore = c.Id.LastIndexOf('_');
                    if (lastUnderscore >= 0 && int.TryParse(c.Id[(lastUnderscore + 1)..], out var parsedNum))
                        return parsedNum;
                    return -1;
                })
                .DefaultIfEmpty(-1)
                .Max();

            newId = $"{p.SectionId}_{(maxIdNum + 1):D5}";

            // Order shift:
            foreach (var c in list)
            {
                if (c.Order > parentOrder)
                    c.Order++;
            }

            // Piece 1 (parent):
            p.Text = text1;
            p.CharCount = text1.Length;
            p.Status = ChunkStatus.Pending;
            p.AudioPath = null;
            p.AudioDurationSec = null;
            p.SubtitleStartMs = null;
            p.SubtitleEndMs = null;
            p.IsLong = false;
            p.Retries = 0;

            // Piece 2 (new):
            var piece2 = new ChunkEntry
            {
                Id = newId,
                SectionId = p.SectionId,
                SectionTitle = p.SectionTitle,
                Order = parentOrder + 1,
                Text = text2,
                CharCount = text2.Length,
                PageStart = p.PageStart,
                PageEnd = p.PageEnd,
                Status = ChunkStatus.Pending,
                IsLong = false,
                Retries = 0
            };
            list.Add(piece2);

            list.Sort((a, b) => a.Order.CompareTo(b.Order));

            return Task.CompletedTask;
        });

        // Delete old audio:
        if (audioFileToDelete != null && File.Exists(audioFileToDelete))
        {
            try
            {
                File.Delete(audioFileToDelete);
            }
            catch
            {
                // ignore
            }
        }

        return Results.Ok(new { message = "Chunk split.", new_chunk_id = newId, order = parentOrder });
    }

    private static async Task<IResult> MergeNextChunk(
        string slug,
        string id,
        AudiobookService audiobooks,
        PathService paths,
        Microsoft.Extensions.Options.IOptions<AudiobookPipeline.Api.Config.ChunkConfig> chunkConfig)
    {
        if (!audiobooks.Exists(slug))
            return Results.NotFound();

        var maxChars = chunkConfig.Value.MaxChars > 0 ? chunkConfig.Value.MaxChars : 280;

        var chunks = audiobooks.LoadChunks(slug);
        var parent = chunks.FirstOrDefault(c => c.Id == id);
        if (parent is null)
            return Results.NotFound(new { message = $"chunk {id} not found." });

        var next = chunks.FirstOrDefault(c => c.Order == parent.Order + 1);
        if (next == null || next.SectionId != parent.SectionId)
            return Results.BadRequest(new { message = "No adjacent chunk in the same section to merge." });

        var mergedText = (parent.Text + " " + next.Text).Trim();
        if (mergedText.Length > maxChars)
            return Results.BadRequest(new { message = $"Merge would exceed the {maxChars} character limit." });

        var parentAudioPath = Path.Combine(paths.AudiobookAudioDir(slug), $"{parent.Id}.wav");
        var nextAudioPath = Path.Combine(paths.AudiobookAudioDir(slug), $"{next.Id}.wav");

        int? mergedStart = (parent.PageStart, next.PageStart) switch
        {
            (null, null) => null,
            (var x, null) => x,
            (null, var y) => y,
            (var x, var y) => Math.Min(x.Value, y.Value)
        };
        int? mergedEnd = (parent.PageEnd, next.PageEnd) switch
        {
            (null, null) => null,
            (var x, null) => x,
            (null, var y) => y,
            (var x, var y) => Math.Max(x.Value, y.Value)
        };

        await audiobooks.UpdateChunksAsync(slug, list =>
        {
            var p = list.FirstOrDefault(c => c.Id == id);
            var n = list.FirstOrDefault(c => c.Order == parent.Order + 1);
            if (p is null || n is null) return Task.CompletedTask;

            var removedOrder = n.Order;

            p.Text = mergedText;
            p.CharCount = mergedText.Length;
            p.Status = ChunkStatus.Pending;
            p.AudioPath = null;
            p.AudioDurationSec = null;
            p.SubtitleStartMs = null;
            p.SubtitleEndMs = null;
            p.IsLong = false;
            p.Retries = 0;
            p.PageStart = mergedStart;
            p.PageEnd = mergedEnd;

            list.Remove(n);

            foreach (var c in list)
            {
                if (c.Order > removedOrder)
                    c.Order--;
            }

            list.Sort((a, b) => a.Order.CompareTo(b.Order));

            return Task.CompletedTask;
        });

        // Delete audio files after saving
        foreach (var path in new[] { parentAudioPath, nextAudioPath })
        {
            if (File.Exists(path))
            {
                try
                {
                    File.Delete(path);
                }
                catch
                {
                    // ignore
                }
            }
        }

        return Results.Ok(new { message = "Chunks merged.", id = parent.Id });
    }

    private static async Task<IResult> AddChunkAfter(
        string slug,
        string id,
        AudiobookService audiobooks)
    {
        if (!audiobooks.Exists(slug))
            return Results.NotFound();

        var chunks = audiobooks.LoadChunks(slug);
        var parent = chunks.FirstOrDefault(c => c.Id == id);
        if (parent is null)
            return Results.NotFound(new { message = $"chunk {id} not found." });

        string newId = "";

        await audiobooks.UpdateChunksAsync(slug, list =>
        {
            var p = list.FirstOrDefault(c => c.Id == id);
            if (p is null) return Task.CompletedTask;

            var parentOrder = p.Order;

            // Generate max+1 ID for the same section:
            var maxIdNum = list
                .Where(c => c.SectionId == p.SectionId)
                .Select(c =>
                {
                    var lastUnderscore = c.Id.LastIndexOf('_');
                    if (lastUnderscore >= 0 && int.TryParse(c.Id[(lastUnderscore + 1)..], out var parsedNum))
                        return parsedNum;
                    return -1;
                })
                .DefaultIfEmpty(-1)
                .Max();

            newId = $"{p.SectionId}_{(maxIdNum + 1):D5}";

            // Shift subsequent chunks' orders:
            foreach (var c in list)
            {
                if (c.Order > parentOrder)
                    c.Order++;
            }

            // Create new chunk:
            var newChunk = new ChunkEntry
            {
                Id = newId,
                SectionId = p.SectionId,
                SectionTitle = p.SectionTitle,
                Order = parentOrder + 1,
                Text = "Yeni chunk...",
                CharCount = "Yeni chunk...".Length,
                PageStart = null,
                PageEnd = null,
                Status = ChunkStatus.Pending,
                IsLong = false,
                Retries = 0
            };
            list.Add(newChunk);

            list.Sort((a, b) => a.Order.CompareTo(b.Order));

            return Task.CompletedTask;
        });

        return Results.Ok(new { message = "Chunk added.", new_chunk_id = newId });
    }

    private static async Task<IResult> DeleteChunk(
        string slug,
        string id,
        AudiobookService audiobooks,
        PathService paths)
    {
        if (!audiobooks.Exists(slug))
            return Results.NotFound();

        var chunks = audiobooks.LoadChunks(slug);
        var chunk = chunks.FirstOrDefault(c => c.Id == id);
        if (chunk is null)
            return Results.NotFound(new { message = $"chunk {id} not found." });

        var wavPath = Path.Combine(paths.AudiobookAudioDir(slug), $"{id}.wav");

        await audiobooks.UpdateChunksAsync(slug, list =>
        {
            var target = list.FirstOrDefault(c => c.Id == id);
            if (target != null)
            {
                var removedOrder = target.Order;
                list.Remove(target);
                foreach (var c in list)
                {
                    if (c.Order > removedOrder)
                        c.Order--;
                }
                list.Sort((a, b) => a.Order.CompareTo(b.Order));
            }
            return Task.CompletedTask;
        });

        // Delete audio file if it exists:
        if (File.Exists(wavPath))
        {
            try
            {
                File.Delete(wavPath);
            }
            catch
            {
                // ignore
            }
        }

        return Results.Ok(new { message = "Chunk deleted.", id });
    }

    private static IResult DeleteAudiobook(
        string slug,
        AudiobookService audiobooks,
        PathService paths)
    {
        if (!audiobooks.Exists(slug))
            return Results.NotFound(new { message = $"{slug} not found." });

        var manifest = audiobooks.LoadManifest(slug);
        if (manifest.RenderStatus == "rendering")
            return Results.Conflict(new { message = "Audiobook is currently rendering." });

        var dir = paths.AudiobookDir(slug);
        try
        {
            if (Directory.Exists(dir))
                Directory.Delete(dir, recursive: true);
            return Results.Ok(new { message = "Audiobook deleted.", slug });
        }
        catch (Exception ex)
        {
            return Results.Problem(detail: ex.Message, statusCode: 500, title: "Delete failed.");
        }
    }

    // Create an audiobook by snapshotting a book's edited content.
    // Includes only narrate=true sections; for each, reads the edited pages
    // (reviewed json if present, else section json — independent of Status).
    private static async Task<IResult> CreateFromBook(
        HttpRequest request,
        PathService paths, ManifestService svc,
        ChunkBuilderService chunker, AudiobookService audiobooks)
    {
        var body = await new StreamReader(request.Body).ReadToEndAsync();
        CreateFromBookBody? parsed;
        try
        {
            parsed = System.Text.Json.JsonSerializer.Deserialize<CreateFromBookBody>(
                body, JsonOpts);
        }
        catch (System.Text.Json.JsonException)
        {
            return Results.BadRequest(new { message = "Invalid payload." });
        }
        if (parsed is null || string.IsNullOrWhiteSpace(parsed.BookSlug))
            return Results.BadRequest(new { message = "book_slug required." });

        var bookSlug = parsed.BookSlug;
        if (!paths.ManifestExists(bookSlug))
            return Results.NotFound(new { message = $"{bookSlug} not found." });

        var manifest = svc.Load(paths.ManifestPath(bookSlug));

        var title = !string.IsNullOrWhiteSpace(parsed.Title)
            ? parsed.Title!
            : (!string.IsNullOrWhiteSpace(manifest.Book) ? manifest.Book : bookSlug);

        var slug = audiobooks.GenerateSlug(title);

        // Snapshot narrate=true sections' edited content, in order.
        var allChunks = new List<ChunkEntry>();
        var order = 0;
        foreach (var section in manifest.Sections)
        {
            if (!section.Narrate) continue;

            var txtFile = Path.GetFileName(
                !string.IsNullOrEmpty(section.ReviewedPath)
                    ? section.ReviewedPath
                    : section.TxtPath);
            var reviewedJson = paths.ReviewedJsonPath(bookSlug, txtFile);
            var sectionJson  = paths.SectionJsonPath(bookSlug, txtFile);

            List<PageContent> pages;
            if (File.Exists(reviewedJson))
                pages = svc.LoadPages(reviewedJson);
            else if (File.Exists(sectionJson))
                pages = svc.LoadPages(sectionJson);
            else
                continue;

            var chunks = chunker.BuildForSection(section.Id, pages, order, true);
            foreach (var c in chunks)
                c.SectionTitle = section.Title;
            allChunks.AddRange(chunks);
            order += chunks.Count;
        }

        var audiobook = new AudiobookManifest
        {
            Slug = slug,
            Title = title,
            SourceType = "pdf",
            SourceRef = bookSlug,
            CreatedAt = DateTime.Now.ToString("o"),
            RenderStatus = "idle",
        };
        audiobooks.SaveManifest(slug, audiobook);
        audiobooks.SaveChunks(slug, allChunks);

        return Results.Ok(new
        {
            slug,
            title,
            chunk_count = allChunks.Count,
        });
    }

    // Create an audiobook from an uploaded .txt (no page concept).
    private static async Task<IResult> CreateFromText(
        HttpRequest request,
        ChunkBuilderService chunker, AudiobookService audiobooks)
    {
        if (!request.HasFormContentType)
            return Results.BadRequest(new { message = "Form data required." });

        var form = await request.ReadFormAsync();
        var file = form.Files.GetFile("txt");
        var titleField = form["title"].ToString();

        if (file is null || file.Length == 0)
            return Results.BadRequest(new { message = "txt file required." });

        string content;
        using (var reader = new StreamReader(
            file.OpenReadStream(), System.Text.Encoding.UTF8))
        {
            content = await reader.ReadToEndAsync();
        }
        if (string.IsNullOrWhiteSpace(content))
            return Results.BadRequest(new { message = "txt file is empty." });

        var fileBase = Path.GetFileNameWithoutExtension(file.FileName);
        var title = !string.IsNullOrWhiteSpace(titleField)
            ? titleField
            : (!string.IsNullOrWhiteSpace(fileBase) ? fileBase : "audiobook");

        var slug = audiobooks.GenerateSlug(title);

        // Whole txt as one pageless PageContent; chunker tracks no pages.
        var pages = new List<PageContent>
        {
            new PageContent { PageNumber = 0, Text = content }
        };
        var chunks = chunker.BuildForSection("text", pages, 0, false);
        foreach (var c in chunks)
            c.SectionTitle = title;

        var audiobook = new AudiobookManifest
        {
            Slug = slug,
            Title = title,
            SourceType = "txt",
            SourceRef = file.FileName,
            CreatedAt = DateTime.Now.ToString("o"),
            RenderStatus = "idle",
        };
        audiobooks.SaveManifest(slug, audiobook);
        audiobooks.SaveChunks(slug, chunks);

        return Results.Ok(new
        {
            slug,
            title,
            chunk_count = chunks.Count,
        });
    }

    private sealed class CreateFromBookBody
    {
        public string? BookSlug { get; set; }
        public string? Title { get; set; }
    }

    private sealed class UpdateChunkBody
    {
        public string? Text { get; set; }
    }

    private sealed class SplitChunkBody
    {
        public string? Text { get; set; }
        public int Position { get; set; }
    }

    private static readonly System.Text.Json.JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.SnakeCaseLower
    };
}
