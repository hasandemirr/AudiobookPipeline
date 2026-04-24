using AudiobookPipeline.TextProcessor.Core.Services;
using AudiobookPipeline.Api.Hubs;
using AudiobookPipeline.Api.Services;
using AudiobookPipeline.Api.Endpoints;

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
builder.Services.AddSingleton<PathService>();
builder.Services.AddSingleton<ManifestService>();

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

var app = builder.Build();

app.UseCors();

BookEndpoints.Map(app);
SectionEndpoints.Map(app);
ExtractEndpoints.Map(app);
ExportEndpoints.Map(app);

app.MapHub<ProgressHub>("/hubs/progress");

app.Run();
