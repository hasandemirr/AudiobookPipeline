using System;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading;
using System.Threading.Tasks;
using AudiobookPipeline.Api.Services;
using AudiobookPipeline.TextProcessor.Core.Models;
using Microsoft.AspNetCore.SignalR;
using AudiobookPipeline.Api.Hubs;

namespace AudiobookPipeline.Api.Jobs;

public class AudiobookRenderJob : IJob
{
    private const string EngineId = "chatterbox";
    private const string LanguageId = "tr";

    private readonly string _slug;
    private readonly AudiobookService _audiobooks;
    private readonly IHttpClientFactory _httpFactory;
    private readonly PathService _paths;
    private readonly IHubContext<ProgressHub> _hub;

    public AudiobookRenderJob(
        string slug,
        AudiobookService audiobooks,
        IHttpClientFactory httpFactory,
        PathService paths,
        IHubContext<ProgressHub> hub)
    {
        _slug = slug;
        _audiobooks = audiobooks;
        _httpFactory = httpFactory;
        _paths = paths;
        _hub = hub;
    }

    public async Task ExecuteAsync(CancellationToken cancellationToken)
    {
        var client = _httpFactory.CreateClient("tts");

        async Task Notify(string? chunkId, int index, int total, string status, bool done = false, bool error = false) =>
            await _hub.Clients.All.SendAsync("RenderProgress",
                new { slug = _slug, chunkId, index, total, status, done, error }, cancellationToken);

        await _audiobooks.UpdateManifestAsync(_slug, m =>
        {
            m.RenderStatus = "rendering";
            m.UpdatedAt = DateTime.UtcNow.ToString("o");
            return Task.CompletedTask;
        });

        await Notify(null, 0, 0, "loading");

        try
        {
            var loadResp = await client.PostAsJsonAsync("/engines/load", new { engine_id = EngineId }, cancellationToken);
            if (!loadResp.IsSuccessStatusCode)
            {
                await _audiobooks.UpdateManifestAsync(_slug, m =>
                {
                    m.RenderStatus = "failed";
                    m.UpdatedAt = DateTime.UtcNow.ToString("o");
                    return Task.CompletedTask;
                });
                await Notify(null, 0, 0, "failed", done: true, error: true);
                return;
            }
        }
        catch (Exception)
        {
            await _audiobooks.UpdateManifestAsync(_slug, m =>
            {
                m.RenderStatus = "failed";
                m.UpdatedAt = DateTime.UtcNow.ToString("o");
                return Task.CompletedTask;
            });
            await Notify(null, 0, 0, "failed", done: true, error: true);
            return;
        }

        var chunks = _audiobooks.LoadChunks(_slug);
        var workList = chunks
            .Where(c => c.Status == ChunkStatus.Pending 
                     || c.Status == ChunkStatus.Stale 
                     || c.Status == ChunkStatus.Failed)
            .OrderBy(c => c.Order)
            .ToList();

        var total = workList.Count;
        await Notify(null, 0, total, "rendering");

        var audioDir = _paths.AudiobookAudioDir(_slug);
        Directory.CreateDirectory(audioDir);

        var index = 0;
        foreach (var c in workList)
        {
            index++;
            if (cancellationToken.IsCancellationRequested)
                break;

            await _audiobooks.UpdateChunksAsync(_slug, list =>
            {
                var target = list.FirstOrDefault(chunk => chunk.Id == c.Id);
                if (target != null)
                {
                    target.Status = ChunkStatus.Rendering;
                }
                return Task.CompletedTask;
            });
            await Notify(c.Id, index, total, "rendering");

            try
            {
                var resp = await client.PostAsJsonAsync("/render", new { text = c.Text, language_id = LanguageId }, cancellationToken);
                if (!resp.IsSuccessStatusCode)
                    throw new Exception($"TTS render failed with status {resp.StatusCode}");

                var bytes = await resp.Content.ReadAsByteArrayAsync(cancellationToken);

                // Read duration header
                long? durationMs = null;
                if (resp.Headers.TryGetValues("X-Audio-Duration-Ms", out var hv) && hv != null)
                {
                    foreach (var val in hv)
                    {
                        if (long.TryParse(val, out var parsed))
                        {
                            durationMs = parsed;
                            break;
                        }
                    }
                }
                if (durationMs == null && resp.Content.Headers.TryGetValues("X-Audio-Duration-Ms", out var chv) && chv != null)
                {
                    foreach (var val in chv)
                    {
                        if (long.TryParse(val, out var parsed))
                        {
                            durationMs = parsed;
                            break;
                        }
                    }
                }

                var wavPath = Path.Combine(audioDir, $"{c.Id}.wav");
                await File.WriteAllBytesAsync(wavPath, bytes, cancellationToken);

                await _audiobooks.UpdateChunksAsync(_slug, list =>
                {
                    var target = list.FirstOrDefault(chunk => chunk.Id == c.Id);
                    if (target != null)
                    {
                        target.Status = ChunkStatus.Done;
                        target.AudioPath = _paths.ToRelative(wavPath);
                        target.AudioDurationSec = durationMs.HasValue ? durationMs.Value / 1000.0 : null;
                    }
                    return Task.CompletedTask;
                });
                await Notify(c.Id, index, total, "done");
            }
            catch (Exception)
            {
                await _audiobooks.UpdateChunksAsync(_slug, list =>
                {
                    var target = list.FirstOrDefault(chunk => chunk.Id == c.Id);
                    if (target != null)
                    {
                        target.Status = ChunkStatus.Failed;
                        target.Retries++;
                    }
                    return Task.CompletedTask;
                });
                await Notify(c.Id, index, total, "failed");
            }
        }

        var final = _audiobooks.LoadChunks(_slug);
        var anyFailed = final.Any(z => z.Status == ChunkStatus.Failed);
        await _audiobooks.UpdateManifestAsync(_slug, m =>
        {
            m.RenderStatus = anyFailed ? "failed" : "done";
            m.UpdatedAt = DateTime.UtcNow.ToString("o");
            return Task.CompletedTask;
        });
        await Notify(null, total, total, "done", done: true, error: false);
    }
}
