$ErrorActionPreference = "Stop"

$livekitScript = Join-Path $PSScriptRoot "start-livekit.ps1"
$controlScript = Join-Path $PSScriptRoot "start-control.ps1"

Write-Host "Opening LiveKit and control plane in separate windows..." -ForegroundColor Cyan

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-File", "`"$livekitScript`""
)

Start-Sleep -Seconds 1

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-File", "`"$controlScript`""
)

Write-Host "Both processes launched." -ForegroundColor Green
Write-Host "Then open: http://127.0.0.1:8080/debug" -ForegroundColor Yellow
