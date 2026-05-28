using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Serialization;
using AudiobookPipeline.TextProcessor.Core.Models;

namespace AudiobookPipeline.TextProcessor.Core.Services;

public class RenderService
{
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _locks
        = new();

    private SemaphoreSlim GetLock(string path) =>
        _locks.GetOrAdd(path, _ => new SemaphoreSlim(1, 1));

    private static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower) }
    };

    public RenderManifest Load(string renderPath)
    {
        if (!File.Exists(renderPath))
            return new RenderManifest { CreatedAt = DateTime.Now.ToString("o") };

        var json = File.ReadAllText(renderPath, System.Text.Encoding.UTF8);
        return JsonSerializer.Deserialize<RenderManifest>(json, Options)
               ?? new RenderManifest();
    }

    public void Save(string renderPath, RenderManifest render)
    {
        var dir = Path.GetDirectoryName(renderPath);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);

        render.UpdatedAt = DateTime.Now.ToString("o");
        var json = JsonSerializer.Serialize(render, Options);
        File.WriteAllText(renderPath, json, System.Text.Encoding.UTF8);
    }

    public bool Exists(string renderPath) => File.Exists(renderPath);

    public async Task UpdateAsync(
        string renderPath, Func<RenderManifest, Task> mutate)
    {
        var gate = GetLock(renderPath);
        await gate.WaitAsync();
        try
        {
            var render = Load(renderPath);
            await mutate(render);
            Save(renderPath, render);
        }
        finally { gate.Release(); }
    }
}
