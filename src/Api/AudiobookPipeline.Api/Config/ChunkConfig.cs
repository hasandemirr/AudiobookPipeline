namespace AudiobookPipeline.Api.Config;

public record ChunkConfig
{
    // Upper bound for chunk length (characters). Tunable; sometimes even 280
    // is too long, so this can be lowered later via appsettings.
    public int MaxChars { get; init; } = 280;
}
