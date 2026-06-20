@echo off
REM ============================================================
REM   销售客户地图管理系统 - 一键启动（Windows）
REM ============================================================
setlocal
cd /d %~dp0

echo.
echo ===== 销售客户地图管理系统 启动中 =====
echo.

REM ---------- Step 1: 检查 / 初始化数据库 ----------
echo [1/3] 检查数据库环境...
echo   - 如果提示 "无法连接 PostgreSQL"，请先安装并启动 PostgreSQL
echo   - 如果提示数据库创建失败，请确认 postgres 用户密码为 postgres
echo.

cd /d %~dp0\backend
call npm run init-env
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] 数据库初始化失败，请检查上面的错误信息后重试。
    pause
    exit /b 1
)

REM ---------- Step 2: 启动后端 ----------
echo.
echo [2/3] 启动后端服务 (端口 3000)...
start "customer-map-backend" cmd /k "cd /d %~dp0\backend && npm start"

echo   等待后端启动...
timeout /t 4 /nobreak >nul

REM ---------- Step 3: 启动前端 ----------
echo [3/3] 启动前端开发服务 (端口 5173)...
start "customer-map-frontend" cmd /k "cd /d %~dp0\frontend && npm run dev"

echo.
echo ===== 启动完成 =====
echo   前端地址: http://localhost:5173
echo   默认账号: admin / admin123456
echo   后端健康检查: http://localhost:3000/api/health
echo.
echo   等待 8 秒后自动打开浏览器...
timeout /t 8 /nobreak >nul
start http://localhost:5173

pause
