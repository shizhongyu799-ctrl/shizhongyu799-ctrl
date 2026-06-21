#!/bin/bash
# ============================================================
# 销售客户地图管理系统 - Mac mini 一键部署脚本
# ============================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  销售客户地图管理系统 - 部署脚本${NC}"
echo -e "${GREEN}========================================${NC}"

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ==================== 检查 Homebrew ====================
echo -e "\n${YELLOW}[1/8] 检查 Homebrew...${NC}"
if ! command -v brew &> /dev/null; then
    echo -e "${YELLOW}正在安装 Homebrew...${NC}"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # 添加到 PATH
    if [[ $(uname -m) == 'arm64' ]]; then
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
else
    echo -e "${GREEN}Homebrew 已安装${NC}"
fi

# ==================== 检查 Node.js ====================
echo -e "\n${YELLOW}[2/8] 检查 Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}正在安装 Node.js...${NC}"
    brew install node
else
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}Node.js 已安装: $NODE_VERSION${NC}"
fi

# ==================== 检查 PostgreSQL ====================
echo -e "\n${YELLOW}[3/8] 检查 PostgreSQL...${NC}"
if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}正在安装 PostgreSQL@16...${NC}"
    brew install postgresql@16

    # 添加到 PATH
    if [[ $(uname -m) == 'arm64' ]]; then
        echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
        export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
    else
        echo 'export PATH="/usr/local/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
        export PATH="/usr/local/opt/postgresql@16/bin:$PATH"
    fi
fi

# 启动 PostgreSQL
echo -e "${YELLOW}启动 PostgreSQL 服务...${NC}"
brew services start postgresql@16 2>/dev/null || true
sleep 2

# ==================== 创建数据库 ====================
echo -e "\n${YELLOW}[4/8] 初始化数据库...${NC}"

# 等待 PostgreSQL 完全启动
for i in {1..10}; do
    if psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw customer_map; then
        echo -e "${GREEN}数据库 customer_map 已存在${NC}"
        break
    fi
    if psql -lqt 2>/dev/null; then
        echo -e "${YELLOW}创建数据库 customer_map...${NC}"
        createdb customer_map 2>/dev/null || echo "数据库可能已存在"
        break
    fi
    echo "等待 PostgreSQL 启动... ($i/10)"
    sleep 1
done

# ==================== 安装 PM2 ====================
echo -e "\n${YELLOW}[5/8] 检查 PM2...${NC}"
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}正在安装 PM2...${NC}"
    npm install -g pm2
else
    echo -e "${GREEN}PM2 已安装${NC}"
fi

# ==================== 安装项目依赖 ====================
echo -e "\n${YELLOW}[6/8] 安装项目依赖...${NC}"

# 后端依赖
if [ -d "backend" ]; then
    echo -e "${YELLOW}安装后端依赖...${NC}"
    cd backend
    npm install
    cd ..
else
    echo -e "${RED}错误: 找不到 backend 目录${NC}"
    exit 1
fi

# 前端依赖
if [ -d "frontend" ]; then
    echo -e "${YELLOW}安装前端依赖...${NC}"
    cd frontend
    npm install
    cd ..
else
    echo -e "${RED}错误: 找不到 frontend 目录${NC}"
    exit 1
fi

# ==================== 构建前端 ====================
echo -e "\n${YELLOW}[7/8] 构建前端...${NC}"
cd frontend
npm run build
cd ..

if [ ! -d "frontend/dist" ]; then
    echo -e "${RED}错误: 前端构建失败，dist 目录不存在${NC}"
    exit 1
fi
echo -e "${GREEN}前端构建完成${NC}"

# ==================== 启动服务 ====================
echo -e "\n${YELLOW}[8/8] 启动服务...${NC}"

# 停止旧进程（如果存在）
pm2 delete crm-backend 2>/dev/null || true
pm2 delete crm-web 2>/dev/null || true

# 启动后端
pm2 start backend/src/app.js --name crm-backend

# 启动统一入口服务
pm2 start server.js --name crm-web

# 保存 PM2 进程列表
pm2 save

# 设置开机自启
pm2_startup_output=$(pm2 startup 2>&1)
if echo "$pm2_startup_output" | grep -q "sudo"; then
    echo -e "${YELLOW}请运行以下命令设置开机自启（需要密码）：${NC}"
    echo "$pm2_startup_output" | grep "sudo" | head -1
fi

# ==================== 完成 ====================
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  部署完成！${NC}"
echo -e "${GREEN}========================================${NC}"

# 获取局域网 IP
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "未获取到")

echo ""
echo -e "${YELLOW}服务状态：${NC}"
pm2 status

echo ""
echo -e "${YELLOW}访问地址：${NC}"
if [ "$LOCAL_IP" != "未获取到" ]; then
    echo -e "  局域网访问: ${GREEN}http://$LOCAL_IP:8080${NC}"
fi
echo -e "  本机访问:   ${GREEN}http://localhost:8080${NC}"

echo ""
echo -e "${YELLOW}默认管理员账号：${NC}"
echo -e "  用户名: ${GREEN}admin${NC}"
echo -e "  密码:   ${GREEN}admin123456${NC}"

echo ""
echo -e "${YELLOW}常用命令：${NC}"
echo "  查看状态: pm2 status"
echo "  查看日志: pm2 logs"
echo "  重启服务: pm2 restart all"
echo "  停止服务: pm2 stop all"
