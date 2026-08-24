$SERVER = "root@64.226.118.40"
$SQL_FILE = "D:\OPEN APPS\DigitalOcian Projects\elnazlawy-system\insert-stores.sql"

Write-Host "=== رفع ملف SQL ===" -ForegroundColor Cyan
scp $SQL_FILE "${SERVER}:/tmp/insert-stores.sql"
Write-Host "SCP exit: $LASTEXITCODE"

Write-Host "`n=== تنفيذ SQL ===" -ForegroundColor Cyan
ssh $SERVER "PGPASSWORD='Elnazlawy2026!Secure' psql -U elnazlawy -h localhost -d elnazlawy_db -f /tmp/insert-stores.sql"
Write-Host "psql exit: $LASTEXITCODE"

Write-Host "`n=== التحقق ===" -ForegroundColor Cyan
ssh $SERVER "PGPASSWORD='Elnazlawy2026!Secure' psql -U elnazlawy -h localhost -d elnazlawy_db -c 'SELECT name, type FROM elhoot.stores ORDER BY name;'"
