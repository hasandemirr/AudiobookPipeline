using AudiobookPipeline.Api.Services;
using AudiobookPipeline.TextProcessor.Core.Services;

namespace AudiobookPipeline.Api.Endpoints;

public static class BookEndpoints
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/api/books", ListBooks);
        app.MapGet("/api/books/{slug}", GetBook);
        app.MapGet("/api/books/{slug}/status", GetStatus);
        app.MapDelete("/api/books/{slug}", DeleteBook);
        app.MapDelete("/api/books/{slug}/output", DeleteOutput);
        app.MapGet("/api/health", GetHealth);
    }

    private static IResult ListBooks(
        PathService paths, ManifestService svc, RenderService render)
    {
        if (!Directory.Exists(paths.WorkspaceDir))
            return Results.Ok(Array.Empty<object>());

        var books = Directory.GetDirectories(paths.WorkspaceDir)
            .Select(dir =>
            {
                var slug = Path.GetFileName(dir);
                if (!paths.ManifestExists(slug))
                    return new
                    {
                        slug,
                        title = slug,
                        sectionCount = 0,
                        approvedCount = 0,
                        chunkCount = 0,
                        hasManifest = false
                    };

                var manifest = svc.Load(paths.ManifestPath(slug));
                return new
                {
                    slug,
                    title = manifest.Book,
                    sectionCount = manifest.Sections.Count,
                    approvedCount = manifest.Sections
                        .Count(s => s.Status == "approved"),
                    chunkCount = ReadChunkCount(paths, render, slug),
                    hasManifest = true
                };
            })
            .ToList();

        return Results.Ok(books);
    }

    private static IResult GetBook(
        string slug, PathService paths, ManifestService svc)
    {
        if (!paths.ManifestExists(slug))
            return Results.NotFound(
                new { message = $"{slug} not found." });

        var manifest = svc.Load(paths.ManifestPath(slug));
        return Results.Ok(manifest);
    }

    private static IResult GetStatus(
        string slug, PathService paths, ManifestService svc)
    {
        if (!paths.ManifestExists(slug))
            return Results.NotFound(new
            {
                exists = false,
                isLocked = false
            });

        var manifest = svc.Load(paths.ManifestPath(slug));
        return Results.Ok(new
        {
            exists = true,
            isLocked = manifest.IsLocked,
            lockedBy = manifest.LockedBy,
            lockedAt = manifest.LockedAt,
            updatedAt = manifest.UpdatedAt,
            totalSections = manifest.Sections.Count,
            approvedCount = manifest.Sections
                .Count(s => s.Status == "approved"),
            extractedCount = manifest.Sections
                .Count(s => s.Status == "extracted"),
            reviewedCount = manifest.Sections
                .Count(s => s.Status == "reviewed")
        });
    }

    private static IResult GetHealth(PathService paths) =>
        Results.Ok(new
        {
            status = "ok",
            repoRoot = paths.RepoRoot,
            timestamp = DateTime.UtcNow.ToString("o")
        });

    private static IResult DeleteBook(
        string slug,
        PathService paths,
        ManifestService svc)
    {
        if (!paths.ManifestExists(slug))
            return Results.NotFound(
                new { message = $"{slug} not found." });

        if (svc.IsLocked(paths.ManifestPath(slug)))
            return Results.Conflict(new
            {
                message = $"{slug} is currently being processed.",
                isLocked = true
            });

        try
        {
            Directory.Delete(paths.BookDir(slug), recursive: true);
            return Results.Ok(new
            {
                message = $"{slug} deleted.",
                slug
            });
        }
        catch (Exception ex)
        {
            return Results.Problem(
                detail: ex.Message,
                statusCode: 500,
                title: "Delete failed.");
        }
    }

    private static IResult DeleteOutput(
        string slug,
        PathService paths)
    {
        var exportPath = paths.ExportPath(slug);
        var deleted = new List<string>();

        if (File.Exists(exportPath))
        {
            File.Delete(exportPath);
            deleted.Add(exportPath);
        }

        // WAV output varsa da sil
        var wavPath = Path.Combine(
            paths.OutputDir, $"{slug}.wav");
        if (File.Exists(wavPath))
        {
            File.Delete(wavPath);
            deleted.Add(wavPath);
        }

        if (deleted.Count == 0)
            return Results.NotFound(new
            {
                message = "No output files found.",
                slug
            });

        return Results.Ok(new
        {
            message = $"{deleted.Count} output file(s) deleted.",
            deleted
        });
    }

    private static int ReadChunkCount(
        PathService paths, RenderService render, string slug)
    {
        var renderPath = paths.RenderManifestPath(slug);
        if (!render.Exists(renderPath)) return 0;
        return render.Load(renderPath).Chunks.Count;
    }
}
