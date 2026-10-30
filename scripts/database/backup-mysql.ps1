<#
  Sauvegarde logique de la base MySQL (Docker Compose) dans backups\.
  Usage :  powershell -File scripts\backup-mysql.ps1 [-OutDir backups]
  La sauvegarde est faite dans le conteneur puis copiée : pas de problème d'encodage PowerShell.
#>
param([string]$OutDir = "backups")
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force $OutDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$target = Join-Path $OutDir "hok_scrim-$stamp.sql"
docker compose exec -T mysql sh -c 'mysqldump --single-transaction --no-tablespaces --default-character-set=utf8mb4 -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" > /tmp/hok-backup.sql 2>/dev/null'
if ($LASTEXITCODE -ne 0) { throw "mysqldump a échoué (le conteneur mysql tourne-t-il ?)" }
docker compose cp mysql:/tmp/hok-backup.sql $target
docker compose exec -T mysql rm -f /tmp/hok-backup.sql
if (-not (Select-String -Path $target -Pattern "Dump completed" -Quiet)) { throw "Sauvegarde incomplète : $target" }
Write-Host "Sauvegarde OK : $target ($([math]::Round((Get-Item $target).Length / 1KB)) Ko)"
