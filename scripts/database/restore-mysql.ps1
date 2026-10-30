<#
  Restaure une sauvegarde créée par backup-mysql.ps1. ATTENTION : remplace les tables existantes.
  Usage :  powershell -File scripts\restore-mysql.ps1 -File backups\hok_scrim-YYYYMMDD-HHMMSS.sql -Yes
  Arrêtez l'application avant (docker compose stop hok-scrim-lab).
#>
param([Parameter(Mandatory = $true)][string]$File, [switch]$Yes)
$ErrorActionPreference = "Stop"
if (-not (Test-Path $File)) { throw "Fichier introuvable : $File" }
if (-not $Yes) { throw "Ajoutez -Yes pour confirmer le remplacement des données actuelles." }
docker compose cp $File mysql:/tmp/hok-restore.sql
docker compose exec -T mysql sh -c 'mysql --default-character-set=utf8mb4 -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" < /tmp/hok-restore.sql 2>/dev/null && rm -f /tmp/hok-restore.sql'
if ($LASTEXITCODE -ne 0) { throw "La restauration a échoué." }
Write-Host "Restauration terminée depuis $File"
