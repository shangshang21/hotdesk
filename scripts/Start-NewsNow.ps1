param([switch]$Rebuild)
$ErrorActionPreference = 'Stop'
# Local NewsNow (MIT, github.com/ourongxing/newsnow): hot lists for weibo/zhihu/douyin/toutiao/baidu etc.
# Runs with plain Node, no Docker. First run clones and builds (several minutes); later runs start instantly.
$newsnowTag = 'v0.0.42'
$pnpm = 'pnpm@10.30.3'
$port = 4444
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$vendorDir = Join-Path $projectRoot 'vendor\newsnow'
$serverScript = Join-Path $vendorDir 'dist\output\server\index.mjs'
$logDir = Join-Path $projectRoot 'data'
$apiUrl = "http://127.0.0.1:$port/api/s?id=baidu"
$nodeCommand = Get-Command node -ErrorAction Stop
if ([int]((& $nodeCommand.Source --version).TrimStart('v').Split('.')[0]) -lt 20) { throw 'NewsNow requires Node.js 20 or newer.' }

try { $probe = Invoke-RestMethod -Uri $apiUrl -TimeoutSec 5; if ($probe.items) { Write-Output "NewsNow is already running: http://127.0.0.1:$port"; exit } } catch {}

if (-not (Test-Path -LiteralPath $vendorDir)) {
    Get-Command git -ErrorAction Stop | Out-Null
    Write-Output "Cloning NewsNow $newsnowTag ..."
    git clone --depth 1 --branch $newsnowTag https://github.com/ourongxing/newsnow.git $vendorDir
    if ($LASTEXITCODE -ne 0) { throw 'git clone failed. Check network access to github.com.' }
}
if ($Rebuild -or -not (Test-Path -LiteralPath $serverScript)) {
    Push-Location $vendorDir
    try {
        Write-Output 'Installing NewsNow dependencies (first run takes a few minutes) ...'
        npx -y $pnpm install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) { throw 'pnpm install failed.' }
        Write-Output 'Building NewsNow ...'
        npx -y $pnpm run build
        if ($LASTEXITCODE -ne 0) { throw 'NewsNow build failed.' }
    } finally { Pop-Location }
}

New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$env:HOST = '127.0.0.1'; $env:PORT = "$port"; $env:NODE_ENV = 'production'
$process = Start-Process -FilePath $nodeCommand.Source -ArgumentList @('"' + $serverScript + '"') -WorkingDirectory $vendorDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'newsnow.out.log') -RedirectStandardError (Join-Path $logDir 'newsnow.err.log') -PassThru
@{ pid = $process.Id; script = $serverScript; port = $port } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $logDir 'newsnow-process.json') -Encoding utf8
for ($attempt = 0; $attempt -lt 60; $attempt++) {
    Start-Sleep -Milliseconds 500
    try { $probe = Invoke-RestMethod -Uri $apiUrl -TimeoutSec 5; if ($probe.items) { Write-Output "NewsNow is ready: http://127.0.0.1:$port (Hotdesk uses http://127.0.0.1:$port/api/s)"; exit } } catch {}
    if ($process.HasExited) { break }
}
throw 'NewsNow failed to start. Check data/newsnow.err.log or whether port 4444 is occupied.'
