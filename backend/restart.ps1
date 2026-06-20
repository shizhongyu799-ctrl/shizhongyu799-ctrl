# Kill old process
Get-Process -Id 38680 -ErrorAction SilentlyContinue | Stop-Process -Force

# Wait a bit
Start-Sleep -Seconds 2

# Start backend - use current location (run from backend directory)
node src/app.js
