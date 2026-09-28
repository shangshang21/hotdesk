$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$recordPath = Join-Path $projectRoot 'data\newsnow-process.json'
if (-not (Test-Path -LiteralPath $recordPath)) { Write-Output 'No NewsNow process record.'; exit }
$record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
$expectedScript = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'vendor\newsnow\dist\output\server\index.mjs'))
if ($record.script -ne $expectedScript) { throw 'Process record does not belong to this project.' }
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$record.pid)"
if ($process) {
    if (($process.Name -ne 'node.exe') -or (-not $process.CommandLine.Contains($expectedScript))) { throw 'Process identity changed; refusing to stop it.' }
    Stop-Process -Id ([int]$record.pid)
    Write-Output 'NewsNow stopped.'
} else { Write-Output 'NewsNow is already stopped.' }
