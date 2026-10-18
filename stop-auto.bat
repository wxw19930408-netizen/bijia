@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/browser/close' -Method Post -TimeoutSec 15 | Out-Null } catch {}; $line = netstat -ano | Select-String '127\.0\.0\.1:8787\s+0\.0\.0\.0:0\s+LISTENING' | Select-Object -First 1; if ($line) { $processId = [int](($line.ToString() -split '\s+')[-1]); $process = Get-Process -Id $processId -ErrorAction SilentlyContinue; if ($process -and $process.ProcessName -eq 'node') { Stop-Process -Id $processId -Force; Write-Host 'Stopped local price desk.' } else { Write-Host 'Port 8787 is used by another process; not stopping it.' } } else { Write-Host 'Price desk is not running.' }"
pause
