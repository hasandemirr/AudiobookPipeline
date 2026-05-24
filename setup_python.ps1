$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
$env:PYTHONWARNINGS = "ignore"


Write-Host ""
Write-Host "=== AudiobookPipeline Python/TTS Kurulum ===" -ForegroundColor Cyan
Write-Host "Repo koku: $repoRoot"

# 0. prerequisites
$envPath = Join-Path $repoRoot ".env"
if (-not (Test-Path $envPath)) { Write-Host "HATA: .env yok. Once .\setup.ps1 calistirin." -ForegroundColor Red; exit 1 }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Write-Host "HATA: git bulunamadi." -ForegroundColor Red; exit 1 }

# Python 3.11 (py launcher)
Write-Host ""
Write-Host "--- Python 3.11 Tespiti ---" -ForegroundColor Cyan
$py311 = $false
try { $v = & py -3.11 --version 2>&1; if ($LASTEXITCODE -eq 0) { $py311 = $true; Write-Host "Bulundu: $v" -ForegroundColor Green } } catch {}
if (-not $py311) {
    Write-Host "HATA: Python 3.11 bulunamadi (py -3.11). python.org/downloads'tan kurun." -ForegroundColor Red; exit 1
}

# 1. venv
$venvDir = Join-Path $repoRoot "venv"
$venvPy  = Join-Path $venvDir "Scripts\python.exe"
if (-not (Test-Path $venvPy)) {
    Write-Host "venv olusturuluyor: $venvDir" -ForegroundColor Yellow
    & py -3.11 -m venv $venvDir
    if ($LASTEXITCODE -ne 0) { Write-Host "HATA: venv olusturulamadi." -ForegroundColor Red; exit 1 }
} else { Write-Host "venv mevcut." -ForegroundColor Green }

function Pip { param([string[]]$a) & $venvPy -m pip @a; if ($LASTEXITCODE -ne 0) { throw "pip $($a -join ' ') basarisiz" } }

# 2. pip toolchain
Write-Host ""; Write-Host "--- pip/setuptools/wheel ---" -ForegroundColor Cyan
Pip @("install","--upgrade","pip","setuptools","wheel")

# 3. numpy FIRST (pkuseg build bagimliligi)
Write-Host ""; Write-Host "--- numpy ---" -ForegroundColor Cyan
Pip @("install","numpy")

# 4. torch + torchaudio (cu121)
Write-Host ""; Write-Host "--- torch + torchaudio (cu121) ---" -ForegroundColor Cyan
Pip @("install","torch","torchaudio","--index-url","https://download.pytorch.org/whl/cu121")

# 5. clone chatterbox (resemble-ai)
Write-Host ""; Write-Host "--- Chatterbox klon ---" -ForegroundColor Cyan
$cbDir = Join-Path $repoRoot "chatterbox"
if (-not (Test-Path (Join-Path $cbDir ".git"))) {
    & git clone https://github.com/resemble-ai/chatterbox.git $cbDir
    if ($LASTEXITCODE -ne 0) { Write-Host "HATA: clone basarisiz." -ForegroundColor Red; exit 1 }
} else { Write-Host "chatterbox/ mevcut, klon atlandi." -ForegroundColor Green }

# 6. editable install (torch'u pyproject pinine gore degistirebilir)
Write-Host ""; Write-Host "--- Chatterbox editable install ---" -ForegroundColor Cyan
Pip @("install","-e",$cbDir)

# 6b. service deps (torch'suz; reconcile bunu da kapsar)
Write-Host ""; Write-Host "--- Service deps (requirements.txt) ---" -ForegroundColor Cyan
$reqFile = Join-Path $repoRoot "requirements.txt"
if (Test-Path $reqFile) { Pip @("install","-r",$reqFile) }
else { Write-Host "UYARI: requirements.txt yok, atlandi." -ForegroundColor Yellow }

# 7. CUDA dogrulama / torch reconcile (chatterbox -e VE requirements sonrasi)
Write-Host ""; Write-Host "--- CUDA dogrulama ---" -ForegroundColor Cyan
$cuda = (& $venvPy -c "import torch; print(torch.cuda.is_available())" 2>$null)
Write-Host "torch.cuda.is_available() = $cuda"
if ("$cuda".Trim() -ne "True") {
    Write-Host "CUDA yok -> cu121 force-reinstall..." -ForegroundColor Yellow
    Pip @("uninstall","-y","torch","torchaudio")
    Pip @("install","torch","torchaudio","--index-url","https://download.pytorch.org/whl/cu121")
    $cuda = (& $venvPy -c "import torch; print(torch.cuda.is_available())" 2>$null)
    Write-Host "Tekrar: torch.cuda.is_available() = $cuda"
}

# 8. .env yazimi (absolute, makineye ozgu)
Write-Host ""; Write-Host "--- .env yazimi ---" -ForegroundColor Cyan
$cbSrc = Join-Path $cbDir "src"
function Set-EnvVar {
    param($key, $value)
    $content = Get-Content $envPath
    $found = $false
    $updated = $content | ForEach-Object { if ($_ -match "^$key=") { $found = $true; "$key=$value" } else { $_ } }
    if (-not $found) { $updated += "$key=$value" }
    Set-Content $envPath $updated -Encoding UTF8
    Write-Host "$key=$value" -ForegroundColor Green
}
Set-EnvVar "CHATTERBOX_SRC" $cbSrc
Set-EnvVar "PYTHON_VENV" $venvPy

# 9. import dogrulama
Write-Host ""; Write-Host "--- Chatterbox import dogrulama ---" -ForegroundColor Cyan
$imp = (& $venvPy -c "import sys; sys.path.insert(0, r'$cbSrc'); from chatterbox.mtl_tts import ChatterboxMultilingualTTS; print('Chatterbox import: OK')" 2>$null)
Write-Host $imp

Write-Host ""
Write-Host "=== Python Kurulum Tamamlandi ===" -ForegroundColor Cyan
Write-Host "Model agirliklari ilk gercek render'da indirilir (~GB)."
