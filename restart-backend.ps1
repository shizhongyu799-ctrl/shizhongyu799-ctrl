# Kill old process
Get-Process -Id 38680 -ErrorAction SilentlyContinue | Stop-Process -Force

# Wait a bit
Start-Sleep -Seconds 2

# Start backend
cd "e:\想法\测试地图\backend"
node src/app.js
