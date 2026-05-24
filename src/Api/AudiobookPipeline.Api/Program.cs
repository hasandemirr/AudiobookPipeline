using AudiobookPipeline.TextProcessor.Core.Services;
using AudiobookPipeline.Api.Hubs;
using AudiobookPipeline.Api.Services;
using AudiobookPipeline.Api.Endpoints;
using AudiobookPipeline.Api.Jobs;
using Microsoft.Extensions.Options;
using AudiobookPipeline.Api.Config;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins(
                "http://localhost:5173",
                "http://localhost:5174",
                "http://localhost:5175",
                "http://localhost:5176",
                "http://localhost:5177",
                "http://localhost:5178",
                "http://localhost:5179",
                "http://localhost:3000")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials()));

builder.Services.AddSignalR();

// Swagger / OpenAPI (single env: always enabled, no IsDevelopment gate)
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddSingleton<PathService>();
builder.Services.AddSingleton<ManifestService>();

builder.Services.Configure<ExtractConfig>(
    builder.Configuration.GetSection("Extract"));

// Named HttpClient for the Python TTS service (port 5001). Long timeout: render can be slow.
builder.Services.AddHttpClient("tts", (sp, client) =>
{
    var cfg = sp.GetRequiredService<IOptions<TtsConfig>>().Value;
    client.BaseAddress = new Uri(cfg.BaseUrl);
    client.Timeout = TimeSpan.FromSeconds(300);
});
builder.Services.Configure<TtsConfig>(
    builder.Configuration.GetSection("Tts"));

builder.Services.AddScoped<AudiobookPipeline.TextProcessor.Core.Services.TocParserService>();
builder.Services.AddScoped<AudiobookPipeline.TextProcessor.Core.Services.PdfExtractService>();
builder.Services.AddScoped<AudiobookPipeline.TextProcessor.Core.Services.OcrFixService>(
    sp => new AudiobookPipeline.TextProcessor.Core.Services.OcrFixService(
        sp.GetRequiredService<PathService>().OcrRulesPath));
builder.Services.AddScoped<AudiobookPipeline.TextProcessor.Core.Services.HeaderFooterDetector>(
    sp =>
    {
        var cfg = sp.GetRequiredService<IOptions<ExtractConfig>>().Value;
        return new HeaderFooterDetector(
            minRepeatCount: cfg.HeaderFooterMinRepeatCount,
            scanLines:      cfg.HeaderFooterScanLines);
    });

// Force snake_case for all JSON responses
builder.Services.ConfigureHttpJsonOptions(options => {
    options.SerializerOptions.PropertyNamingPolicy = 
        System.Text.Json.JsonNamingPolicy.SnakeCaseLower;
    options.SerializerOptions.DefaultIgnoreCondition = 
        System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull;
});

builder.Services.Configure<Microsoft.AspNetCore.Mvc.JsonOptions>(options => {
    options.JsonSerializerOptions.PropertyNamingPolicy = 
        System.Text.Json.JsonNamingPolicy.SnakeCaseLower;
});

builder.Services.AddSingleton<BackgroundTaskQueue>();
builder.Services.AddHostedService<QueuedHostedService>();

var app = builder.Build();

app.UseCors();

// Always on (single env). Browse all endpoints at /swagger.
app.UseSwagger();
app.UseSwaggerUI();

BookEndpoints.Map(app);
SectionEndpoints.Map(app);
ExtractEndpoints.Map(app);
ExportEndpoints.Map(app);
TtsEndpoints.Map(app);

app.MapHub<ProgressHub>("/hubs/progress");

app.Run();
