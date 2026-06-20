@echo off
chcp 65001 >nul
echo ====================================
echo   一键推送到 GitHub
echo ====================================
echo.

where git >nul 2>&1
if errorlevel 1 (
    echo [错误] 找不到 git 未检测到 Git，请先安装 Git
    pause
    exit /b 1
)

cd /d "%~dp0"

echo 当前目录: %CD%
echo.

REM 检查本地 git 状态
git status --short >nul 2>&1
if errorlevel 1 (
    echo [警告] 当前目录不是 git 仓库，正在初始化...
    git init
    git add .
    git commit -m "Initial commit"
)

echo.
echo ============================================
echo  请输入你的 GitHub Personal Access Token
echo  （获取方式：GitHub.com -> Settings -> Developer settings -> Personal access tokens
echo    -> Generate new token -> 勾选 repo -> 生成并复制）
echo ============================================
echo.

set /p TOKEN=请粘贴你的 GitHub Token:
if "%TOKEN%"=="" (
    echo [错误] Token 不能为空
    pause
    exit /b 1
)

echo.
echo [步骤 1/3] 创建 GitHub 仓库 shizhongyu799-ctrl ...
curl -s -L ^
    -u "shizhongyu799-ctrl:%TOKEN%" ^
    -H "Accept: application/vnd.github+json" ^
    -H "X-GitHub-Api-Version: 2022-11-28" ^
    -d "{\"name\":\"shizhongyu799-ctrl\",\"description\":\"销售客户地图管理系统 - 完整项目\",\"private\",\"\private\":false,\"has_issues\":true,\"has_wiki\":true}" ^
    https://api.github.com/user/repos >nul 2>&1

if errorlevel 1 (
    echo [警告] 创建仓库失败（可能已存在或 Token 错误），继续尝试推送...
) else (
    echo ✓ 仓库创建成功
)

echo.
echo [步骤 2/3] 配置远程仓库地址...
git remote remove origin >nul 2>&1
git remote add origin "https://shizhongyu799-ctrl:%TOKEN%@github.com/shizhongyu799-ctrl/shizhongyu799-ctrl.git"

echo.
echo [步骤 3/3] 推送代码到 GitHub...
git push -u origin master

if errorlevel 1 (
    echo.
    echo [错误] 推送失败
    echo.
    echo 常见原因:
    echo   1. Token 错误或没有 repo 权限
    echo   2. 仓库已存在但你有冲突
    echo   3. 网络问题
    echo.
    echo 请检查后重试
    pause
    exit /b 1
)

echo.
echo ====================================
echo   ✓ 成功！代码已推送到 GitHub
echo ====================================
echo.
echo 仓库地址: https://github.com/shizhongyu799-ctrl/shizhongyu799-ctrl
echo.
pause
