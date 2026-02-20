$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$envFile = Join-Path $PSScriptRoot "control.env"

if (-not (Test-Path $envFile)) {
  throw "Missing env file: $envFile"
}

Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) {
    return
  }

  $idx = $line.IndexOf("=")
  if ($idx -le 0) {
    return
  }

  $key = $line.Substring(0, $idx).Trim()
  $value = $line.Substring($idx + 1)
  [Environment]::SetEnvironmentVariable($key, $value, "Process")
}

Write-Host "Loaded env from $envFile" -ForegroundColor Cyan
Write-Host "Starting control plane..." -ForegroundColor Cyan

Push-Location $root
try {
  npm run -w @manidkdontmatter/proximity-voice-control dev
} finally {
  Pop-Location
}
