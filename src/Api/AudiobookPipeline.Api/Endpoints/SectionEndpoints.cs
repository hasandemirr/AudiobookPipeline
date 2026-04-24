using AudiobookPipeline.Api.Services;
using AudiobookPipeline.TextProcessor.Core.Services;

namespace AudiobookPipeline.Api.Endpoints;

public static class SectionEndpoints
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/api/books/{slug}/sections/{id}", GetSection);
        app.MapPut("/api/books/{slug}/sections/{id}", UpdateSection);
        app.MapPost("/api/books/{slug}/sections/{id}/approve", 
            ApproveSection);
        app.MapPatch("/api/books/{slug}/sections/{id}/narrate", 
            ToggleNarrate);
    }

    private static IResult GetSection(
        string slug, string id,
        PathService paths, ManifestService svc)
    {
        if (!paths.ManifestExists(slug))
            return Results.NotFound(
                new { message = $"{slug} not found." });

        var manifest = svc.Load(paths.ManifestPath(slug));
        var section = manifest.Sections
            .FirstOrDefault(s => s.Id == id);

        if (section is null)
            return Results.NotFound(
                new { message = $"{id} not found." });

        var txtPath = ResolveTextPath(section);
        if (!File.Exists(txtPath))
            return Results.NotFound(
                new { message = "Text file not found." });

        var content = File.ReadAllText(txtPath, 
            System.Text.Encoding.UTF8);
        var pages = ParsePages(content);

        return Results.Ok(new
        {
            id = section.Id,
            title = section.Title,
            status = section.Status,
            narrate = section.Narrate,
            pageStart = section.PageStart,
            pageEnd = section.PageEnd,
            content,
            pages,
            isReviewed = !string.IsNullOrEmpty(section.ReviewedPath)
        });
    }

    private static async Task<IResult> UpdateSection(
        string slug, string id,
        HttpRequest request,
        PathService paths, ManifestService svc)
    {
        if (!paths.ManifestExists(slug))
            return Results.NotFound(
                new { message = $"{slug} not found." });

        var body = await new StreamReader(request.Body)
            .ReadToEndAsync();
        var json = System.Text.Json.JsonDocument.Parse(body);

        if (!json.RootElement.TryGetProperty(
            "content", out var contentEl))
            return Results.BadRequest(
                new { message = "content field required." });

        var newContent = contentEl.GetString() ?? string.Empty;
        var manifest = svc.Load(paths.ManifestPath(slug));
        var section = manifest.Sections
            .FirstOrDefault(s => s.Id == id);

        if (section is null)
            return Results.NotFound(
                new { message = $"{id} not found." });

        var reviewedDir = paths.ReviewedDir(slug);
        Directory.CreateDirectory(reviewedDir);

        var fileName = Path.GetFileName(section.TxtPath);
        var reviewedPath = Path.Combine(reviewedDir, fileName);

        File.WriteAllText(reviewedPath, newContent,
            System.Text.Encoding.UTF8);

        section.ReviewedPath = reviewedPath;
        if (section.Status == "extracted")
            section.Status = "reviewed";

        svc.Save(paths.ManifestPath(slug), manifest);

        return Results.Ok(new
        {
            id = section.Id,
            status = section.Status,
            reviewedPath
        });
    }

    private static IResult ApproveSection(
        string slug, string id,
        PathService paths, ManifestService svc)
    {
        if (!paths.ManifestExists(slug))
            return Results.NotFound(
                new { message = $"{slug} not found." });

        var manifest = svc.Load(paths.ManifestPath(slug));
        var section = manifest.Sections
            .FirstOrDefault(s => s.Id == id);

        if (section is null)
            return Results.NotFound(
                new { message = $"{id} not found." });

        var source = ResolveTextPath(section);
        if (!File.Exists(source))
            return Results.BadRequest(
                new { message = "No text file to approve." });

        section.Status = "approved";
        svc.Save(paths.ManifestPath(slug), manifest);

        return Results.Ok(new
        {
            id = section.Id,
            status = "approved"
        });
    }

    private static IResult ToggleNarrate(
        string slug, string id,
        PathService paths, ManifestService svc)
    {
        if (!paths.ManifestExists(slug))
            return Results.NotFound(
                new { message = $"{slug} not found." });

        var manifest = svc.Load(paths.ManifestPath(slug));
        var section = manifest.Sections
            .FirstOrDefault(s => s.Id == id);

        if (section is null)
            return Results.NotFound(
                new { message = $"{id} not found." });

        section.Narrate = !section.Narrate;
        svc.Save(paths.ManifestPath(slug), manifest);

        return Results.Ok(new
        {
            id = section.Id,
            narrate = section.Narrate
        });
    }

    // Reviewed varsa onu, yoksa extracted txt'yi döndür
    private static string ResolveTextPath(
        AudiobookPipeline.TextProcessor.Core.Models.Section section) =>
        !string.IsNullOrEmpty(section.ReviewedPath)
        && File.Exists(section.ReviewedPath)
            ? section.ReviewedPath
            : section.TxtPath;

    // Page marker parse — "=== SAYFA N ===" formatı
    private static IEnumerable<object> ParsePages(string content) =>
        content
            .Split("=== SAYFA ", 
                StringSplitOptions.RemoveEmptyEntries)
            .Select(block =>
            {
                var lines = block.Split('\n');
                var first = lines[0];
                var numStr = first.Contains(" ===")
                    ? first.Replace(" ===", "").Trim()
                    : first.Trim();
                var text = string.Join("\n", 
                    lines.Skip(1)).Trim();
                return new
                {
                    pageNumber = int.TryParse(numStr, out var n)
                        ? n : 0,
                    text
                };
            })
            .Where(p => p.pageNumber > 0);
}
