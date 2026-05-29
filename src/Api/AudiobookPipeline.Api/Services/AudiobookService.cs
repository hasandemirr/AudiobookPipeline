using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Serialization;
using AudiobookPipeline.TextProcessor.Core.Models;

namespace AudiobookPipeline.Api.Services;

public record AudiobookSummary(
    string Slug,
    string Title,
    string SourceType,
    string SourceRef,
    string CreatedAt,
    string UpdatedAt,
    string RenderStatus
);

public class AudiobookService
{
    private readonly PathService _paths;
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _locks = new();

    private SemaphoreSlim GetLock(string path) =>
        _locks.GetOrAdd(path, _ => new SemaphoreSlim(1, 1));

    private static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower) }
    };

    public AudiobookService(PathService paths)
    {
        _paths = paths;
    }

    public bool Exists(string slug) => File.Exists(_paths.AudiobookManifestPath(slug));

    public AudiobookManifest LoadManifest(string slug)
    {
        var path = _paths.AudiobookManifestPath(slug);
        if (!File.Exists(path))
            return new AudiobookManifest
            {
                Slug = slug,
                CreatedAt = DateTime.UtcNow.ToString("o"),
                UpdatedAt = DateTime.UtcNow.ToString("o")
            };

        var json = File.ReadAllText(path, System.Text.Encoding.UTF8);
        return JsonSerializer.Deserialize<AudiobookManifest>(json, Options)
               ?? new AudiobookManifest { Slug = slug };
    }

    public void SaveManifest(string slug, AudiobookManifest manifest)
    {
        var path = _paths.AudiobookManifestPath(slug);
        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);

        manifest.UpdatedAt = DateTime.UtcNow.ToString("o");
        var json = JsonSerializer.Serialize(manifest, Options);
        File.WriteAllText(path, json, System.Text.Encoding.UTF8);
    }

    public List<ChunkEntry> LoadChunks(string slug)
    {
        var path = _paths.AudiobookChunksPath(slug);
        if (!File.Exists(path))
            return new List<ChunkEntry>();

        var json = File.ReadAllText(path, System.Text.Encoding.UTF8);
        return JsonSerializer.Deserialize<List<ChunkEntry>>(json, Options)
               ?? new List<ChunkEntry>();
    }

    public void SaveChunks(string slug, List<ChunkEntry> chunks)
    {
        var path = _paths.AudiobookChunksPath(slug);
        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);

        var json = JsonSerializer.Serialize(chunks, Options);
        File.WriteAllText(path, json, System.Text.Encoding.UTF8);
    }

    public async Task UpdateChunksAsync(string slug, Func<List<ChunkEntry>, Task> mutate)
    {
        var path = _paths.AudiobookChunksPath(slug);
        var gate = GetLock(path);
        await gate.WaitAsync();
        try
        {
            var chunks = LoadChunks(slug);
            await mutate(chunks);
            SaveChunks(slug, chunks);
        }
        finally
        {
            gate.Release();
        }
    }

    public async Task UpdateManifestAsync(string slug, Func<AudiobookManifest, Task> mutate)
    {
        var path = _paths.AudiobookManifestPath(slug);
        var gate = GetLock(path);
        await gate.WaitAsync();
        try
        {
            var manifest = LoadManifest(slug);
            await mutate(manifest);
            SaveManifest(slug, manifest);
        }
        finally
        {
            gate.Release();
        }
    }

    public List<AudiobookSummary> List()
    {
        var list = new List<AudiobookSummary>();
        if (!Directory.Exists(_paths.AudiobooksDir))
            return list;

        foreach (var dir in Directory.GetDirectories(_paths.AudiobooksDir))
        {
            var slug = Path.GetFileName(dir);
            var manifestPath = _paths.AudiobookManifestPath(slug);
            if (File.Exists(manifestPath))
            {
                try
                {
                    var manifest = LoadManifest(slug);
                    list.Add(new AudiobookSummary(
                        manifest.Slug,
                        manifest.Title,
                        manifest.SourceType,
                        manifest.SourceRef,
                        manifest.CreatedAt,
                        manifest.UpdatedAt,
                        manifest.RenderStatus
                    ));
                }
                catch
                {
                    // Ignore malformed manifests when listing
                }
            }
        }

        return list;
    }

    public string GenerateSlug(string title)
    {
        var baseSlug = Slugify(title);
        if (string.IsNullOrEmpty(baseSlug))
        {
            baseSlug = "audiobook";
        }
        var slug = baseSlug;
        int counter = 2;
        while (Directory.Exists(_paths.AudiobookDir(slug)))
        {
            slug = $"{baseSlug}_{counter}";
            counter++;
        }
        return slug;
    }

    public string Slugify(string title)
    {
        if (string.IsNullOrEmpty(title)) return string.Empty;
        var slug = System.Text.RegularExpressions.Regex
            .Replace(title.ToLowerInvariant(), @"[^a-z0-9]", "_")
            .Trim('_');
        if (slug.Length > 30)
            slug = slug[..30].Trim('_');
        return slug;
    }
}
