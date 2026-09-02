# start-all.ps1 - miniTrek one-click launcher (frontend / backend / 12306 proxy)
# Usage: powershell -ExecutionPolicy Bypass -File "D:\AI\DouBao\01 miniTrek\start-all.ps1"
$ErrorActionPreference = 'Stop'
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "[miniTrek] starting 3 services ..." -ForegroundColor Cyan

# 1) backend 8288 (REST + MCP, token via env)
$env:MINITREK_MCP_TOKEN = "test-token-123"
Start-Process node -ArgumentList "--import","tsx","src/index.ts" `
  -WorkingDirectory (Join-Path $ROOT "server") -WindowStyle Hidden

# 2) frontend 5173 (vite dev)
Start-Process node -ArgumentList "node_modules/vite/bin/vite.js" `
  -WorkingDirectory (Join-Path $ROOT "web") -WindowStyle Hidden

# 3) 12306 proxy 9999 (use system npx.cmd to avoid sandbox npx conflict)
$npx = "C:\Program Files\nodejs\npx.cmd"
if (-not (Test-Path $npx)) { $npx = "npx.cmd" }
Start-Process -FilePath $npx -ArgumentList "-y","12306-mcp","--port","9999" `
  -WorkingDirectory (Join-Path $ROOT "server") -WindowStyle Hidden

Start-Sleep 6
Write-Host "[miniTrek] port listening status:" -ForegroundColor Cyan
netstat -ano | findstr "LISTENING" | findstr ":5173 :8288 :9999"
Write-Host ""
Write-Host "[miniTrek] open http://localhost:5173" -ForegroundColor Green
