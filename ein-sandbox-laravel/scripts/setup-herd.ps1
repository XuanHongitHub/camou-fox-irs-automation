$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot\..

if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
}

composer install --no-interaction

php artisan key:generate --force

Write-Host 'Setup xong. Mo bang Herd URL hoac chay: php artisan serve --host=127.0.0.1 --port=8010'
