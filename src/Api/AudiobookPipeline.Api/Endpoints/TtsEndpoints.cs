using System.Net;

namespace AudiobookPipeline.Api.Endpoints;

// Proxy to the Python TTS service (port 5001). Passes status + body through
// AS-IS; only when the service is unreachable do we return 503.
public static class TtsEndpoints
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/api/tts/health", Health);
        app.MapGet("/api/tts/engines", Engines);
        app.MapPost("/api/tts/engines/load", LoadEngine);
        app.MapPost("/api/tts/engines/unload", UnloadEngine);
        app.MapPost("/api/tts/render", Render);
    }

    private static async Task<IResult> Health(IHttpClientFactory f)
        => await ProxyGet(f, "/health");

    private static async Task<IResult> Engines(IHttpClientFactory f)
        => await ProxyGet(f, "/engines");

    private static async Task<IResult> LoadEngine(IHttpClientFactory f, HttpRequest req)
        => await ProxyPost(f, "/engines/load", req);

    private static async Task<IResult> UnloadEngine(IHttpClientFactory f, HttpRequest req)
        => await ProxyPost(f, "/engines/unload", req);

    private static async Task<IResult> Render(IHttpClientFactory f, HttpRequest req)
        => await ProxyPost(f, "/render", req);

    private static async Task<IResult> ProxyGet(IHttpClientFactory f, string path)
    {
        var client = f.CreateClient("tts");
        try
        {
            var resp = await client.GetAsync(path);
            return await PassThrough(resp);
        }
        catch (HttpRequestException)
        {
            return Results.Json(new { detail = "TTS service unavailable." },
                statusCode: (int)HttpStatusCode.ServiceUnavailable);
        }
        catch (TaskCanceledException)
        {
            return Results.Json(new { detail = "TTS service timeout." },
                statusCode: (int)HttpStatusCode.ServiceUnavailable);
        }
    }

    private static async Task<IResult> ProxyPost(
        IHttpClientFactory f, string path, HttpRequest req)
    {
        var client = f.CreateClient("tts");
        using var content = new StreamContent(req.Body);
        if (!string.IsNullOrEmpty(req.ContentType))
            content.Headers.TryAddWithoutValidation("Content-Type", req.ContentType);
        try
        {
            var resp = await client.PostAsync(path, content);
            return await PassThrough(resp);
        }
        catch (HttpRequestException)
        {
            return Results.Json(new { detail = "TTS service unavailable." },
                statusCode: (int)HttpStatusCode.ServiceUnavailable);
        }
        catch (TaskCanceledException)
        {
            return Results.Json(new { detail = "TTS service timeout." },
                statusCode: (int)HttpStatusCode.ServiceUnavailable);
        }
    }

    private static async Task<IResult> PassThrough(HttpResponseMessage resp)
    {
        var bytes = await resp.Content.ReadAsByteArrayAsync();
        var contentType = resp.Content.Headers.ContentType?.ToString()
            ?? "application/octet-stream";
        return new StatusCodeBytesResult((int)resp.StatusCode, bytes, contentType);
    }
}

// Minimal IResult that writes a specific status code + content-type + bytes.
internal sealed class StatusCodeBytesResult : IResult
{
    private readonly int _status;
    private readonly byte[] _bytes;
    private readonly string _contentType;
    public StatusCodeBytesResult(int status, byte[] bytes, string contentType)
    { _status = status; _bytes = bytes; _contentType = contentType; }

    public async Task ExecuteAsync(HttpContext ctx)
    {
        ctx.Response.StatusCode = _status;
        ctx.Response.ContentType = _contentType;
        await ctx.Response.Body.WriteAsync(_bytes);
    }
}
