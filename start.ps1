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
$devProc = $null
try {
    # cmd.exe sarmali: taskkill /T tum agaci (npm -> concurrently -> dotnet/vite) oldurur
    $devProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm run dev" -PassThru -NoNewWindow
    $devProc.WaitForExit()
} finally {
    Pop-Location
    Stop-Job   $healthJob -ErrorAction SilentlyContinue
    Remove-Job $healthJob -ErrorAction SilentlyContinue
    # Dev surec agacini oldur
    if ($devProc) { taskkill /PID $devProc.Id /T /F 2>$null | Out-Null }
    # Fallback: orphan kalmissa dev portlarini bosalt (Windows dotnet run alt sureci)
    foreach ($port in 5000, 5173) {
        Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
            ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    }
}
