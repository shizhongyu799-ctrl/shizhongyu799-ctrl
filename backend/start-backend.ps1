$ErrorActionPreference = 'Stop'
Set-Location 'E:\想法\测试地图\backend'

# 查找 node.exe
$nodePath = $null
$possiblePaths = @(
  'C:\Program Files\nodejs\node.exe',
  'C:\Program Files (x86)\nodejs\node.exe',
  "$env:APPDATA\npm\node.exe",
  "$env:LOCALAPPDATA\nodejs\node.exe"
)
foreach ($p in $possiblePaths) {
  if (Test-Path $p) {
    $nodePath = $p
    break
  }
}

if (-not $nodePath) {
  # 尝试通过命令查找
  try {
    $nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
  } catch {}
}

if (-not $nodePath) {
  # 在常见安装目录搜索
  $found = Get-ChildItem -Path 'C:\' -Filter 'node.exe' -Recurse -ErrorAction SilentlyContinue -Depth 4 | Select-Object -First 1
  if ($found) { $nodePath = $found.FullName }
}

if ($nodePath) {
  Write-Host "找到 node.exe: $nodePath"
  Write-Host "启动后端服务..."
  & $nodePath 'src/app.js'
} else {
  Write-Host "ERROR: 找不到 node.exe，请确保已安装 Node.js"
  exit 1
}
