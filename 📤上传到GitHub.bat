@echo off
chcp 65001 >nul
echo ============================================================
echo          上传项目到 GitHub - 销售客户地图管理系统
echo ============================================================
echo.
echo [信息] 本地代码已准备就绪，正在连接 GitHub...
echo [信息] 仓库地址: https://github.com/shizhongyu799-ctrl/shizhongyu799-ctrl
echo.
cd /d "%~dp0"

REM 检查 git 是否可用
where git >nul 2>&1
if errorlevel 1 (
    echo [错误] 系统未检测到 Git，请先安装 Git: https://git-scm.com/download/win
    pause
    exit /b 1
)

REM 检查仓库状态
git remote get-url origin >nul 2>&1
if errorlevel 1 (
    echo [信息] 首次推送，配置远程仓库...
    git init
    git add .
    git commit -m "Initial commit: 销售客户地图管理系统"
    git remote add origin "https://github.com/shizhongyu799-ctrl/shizhongyu799-ctrl.git"
)

echo [步骤 1/2] 推送代码到 GitHub master 分支...
echo.
git push -u origin master

if errorlevel 1 (
    echo.
    echo [错误] 推送失败！
    echo.
    echo 可能的原因:
    echo   1. 网络连接问题 - 请检查网络是否可以访问 github.com
    echo   2. GitHub 认证问题 - 需要配置 Git Credential Manager
    echo   3. 仓库权限问题 - 请确认你是该仓库的所有者
    echo.
    echo 解决方案:
    echo   - 在 Windows 凭据管理器中添加 GitHub 凭据
    echo   - 或使用 GitHub Desktop: https://desktop.github.com
    echo   - 或创建 Personal Access Token: https://github.com/settings/tokens
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo              成功！代码已上传到 GitHub
echo ============================================================
echo.
echo 仓库地址: https://github.com/shizhongyu799-ctrl/shizhongyu799-ctrl
echo.
echo 你可以在浏览器中打开上面的地址查看代码！
echo.
pause
