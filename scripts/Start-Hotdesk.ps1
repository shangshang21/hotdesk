param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$nodeCommand = Get-Command node -ErrorAction Stop
$nodeVersion = & $nodeCommand.Source --version
if ([int]($nodeVersion.TrimStart('v').Split('.')[0]) -lt 24) { throw 'Hotdesk requires Node.js 24 or newer.' }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules'))) { throw 'Dependencies missing. Run npm ci in this project first.' }
$launchPort = if ($env:HOTDESK_PORT) { [int]$env:HOTDESK_PORT } else { 4317 }
$envFile = Join-Path $projectRoot '.env'
if ((-not $env:HOTDESK_PORT) -and (Test-Path -LiteralPath $envFile)) {
    $portLine = Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^HOTDESK_PORT=(\d+)$' } | Select-Object -First 1
    if ($portLine -match '^HOTDESK_PORT=(\d+)$') { $launchPort = [int]$Matches[1] }
}
$appUrl = "http://127.0.0.1:$launchPort"
$ready = $false
try { $health = Invoke-RestMethod -Uri "$appUrl/api/health" -TimeoutSec 2; $ready = $health.app -eq 'hotdesk-local' } catch {}
if (-not $ready) {
    $logDir = Join-Path $projectRoot 'data'
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    $scriptPath = Join-Path $projectRoot 'src\server.mjs'
    $arguments = @('"--env-file-if-exists=' + $envFile + '"', '"' + $scriptPath + '"')
    $process = Start-Process -FilePath $nodeCommand.Source -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'server.out.log') -RedirectStandardError (Join-Path $logDir 'server.err.log') -PassThru
    @{ pid = $process.Id; script = $scriptPath; port = $launchPort } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $logDir 'server-process.json') -Encoding utf8
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 200
        try { $health = Invoke-RestMethod -Uri "$appUrl/api/health" -TimeoutSec 1; if ($health.app -eq 'hotdesk-local') { $ready = $true; break } } catch {}
        if ($process.HasExited) { break }
    }
}
if (-not $ready) { throw 'Hotdesk failed to start. Check data/server.err.log or whether the port is occupied.' }
Write-Output "Hotdesk is ready: $appUrl"
if (-not $NoBrowser) { Start-Process $appUrl }
