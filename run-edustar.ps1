Set-Location $PSScriptRoot
$backend = Join-Path $PSScriptRoot 'edustar-backend.mjs'
$homeUrl = 'http://127.0.0.1:3000/edustar-home.html'

Start-Process node -ArgumentList $backend -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
Start-Process $homeUrl
Write-Host "EduStar backend started at $homeUrl"
