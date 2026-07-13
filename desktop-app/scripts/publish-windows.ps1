$ErrorActionPreference = "Stop"

$repo = $env:GITHUB_REPOSITORY
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$tag = "v$version"
$bundleRoot = Join-Path $PSScriptRoot "../src-tauri/target/release/bundle"

$msi = @(Get-ChildItem (Join-Path $bundleRoot "msi") -Filter "*.msi" -File)
$nsis = @(Get-ChildItem (Join-Path $bundleRoot "nsis") -Filter "*-setup.exe" -File)
if ($msi.Count -ne 1 -or $nsis.Count -ne 1) {
  throw "Expected exactly one MSI and one NSIS installer."
}

$msiFile = $msi[0]
$nsisFile = $nsis[0]
$msiSig = Get-Item "$($msiFile.FullName).sig"
$nsisSig = Get-Item "$($nsisFile.FullName).sig"

gh release upload $tag $msiFile.FullName $msiSig.FullName $nsisFile.FullName $nsisSig.FullName `
  --clobber --repo $repo

$release = gh api "repos/$repo/releases/tags/$tag" | ConvertFrom-Json
$msiAsset = $release.assets | Where-Object { $_.name -like "*_x64_en-US.msi" }
$nsisAsset = $release.assets | Where-Object { $_.name -like "*_x64-setup.exe" }
if (-not $msiAsset -or -not $nsisAsset) {
  throw "Uploaded Windows assets were not found in the GitHub release."
}

$manifestPath = Join-Path $PWD "latest.json"
Invoke-WebRequest "https://github.com/$repo/releases/download/$tag/latest.json" -OutFile $manifestPath
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json

$msiUpdate = [ordered]@{
  signature = (Get-Content $msiSig.FullName -Raw).Trim()
  url = $msiAsset.url
}
$nsisUpdate = [ordered]@{
  signature = (Get-Content $nsisSig.FullName -Raw).Trim()
  url = $nsisAsset.url
}

$manifest.platforms | Add-Member -NotePropertyName "windows-x86_64" -NotePropertyValue $msiUpdate -Force
$manifest.platforms | Add-Member -NotePropertyName "windows-x86_64-msi" -NotePropertyValue $msiUpdate -Force
$manifest.platforms | Add-Member -NotePropertyName "windows-x86_64-nsis" -NotePropertyValue $nsisUpdate -Force
$manifest | ConvertTo-Json -Depth 10 | Set-Content $manifestPath -Encoding utf8

gh release upload $tag $manifestPath --clobber --repo $repo
