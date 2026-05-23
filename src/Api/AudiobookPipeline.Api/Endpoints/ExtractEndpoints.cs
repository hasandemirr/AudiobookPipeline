using AudiobookPipeline.Api.Hubs;
using AudiobookPipeline.Api.Services;
using AudiobookPipeline.TextProcessor.Core.Models;
using AudiobookPipeline.TextProcessor.Core.Services;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using AudiobookPipeline.Api.Config;

namespace AudiobookPipeline.Api.Endpoints;

public static class ExtractEndpoints
{
    public static void Map(WebApplication app)
    {
        app.MapPost("/api/books/extract", Extract);
    }

    private static async Task<IResult> Extract(
        HttpRequest request,
        PathService paths,
        ManifestService svc,
        IHubContext<ProgressHub> hub,
        IConfiguration config,
        AudiobookPipeline.Api.Jobs.BackgroundTaskQueue queue,
        IServiceProvider sp)
    {
        if (!request.HasFormContentType)
            return Results.BadRequest(
                new { message = "Form data required." });

        var form = await request.ReadFormAsync();
        var slug = form["slug"].ToString();
        var file = form.Files.GetFile("pdf");

        if (string.IsNullOrWhiteSpace(slug))
            return Results.BadRequest(
                new { message = "slug is required." });

        if (file is null || file.Length == 0)
            return Results.BadRequest(
                new { message = "PDF file is required." });

        // Conflict check
        if (paths.ManifestExists(slug))
        {
            if (svc.IsLocked(paths.ManifestPath(slug)))
                return Results.Conflict(new
                {
                    message = $"{slug} is currently being processed.",
                    isLocked = true
                });

            if (form["force"].ToString() != "true")
                return Results.Conflict(new
                {
                    message = $"{slug} already exists. Send force=true to overwrite.",
                    isLocked = false,
                    exists = true
                });
        }

        // Save PDF
        Directory.CreateDirectory(paths.PdfDir);
        var pdfPath = Path.Combine(paths.PdfDir, file.FileName);
        using (var stream = File.Create(pdfPath))
            await file.CopyToAsync(stream);

        // Run extract in background
        using var scope   = sp.CreateScope();
        var tocParser     = scope.ServiceProvider
            .GetRequiredService<TocParserService>();
        var extractor     = scope.ServiceProvider
            .GetRequiredService<PdfExtractService>();
        var detector      = scope.ServiceProvider
            .GetRequiredService<HeaderFooterDetector>();
        var ocrFix        = scope.ServiceProvider
            .GetRequiredService<OcrFixService>();
        var extractConfig = scope.ServiceProvider
            .GetRequiredService<IOptions<ExtractConfig>>().Value;

        var job = new AudiobookPipeline.Api.Jobs.ExtractJob(
            slug, pdfPath, paths, svc, hub,
            tocParser, extractor, detector, ocrFix, extractConfig);
        await queue.EnqueueAsync(job);

        return Results.Accepted(null, new
        {
            message = "Extract started.",
            slug
        });
    }
}
