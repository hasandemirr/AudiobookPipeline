$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot

Write-Host ""
Write-Host "=== AudiobookPipeline Kurulum ===" -ForegroundColor Cyan
Write-Host "Repo koku: $repoRoot"
Write-Host ""

# 1. .env yonetimi
$envPath = Join-Path $repoRoot ".env"
$envExamplePath = Join-Path $repoRoot ".env.example"

if (-not (Test-Path $envPath)) {
    Write-Host ".env dosyasi bulunamadi. Olusturuluyor..." -ForegroundColor Yellow
    Copy-Item $envExamplePath $envPath
    Write-Host ".env.example -> .env kopyalandi." -ForegroundColor Green
} else {
    Write-Host ".env dosyasi mevcut." -ForegroundColor Green
}

# .env oku
$envVars = @{}
if (Test-Path $envPath) {
    Get-Content $envPath | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line -contains "=") {
            $parts = $line -split "=", 2
            $envVars[$parts[0].Trim()] = $parts[1].Trim()
        }
    }
}

# 2. Zorunlu degerleri kontrol et ve sor
function Ask-IfEmpty {
    param($key, $prompt, $default = "")
    $current = $envVars[$key]
    if ([string]::IsNullOrWhiteSpace($current)) {
        if ($default) {
            # Non-interactive fallback: use default
            $input = $default
            Write-Host "$key bos, varsayilan kullaniliyor: $input" -ForegroundColor Yellow
        } else {
            # This might still hang in non-interactive shells
            Write-Host "$prompt" -ForegroundColor White
            $input = Read-Host
        }
        
        $envVars[$key] = $input
        
        # .env dosyasini guncelle
        if (Test-Path $envPath) {
            $content = Get-Content $envPath
            $found = $false
            $updated = $content | ForEach-Object {
                if ($_ -match "^$key=") { 
                    $found = $true
                    "$key=$input" 
                } else { 
                    $_ 
                }
            }
            if (-not $found) {
                $updated += "$key=$input"
            }
            Set-Content $envPath $updated -Encoding UTF8
        }
    } else {
        Write-Host "$key mevcut: $current" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "--- Ortam Degiskenleri ---" -ForegroundColor Cyan

Ask-IfEmpty "TTS_LANGUAGE"     "Varsayilan TTS dili" "tr"
Ask-IfEmpty "TTS_EXAGGERATION" "TTS exaggeration (0.1-2.0)" "0.5"
Ask-IfEmpty "TTS_CFG_WEIGHT"   "TTS cfg_weight (0.1-1.0)" "0.5"
Ask-IfEmpty "TTS_TEMPERATURE"  "TTS temperature (0.1-2.0)" "0.8"
Ask-IfEmpty "WORKSPACE_ROOT"   "Workspace klasoru (varsayilan: workspace)" "workspace"

# 3. Klasor yapisi
Write-Host ""
Write-Host "--- Klasor Yapisi ---" -ForegroundColor Cyan

$dirs = @(
    "workspace",
    "output",
    "logs",
    "assets\raw_pdfs",
    "assets\raw_texts",
    "assets\reference_voices"
)

foreach ($dir in $dirs) {
    $fullPath = Join-Path $repoRoot $dir
    if (-not (Test-Path $fullPath)) {
        New-Item -ItemType Directory -Path $fullPath | Out-Null
        Write-Host "Olusturuldu: $dir" -ForegroundColor Green
    } else {
        Write-Host "Mevcut:      $dir" -ForegroundColor Gray
    }
}

# 4. .NET build
Write-Host ""
Write-Host "--- .NET Build ---" -ForegroundColor Cyan

$csprojPath = Join-Path $repoRoot `
    "src\TextProcessor\AudiobookPipeline.TextProcessor"

if (Test-Path $csprojPath) {
    Push-Location $csprojPath
    try {
        Write-Host "dotnet restore..." -ForegroundColor Yellow
        dotnet restore | Out-Null
        Write-Host "dotnet build..." -ForegroundColor Yellow
        $buildOutput = dotnet build --no-restore 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Build basarili." -ForegroundColor Green
        } else {
            Write-Host "Build HATASI:" -ForegroundColor Red
            Write-Host $buildOutput
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "WARN: .NET proje klasoru bulunamadi." -ForegroundColor Yellow
}

# 5. Ozet
Write-Host ""
Write-Host "=== Kurulum Tamamlandi ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Sonraki adimlar:" -ForegroundColor White
Write-Host "  PDF extract icin:"
Write-Host "    cd src\TextProcessor\AudiobookPipeline.TextProcessor"
Write-Host "    dotnet run -- <pdf_yolu> <book_slug>"
Write-Host ""
Write-Host "  TTS makinesi icin:"
Write-Host "    .\setup_python.ps1"
Write-Host ""
