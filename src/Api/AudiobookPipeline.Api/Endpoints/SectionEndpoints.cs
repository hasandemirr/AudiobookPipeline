using AudiobookPipeline.Api.Services;
using AudiobookPipeline.TextProcessor.Core.Services;
using AudiobookPipeline.TextProcessor.Core.Models;

namespace AudiobookPipeline.Api.Endpoints;

public static class SectionEndpoints
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/api/books/{slug}/sections/{id}", GetSection);
        app.MapPut("/api/books/{slug}/sections/{id}", UpdateSection);
        app.MapPost("/api/books/{slug}/sections/bulk-save", BulkSaveSections);
        app.MapPost("/api/books/{slug}/sections/{id}/approve", 
            ApproveSection);
        app.MapPatch("/api/books/{slug}/sections/{id}/narrate", 
            ToggleNarrate);
        app.MapDelete("/api/books/{slug}/sections/{id}/reviewed", 
            ResetSection);
    }

    private static async Task<IResult> GetSection(
        string slug, string id,
        PathService paths, ManifestService svc)
    {
        if (!paths.ManifestExists(slug))
            return Results.NotFound(new { message = $"{slug} not found." });

        var manifestPath = paths.ManifestPath(slug);
        var manifest = svc.Load(manifestPath);
        var section = manifest.Sections.FirstOrDefault(s => s.Id == id);
        if (section is null)
            return Results.NotFound(new { message = $"{id} not found." });

        // Determine the .txt filename (pointer) to derive .json paths.
        var txtFile = Path.GetFileName(
            !string.IsNullOrEmpty(section.ReviewedPath)
                ? section.ReviewedPath
                : section.TxtPath);

        var reviewedJson = paths.ReviewedJsonPath(slug, txtFile);
        var sectionJson  = paths.SectionJsonPath(slug, txtFile);

        List<PageContent> pages;
        var hasReviewedJson = File.Exists(reviewedJson);
        var hasSectionJson  = File.Exists(sectionJson);

        if (hasReviewedJson)
            pages = svc.LoadPages(reviewedJson);
        else if (hasSectionJson)
            pages = svc.LoadPages(sectionJson);
        else
        {
            // Lazy migration: parse legacy marker .txt into PageContent[] once.
            var txtPath = paths.ResolveSectionPath(section);
            if (!File.Exists(txtPath))
                return Results.NotFound(new { message = "Text file not found." });

            var legacy = File.ReadAllText(txtPath, System.Text.Encoding.UTF8);
            pages = ParsePagesContent(legacy);

            // Persist as .json and update the pointer (one-time) under lock.
            var isReviewedSource = !string.IsNullOrEmpty(section.ReviewedPath)
                && File.Exists(paths.ToAbsolute(section.ReviewedPath));
            var targetJson = isReviewedSource ? reviewedJson : sectionJson;
            svc.SavePages(targetJson, pages);

            await svc.UpdateAsync(manifestPath, m =>
            {
                var sec = m.Sections.FirstOrDefault(s => s.Id == id);
                if (sec is not null)
                {
                    if (isReviewedSource)
                        sec.ReviewedPath = paths.ToRelative(targetJson);
                    else
                        sec.TxtPath = paths.ToRelative(targetJson);
                }
                return Task.CompletedTask;
            });
        }

        // Raw pages = always the original extract (sections/{id}.json), never reviewed.
        // Falls back to `pages` only if the section json is missing (e.g. legacy just migrated to reviewed).
        var rawPages = File.Exists(sectionJson)
            ? svc.LoadPages(sectionJson)
            : pages;

        // Backward-compat: keep returning marker string content during migration.
        var content = string.Join("\n\n",
            pages.Select(p => $"=== SAYFA {p.PageNumber} ===\n{p.Text}"));

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
            rawPages,
            repeatedLines    = manifest.RepeatedLines,
            detectedPatterns = manifest.DetectedPatterns,
            isReviewed = !string.IsNullOrEmpty(section.ReviewedPath)
        });
    }

    private static async Task<IResult> UpdateSection(
        string slug, string id,
        HttpRequest request,
        PathService paths, ManifestService svc)
    {
        if (!paths.ManifestExists(slug))
            return Results.NotFound(new { message = $"{slug} not found." });

        var manifestPath = paths.ManifestPath(slug);
        var manifest = svc.Load(manifestPath);
        var section = manifest.Sections.FirstOrDefault(s => s.Id == id);
        if (section is null)
            return Results.NotFound(new { message = $"{id} not found." });

        // Read structural pages from the request body (snake_case, shared Options).
        var body = await new StreamReader(request.Body).ReadToEndAsync();
        List<PageContent>? pages;
        try
        {
            pages = System.Text.Json.JsonSerializer.Deserialize<UpdateSectionBody>(
                body, JsonOptions.Pages)?.Pages;
        }
        catch (System.Text.Json.JsonException)
        {
            return Results.BadRequest(new { message = "Invalid pages payload." });
        }
        if (pages is null)
            return Results.BadRequest(new { message = "pages field required." });

        var reviewedDir = paths.ReviewedDir(slug);
        Directory.CreateDirectory(reviewedDir);

        // Pointer filename is now .json (set by extract/migration).
        var fileName = Path.GetFileName(section.TxtPath);
        var reviewedPath = Path.Combine(reviewedDir, fileName);

        svc.SavePages(reviewedPath, pages);

        section.ReviewedPath = paths.ToRelative(reviewedPath);
        if (section.Status == "extracted")
            section.Status = "reviewed";

        svc.Save(manifestPath, manifest);

        return Results.Ok(new
        {
            id = section.Id,
            status = section.Status,
            reviewedPath = section.ReviewedPath
        });
    }

    // Bulk-save reviewed pages for multiple sections WITHOUT touching Status or
    // ReviewedPath. Used by global cleanup: content is written to reviewed/{id}.json
    // so GET (which checks file existence) serves it as edited, but the section
    // stays "extracted"/unreviewed until the user opens and saves it themselves.
    // This endpoint is pure storage — it contains NO cleanup match logic (that
    // lives only in the frontend pure function applyPatternsToPages).
    private static async Task<IResult> BulkSaveSections(
        string slug,
        HttpRequest request,
        PathService paths, ManifestService svc)
    {
        if (!paths.ManifestExists(slug))
            return Results.NotFound(new { message = $"{slug} not found." });

        var manifestPath = paths.ManifestPath(slug);
        var manifest = svc.Load(manifestPath);

        var body = await new StreamReader(request.Body).ReadToEndAsync();
        BulkSaveBody? parsed;
        try
        {
            parsed = System.Text.Json.JsonSerializer.Deserialize<BulkSaveBody>(
                body, JsonOptions.Pages);
        }
        catch (System.Text.Json.JsonException)
        {
            return Results.BadRequest(new { message = "Invalid payload." });
        }
        if (parsed?.Sections is null || parsed.Sections.Count == 0)
            return Results.BadRequest(new { message = "sections field required." });

        var reviewedDir = paths.ReviewedDir(slug);
        Directory.CreateDirectory(reviewedDir);

        var saved = new List<string>();
        foreach (var item in parsed.Sections)
        {
            if (string.IsNullOrEmpty(item.Id) || item.Pages is null) continue;
            var section = manifest.Sections.FirstOrDefault(s => s.Id == item.Id);
            if (section is null) continue;

            var fileName = Path.GetFileName(section.TxtPath);
            var reviewedPath = Path.Combine(reviewedDir, fileName);
            svc.SavePages(reviewedPath, item.Pages);
            // NOTE: deliberately NOT setting section.ReviewedPath or section.Status.
            saved.Add(section.Id);
        }

        // NOTE: manifest is intentionally NOT saved — no status/pointer changes.

        return Results.Ok(new { saved });
    }

    private sealed class UpdateSectionBody
    {
        public List<PageContent>? Pages { get; set; }
    }

    private sealed class BulkSaveBody
    {
        public List<BulkSaveItem>? Sections { get; set; }
    }

    private sealed class BulkSaveItem
    {
        public string? Id { get; set; }
        public List<PageContent>? Pages { get; set; }
    }

    private static class JsonOptions
    {
        public static readonly System.Text.Json.JsonSerializerOptions Pages = new()
        {
            PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.SnakeCaseLower
        };
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

        var source = paths.ResolveSectionPath(section);
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

    private static IResult ResetSection(
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

        if (!string.IsNullOrEmpty(section.ReviewedPath))
        {
            var fullPath = paths.ToAbsolute(section.ReviewedPath);
            if (File.Exists(fullPath))
                File.Delete(fullPath);

            section.ReviewedPath = null;
            section.Status = "extracted";
            svc.Save(paths.ManifestPath(slug), manifest);
        }

        return Results.Ok(new
        {
            id = section.Id,
            status = "extracted"
        });
    }

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

    private static List<PageContent> ParsePagesContent(string content) =>
        content
            .Split("=== SAYFA ", StringSplitOptions.RemoveEmptyEntries)
            .Select(block =>
            {
                var lines = block.Split('\n');
                var first = lines[0];
                var numStr = first.Contains(" ===")
                    ? first.Replace(" ===", "").Trim()
                    : first.Trim();
                var text = string.Join("\n", lines.Skip(1)).Trim();
                return new PageContent
                {
                    PageNumber = int.TryParse(numStr, out var n) ? n : 0,
                    Text = text
                };
            })
            .Where(p => p.PageNumber > 0)
            .ToList();
}
