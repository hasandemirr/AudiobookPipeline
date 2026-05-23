namespace AudiobookPipeline.Api.Config;

public record ExtractConfig
{
    public int HeaderFooterMinRepeatCount { get; init; } = 3;
    public int HeaderFooterScanLines      { get; init; } = 3;
    public int HeaderFooterTokenCount     { get; init; } = 3;
}
