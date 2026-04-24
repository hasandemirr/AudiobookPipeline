$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot

Write-Host ""
Write-Host "=== AudiobookPipeline Python/TTS Kurulum ===" -ForegroundColor Cyan
Write-Host "Repo koku: $repoRoot"
Write-Host ""

# 1. .env kontrol
$envPath = Join-Path $repoRoot ".env"
if (-not (Test-Path $envPath)) {
    Write-Host "HATA: .env bulunamadi." -ForegroundColor Red
    Write-Host "Once .\setup.ps1 calistirin." -ForegroundColor Yellow
    exit 1
}

# .env oku
$envVars = @{}
Get-Content $envPath | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line -contains "=") {
        $parts = $line -split "=", 2
        $envVars[$parts[0].Trim()] = $parts[1].Trim()
    }
}

function Ask-AndSave {
    param($key, $prompt, $default = "")
    $current = $envVars[$key]
    if ([string]::IsNullOrWhiteSpace($current)) {
        if ($default) {
            $input = $default
            Write-Host "$key bos, varsayilan kullaniliyor: $input" -ForegroundColor Yellow
        } else {
            Write-Host "$prompt" -ForegroundColor White
            $input = Read-Host
        }
        $envVars[$key] = $input
        $content = Get-Content $envPath
        $found = $false
        $updated = $content | ForEach-Object {
            if ($_ -match "^$key=") { $found = $true; "$key=$input" }
            else { $_ }
        }
        if (-not $found) { $updated += "$key=$input" }
        Set-Content $envPath $updated -Encoding UTF8
        Write-Host "$key kaydedildi." -ForegroundColor Green
        return $input
    } else {
        Write-Host "$key mevcut: $current" -ForegroundColor Green
        return $current
    }
}

# 2. Chatterbox src yolu
Write-Host "--- Chatterbox Kurulum Yolu ---" -ForegroundColor Cyan
$chatterboxSrc = Ask-AndSave "CHATTERBOX_SRC" `
    "Chatterbox src klasoru" `
    "C:\AI\chatterbox\src"

if (-not (Test-Path $chatterboxSrc)) {
    Write-Host "WARN: $chatterboxSrc bulunamadi." -ForegroundColor Yellow
}

# 3. Python venv yolu
Write-Host ""
Write-Host "--- Python Venv ---" -ForegroundColor Cyan
$pythonExe = Ask-AndSave "PYTHON_VENV" `
    "Python exe yolu (venv icindeki)" `
    "C:\AI\chatterbox\venv\Scripts\python.exe"

if (-not (Test-Path $pythonExe)) {
    Write-Host "WARN: $pythonExe bulunamadi." -ForegroundColor Yellow
}

# 4. CUDA kontrol
Write-Host ""
Write-Host "--- CUDA Kontrol ---" -ForegroundColor Cyan
if (Test-Path $pythonExe) {
    try {
        $cudaCheck = & $pythonExe -c "import torch; print('CUDA:', torch.cuda.is_available())" 2>&1
        Write-Host $cudaCheck
    } catch {
        Write-Host "CUDA kontrolu yapılamadı." -ForegroundColor Yellow
    }
}

# 5. Chatterbox import kontrol
Write-Host ""
Write-Host "--- Chatterbox Import Kontrol ---" -ForegroundColor Cyan
if ((Test-Path $pythonExe) -and (Test-Path $chatterboxSrc)) {
    $pythonCmd = "import sys; sys.path.insert(0, r'$chatterboxSrc'); " +
                 "try: from chatterbox.mtl_tts import ChatterboxMultilingualTTS; print('Chatterbox import: OK') " +
                 "except Exception as e: print(f'Chatterbox import HATA: {e}')"
    $importCheck = & $pythonExe -c $pythonCmd 2>&1
    Write-Host $importCheck
}

# 6. Sanity test
Write-Host ""
Write-Host "--- Sanity Test ---" -ForegroundColor Cyan
if (Test-Path $pythonExe) {
    Write-Host "Sanity test calistirilsin mi? (E/H) [H]"
    $runTest = "H"
    if ($runTest -eq "E" -or $runTest -eq "e") {
        $scriptPath = Join-Path $repoRoot "scripts\sanity_test.py"
        & $pythonExe $scriptPath
    } else {
        Write-Host "Sanity test atlanıyor." -ForegroundColor Gray
    }
}

# 7. Ozet
Write-Host ""
Write-Host "=== Python Kurulum Tamamlandi ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Calistirmak icin (repo kokunden):"
Write-Host "  $pythonExe scripts\chunk_text.py [txt] [slug]"
Write-Host "  $pythonExe scripts\render_chunks.py [slug]"
Write-Host "  $pythonExe scripts\merge_audio.py [slug]"
Write-Host ""
