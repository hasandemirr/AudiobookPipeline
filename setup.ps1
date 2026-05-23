$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot

Write-Host ""
Write-Host "=== AudiobookPipeline Kurulum ===" -ForegroundColor Cyan
Write-Host "Repo koku: $repoRoot"

# 1. .env management
$envPath = Join-Path $repoRoot ".env"
$envExamplePath = Join-Path $repoRoot ".env.example"
if (-not (Test-Path $envPath)) {
    if (-not (Test-Path $envExamplePath)) {
        Write-Host "HATA: .env.example bulunamadi." -ForegroundColor Red; exit 1
    }
    Copy-Item $envExamplePath $envPath
    Write-Host ".env.example -> .env kopyalandi." -ForegroundColor Green
} else {
    Write-Host ".env mevcut." -ForegroundColor Green
}

$envVars = @{}
Get-Content $envPath | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
        $parts = $line -split "=", 2
        $envVars[$parts[0].Trim()] = $parts[1].Trim()
    }
}

function Set-IfEmpty {
    param($key, $default)
    if ([string]::IsNullOrWhiteSpace($envVars[$key])) {
        $content = Get-Content $envPath
        $found = $false
        $updated = $content | ForEach-Object {
            if ($_ -match "^$key=") { $found = $true; "$key=$default" } else { $_ }
        }
        if (-not $found) { $updated += "$key=$default" }
        Set-Content $envPath $updated -Encoding UTF8
        Write-Host "$key = $default (varsayilan)" -ForegroundColor Yellow
    } else {
        Write-Host "$key mevcut: $($envVars[$key])" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "--- Ortam Degiskenleri ---" -ForegroundColor Cyan
Set-IfEmpty "TTS_LANGUAGE" "tr"
Set-IfEmpty "TTS_EXAGGERATION" "0.5"
Set-IfEmpty "TTS_CFG_WEIGHT" "0.5"
Set-IfEmpty "TTS_TEMPERATURE" "0.8"
Set-IfEmpty "WORKSPACE_ROOT" "workspace"

# 2. directory structure
Write-Host ""
Write-Host "--- Klasor Yapisi ---" -ForegroundColor Cyan
$dirs = @("workspace","output","logs","assets\raw_pdfs","assets\raw_texts","assets\reference_voices")
foreach ($dir in $dirs) {
    $full = Join-Path $repoRoot $dir
    if (-not (Test-Path $full)) {
        New-Item -ItemType Directory -Path $full | Out-Null
        Write-Host "Olusturuldu: $dir" -ForegroundColor Green
    } else { Write-Host "Mevcut:      $dir" -ForegroundColor Gray }
}

# 3. .NET build (API; TextProcessor.Core transitively)
Write-Host ""
Write-Host "--- .NET Build ---" -ForegroundColor Cyan
$apiProj = Join-Path $repoRoot "src\Api\AudiobookPipeline.Api\AudiobookPipeline.Api.csproj"
if (-not (Test-Path $apiProj)) { Write-Host "HATA: API csproj yok: $apiProj" -ForegroundColor Red; exit 1 }
dotnet build $apiProj
if ($LASTEXITCODE -ne 0) { Write-Host "Build HATASI." -ForegroundColor Red; exit 1 }
Write-Host "Build basarili." -ForegroundColor Green

# 4. npm install (root + ui)
Write-Host ""
Write-Host "--- npm install ---" -ForegroundColor Cyan
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "HATA: node bulunamadi. Node.js v22+ kurun." -ForegroundColor Red; exit 1
}
Push-Location $repoRoot
try {
    npm install
    npm install --prefix src/ui
} finally { Pop-Location }

# 5. summary
Write-Host ""
Write-Host "=== Kurulum Tamamlandi ===" -ForegroundColor Cyan
Write-Host "  TTS kurulumu: .\setup_python.ps1"
Write-Host "  Baslat:       .\start.bat  (veya npm run dev)"
