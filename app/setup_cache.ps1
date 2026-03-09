# Setup local electron-builder cache directory
$cachePath = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
if (Test-Path $cachePath) {
    Remove-Item $cachePath -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $cachePath

Write-Host "Downloading winCodeSign from custom mirror..."
Invoke-WebRequest -Uri "https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z" -OutFile "$cachePath\winCodeSign.7z"

Write-Host "Extracting 7z..."
& "C:\Program Files\7-Zip\7z.exe" x "$cachePath\winCodeSign.7z" -o"$cachePath" -y

Write-Host "Fixing folder structure..."
# 7z extracts to winCodeSign-2.6.0, but electron builder looks directly inside winCodeSign-2.6.0 instead
if (Test-Path "$cachePath\winCodeSign-2.6.0") {
   Rename-Item -Path "$cachePath\winCodeSign-2.6.0" -NewName "winCodeSign-2.6.0-target"
   Move-Item -Path "$cachePath\winCodeSign-2.6.0-target" -Destination "$cachePath\winCodeSign-2.6.0"
}

Write-Host "Done!"
