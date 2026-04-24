using AudiobookPipeline.Api.Services;
using AudiobookPipeline.TextProcessor.Core.Services;

namespace AudiobookPipeline.Api.Endpoints;

public static class ExportEndpoints
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/api/books/{slug}/export", Export);
        app.MapGet("/api/books/{slug}/export/status", 
            ExportStatus);
    }

    private static IResult Export(
        string slug, PathService paths, ManifestService svc)
    {
        if (!paths.ManifestExists(slug))
            return Results.NotFound(
                new { message = $"{slug} not found." });

        var manifest = svc.Load(paths.ManifestPath(slug));

        var approved = manifest.Sections
            .Where(s => s.Status == "approved" && s.Narrate)
            .OrderBy(s => s.PageStart)
            .ToList();

        if (!approved.Any())
            return Results.BadRequest(new
            {
                message = "No approved sections found.",
                hint = "Approve sections before exporting."
            });

        var parts = approved
            .Select(s =>
            {
                var txt = !string.IsNullOrEmpty(s.ReviewedPath)
                    && File.Exists(s.ReviewedPath)
                        ? s.ReviewedPath : s.TxtPath;
                return File.Exists(txt)
                    ? File.ReadAllText(txt, 
                        System.Text.Encoding.UTF8).Trim()
                    : null;
            })
            .Where(t => t is not null);

        var finalText = string.Join("\n\n", parts);

        Directory.CreateDirectory(paths.OutputDir);
        File.WriteAllText(paths.ExportPath(slug), finalText,
            System.Text.Encoding.UTF8);

        var bytes = System.Text.Encoding.UTF8.GetBytes(finalText);
        return Results.File(
            bytes,
            contentType: "text/plain; charset=utf-8",
            fileDownloadName: $"{slug}_export.txt");
    }

    private static IResult ExportStatus(
        string slug, PathService paths, ManifestService svc)
    {
        if (!paths.ManifestExists(slug))
            return Results.NotFound(
                new { message = $"{slug} not found." });

        var manifest = svc.Load(paths.ManifestPath(slug));
        var exportPath = paths.ExportPath(slug);

        var total    = manifest.Sections.Count(s => s.Narrate);
        var approved = manifest.Sections
            .Count(s => s.Status == "approved" && s.Narrate);

        return Results.Ok(new
        {
            totalNarrated  = total,
            approvedCount  = approved,
            readyToExport  = approved > 0,
            allApproved    = approved == total && total > 0,
            lastExportPath = File.Exists(exportPath)
                ? exportPath : null,
            lastExportTime = File.Exists(exportPath)
                ? File.GetLastWriteTime(exportPath)
                    .ToString("o") : null
        });
    }
}
