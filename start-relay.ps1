$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$relayCandidates = @((Get-Command node -ErrorAction SilentlyContinue).Source)
$relayBundled = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$relayCandidates += $relayBundled
$relayNode = $null
foreach ($relayCandidate in $relayCandidates) {
  if (-not $relayCandidate -or -not (Test-Path -LiteralPath $relayCandidate)) { continue }
  $relayVersionText = & $relayCandidate --version
  $relayVersion = [version]($relayVersionText.TrimStart('v'))
  if ($relayVersion -ge [version]'22.22.2') { $relayNode = $relayCandidate; break }
}
if (-not $relayNode) { throw 'Install Node.js 22.22.2 or newer (Node.js 24 recommended).' }
$env:PATH = (Split-Path $relayNode) + ';' + $env:PATH
$relayNpm = Join-Path (Split-Path (Get-Command npm.cmd).Source) 'node_modules\npm\bin\npm-cli.js'
if (-not (Test-Path -LiteralPath 'node_modules\@raycast\api')) {
  & $relayNode $relayNpm ci
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
& $relayNode $relayNpm run dev
exit $LASTEXITCODE
