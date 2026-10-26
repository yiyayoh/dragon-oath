$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js was not found. Install Node.js before starting the local game.' }
if (-not (Get-Command codex -ErrorAction SilentlyContinue)) { throw 'Codex was not found. Install Codex and sign in with your ChatGPT account first.' }
$gameAddress = 'http://127.0.0.1:8787/'
$alreadyRunning = $false
try {
  $status = Invoke-RestMethod -Uri ($gameAddress + '__gpt/status') -TimeoutSec 8
  $alreadyRunning = $status.available -eq $true
} catch {}
if ($alreadyRunning) {
  Start-Process $gameAddress
  Write-Host 'The local game is already running. The browser has been opened.'
  exit 0
}
# This is the visible game window requested by the launcher; browser/profile defaults stay with the user.
$openBrowser = Start-Job -ArgumentList $gameAddress -ScriptBlock {
  param($address)
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try { $response = Invoke-WebRequest -Uri $address -UseBasicParsing -TimeoutSec 1; if ($response.StatusCode -eq 200) { Start-Process $address; return } } catch {}
    Start-Sleep -Milliseconds 350
  }
}
try { & node (Join-Path $PSScriptRoot 'local-server.mjs') }
finally { Stop-Job $openBrowser -ErrorAction SilentlyContinue; Remove-Job $openBrowser -Force -ErrorAction SilentlyContinue }
