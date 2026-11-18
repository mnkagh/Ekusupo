$ErrorActionPreference = 'Stop'
$files = Get-ChildItem -Path . -Recurse -File -Filter '*.*' -Exclude '.git/*', 'node_modules/*', 'dist/*', 'build/*', 'coverage/*' | Where-Object { $_.FullName -notmatch '\\(node_modules|dist|build|coverage|\.git)\\' }
$patterns = @(
  'AKIA[0-9A-Z]{16}',
  'sk_live_[0-9a-zA-Z]{24,}',
  'ghp_[0-9A-Za-z]{36,}',
  'xox[baprs]-[0-9A-Za-z-]{10,}'
)
$found = @()
foreach ($file in $files) {
  if ($file.FullName -match '\\(node_modules|dist|build|coverage|\.git)\\') { continue }
  $content = Get-Content -Raw -LiteralPath $file.FullName
  foreach ($pattern in $patterns) {
    if ($content -match $pattern) { $found += "$($file.FullName): $pattern" }
  }
}
if ($found.Count -gt 0) {
  $found | ForEach-Object { Write-Output $_ }
  exit 1
}
exit 0
