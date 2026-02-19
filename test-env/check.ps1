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

Push-Location $root
try {
  npm run smoke
  npm run e2e:policy
} finally {
  Pop-Location
}
