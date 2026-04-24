using System.Text.Json;
using System.Text.Json.Serialization;
using AudiobookPipeline.TextProcessor.Core.Models;

namespace AudiobookPipeline.TextProcessor.Core.Services;

public class ManifestService
{
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

    public void Lock(string manifestPath, string lockedBy)
    {
        var manifest = Load(manifestPath);
        manifest.IsLocked = true;
        manifest.LockedAt = DateTime.Now.ToString("o");
        manifest.LockedBy = lockedBy;
        manifest.UpdatedAt = DateTime.Now.ToString("o");
        Save(manifestPath, manifest);
    }

    public void Unlock(string manifestPath)
    {
        var manifest = Load(manifestPath);
        manifest.IsLocked = false;
        manifest.LockedAt = string.Empty;
        manifest.LockedBy = string.Empty;
        manifest.UpdatedAt = DateTime.Now.ToString("o");
        Save(manifestPath, manifest);
    }

    public bool IsLocked(string manifestPath)
    {
        if (!File.Exists(manifestPath)) return false;
        var manifest = Load(manifestPath);
        return manifest.IsLocked;
    }
}
