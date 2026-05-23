using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Serialization;
using AudiobookPipeline.TextProcessor.Core.Models;

namespace AudiobookPipeline.TextProcessor.Core.Services;

public class ManifestService
{
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _locks
        = new();

    private SemaphoreSlim GetLock(string manifestPath) =>
        _locks.GetOrAdd(manifestPath, _ => new SemaphoreSlim(1, 1));

    private static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public BookManifest Load(string manifestPath)
    {
        if (!File.Exists(manifestPath))
            return new BookManifest
            {
                CreatedAt = DateTime.Now.ToString("o")
            };

        var json = File.ReadAllText(manifestPath, System.Text.Encoding.UTF8);
        return JsonSerializer.Deserialize<BookManifest>(json, Options)
               ?? new BookManifest();
    }

    public void Save(string manifestPath, BookManifest manifest)
    {
        var dir = Path.GetDirectoryName(manifestPath);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);

        var json = JsonSerializer.Serialize(manifest, Options);
        File.WriteAllText(manifestPath, json, System.Text.Encoding.UTF8);
    }

    public async Task<T> UpdateAsync<T>(
        string manifestPath,
        Func<BookManifest, Task<T>> update)
    {
        var sem = GetLock(manifestPath);
        if (!await sem.WaitAsync(TimeSpan.FromSeconds(30)))
            throw new TimeoutException(
                $"Manifest lock timeout: {manifestPath}");
        try
        {
            var manifest = Load(manifestPath);
            var result   = await update(manifest);
            manifest.UpdatedAt = DateTime.Now.ToString("o");
            Save(manifestPath, manifest);
            return result;
        }
        finally
        {
            sem.Release();
        }
    }

    public async Task UpdateAsync(
        string manifestPath,
        Func<BookManifest, Task> update) =>
        await UpdateAsync<object?>(manifestPath, async m =>
        {
            await update(m);
            return null;
        });

    public void Lock(string manifestPath, string lockedBy)
    {
        var sem = GetLock(manifestPath);
        sem.Wait(TimeSpan.FromSeconds(30));
        try
        {
            var manifest = Load(manifestPath);
            manifest.IsLocked  = true;
            manifest.LockedAt  = DateTime.Now.ToString("o");
            manifest.LockedBy  = lockedBy;
            manifest.UpdatedAt = DateTime.Now.ToString("o");
            Save(manifestPath, manifest);
        }
        finally { sem.Release(); }
    }

    public void Unlock(string manifestPath)
    {
        var sem = GetLock(manifestPath);
        sem.Wait(TimeSpan.FromSeconds(30));
        try
        {
            var manifest = Load(manifestPath);
            manifest.IsLocked  = false;
            manifest.LockedAt  = string.Empty;
            manifest.LockedBy  = string.Empty;
            manifest.UpdatedAt = DateTime.Now.ToString("o");
            Save(manifestPath, manifest);
        }
        finally { sem.Release(); }
    }

    public bool IsLocked(string manifestPath)
    {
        if (!File.Exists(manifestPath)) return false;
        var manifest = Load(manifestPath);
        return manifest.IsLocked;
    }
}
