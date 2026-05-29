using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using System.IO;
using System.Threading.Tasks;
using System.Collections.Generic;
using System;
using AudiobookPipeline.Api.Services;
using AudiobookPipeline.TextProcessor.Core.Services;
using AudiobookPipeline.TextProcessor.Core.Models;

namespace AudiobookPipeline.Api.Endpoints;

public static class AudiobookEndpoints
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/api/audiobooks", ListAudiobooks);
        app.MapPost("/api/audiobooks/from-book", CreateFromBook);
        app.MapPost("/api/audiobooks/from-text", CreateFromText);
    }

    private static IResult ListAudiobooks(AudiobookService audiobooks)
        => Results.Ok(audiobooks.List());

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

    private static readonly System.Text.Json.JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.SnakeCaseLower
    };
}
