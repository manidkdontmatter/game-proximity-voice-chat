$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$livekitExe = Join-Path $root "tools\livekit\livekit-server.exe"

if (-not (Test-Path $livekitExe)) {
  throw "LiveKit server binary not found at: $livekitExe"
}

Write-Host "Starting LiveKit in dev mode..." -ForegroundColor Cyan
Write-Host "Command: $livekitExe --dev" -ForegroundColor DarkGray

& $livekitExe --dev
