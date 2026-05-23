$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot

$envPath = Join-Path $repoRoot ".env"
if (-not (Test-Path $envPath)) {
    Write-Host "HATA: .env yok. Once setup.bat calistirin." -ForegroundColor Red; exit 1
}

$apiHealth = "http://localhost:5000/api/health"
$uiUrl     = "http://localhost:5173"

# Background: API saglikli olunca tarayiciyi ac
$healthJob = Start-Job -ScriptBlock {
    param($apiHealth, $uiUrl)
    for ($i = 0; $i -lt 60; $i++) {
        try {
            $r = Invoke-WebRequest -Uri $apiHealth -UseBasicParsing -TimeoutSec 2
            if ($r.StatusCode -eq 200) { Start-Process $uiUrl; return }
        } catch {}
        Start-Sleep -Seconds 1
    }
} -ArgumentList $apiHealth, $uiUrl

Write-Host "API + UI baslatiliyor (npm run dev). Durdurmak icin Ctrl+C." -ForegroundColor Cyan
Push-Location $repoRoot
try {
    npm run dev
} finally {
    Pop-Location
    Stop-Job   $healthJob -ErrorAction SilentlyContinue
    Remove-Job $healthJob -ErrorAction SilentlyContinue
}
