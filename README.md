# 销售客户地图管理系统

一个基于 Vue 3 + Node.js + PostgreSQL 的客户关系管理（CRM）系统，核心特色是**地图可视化客户分布**，支持业务员权限隔离、拜访记录跟进、操作日志审计等。

## 功能模块

- 🗺️ **客户地图** - 全国范围的客户标记点，支持缩放、筛选、自动定位到当前位置
- 👥 **客户管理** - 客户信息维护、状态管理（意向/成交/流失）、健康度预警
- 📅 **跟进日历** - 日历视图的下次跟进计划，支持按日查看详情
- 📝 **拜访记录** - 现场拜访/电话拜访记录，支持下次跟进提醒
- 👤 **用户管理** - 多角色（超级管理员/管理员/业务员），数据范围隔离
- 🔐 **权限系统** - 细粒度模块权限配置
- 📊 **操作日志** - 全系统关键操作留痕，可追溯
- 📤 **数据导出** - Excel 导出客户/拜访记录

## 技术栈

| 层 | 技术 |
|---|---|
| **前端** | Vue 3 + Vite + Element Plus + Pinia + Vue Router + Axios |
| **后端** | Node.js + Express + JSON Web Token (JWT) |
| **数据库** | PostgreSQL |
| **地图** | 高德地图 JS API |

## 目录结构

```
测试地图/
├── backend/              # Node.js 后端
│   ├── src/
│   │   ├── app.js       # 应用入口
│   │   ├── config/      # 数据库连接、配置
│   │   ├── middleware/  # 鉴权、权限
│   │   ├── routes/      # 所有 API 路由
│   │   └── scripts/     # 数据库初始化/测试数据脚本
│   └── tests/           # 测试脚本
├── frontend/             # Vue 3 前端
│   ├── index.html
│   └── src/
│       ├── main.js      # 入口
│       ├── views/       # 页面（地图、列表、日历、登录等）
│       ├── components/  # 可复用组件（表单、对话框）
│       ├── router/      # Vue Router
│       └── store/       # Pinia
├── start.bat             # Windows 一键启动
└── 销售客户地图管理系统_需求文档.md
```

## 快速开始

### 环境要求

- Node.js >= 16
- PostgreSQL >= 14

### 一键启动（Windows）

```
start.bat
```

该脚本会：
1. 检查并创建数据库 `sales_crm`
2. 安装后端依赖并启动服务（端口 3000）
3. 安装前端依赖并启动开发服务器（端口 5173）

### 手动启动

```
# 1. 后端
cd backend
npm install
node src/scripts/init-env.js   # 创建数据库 & 配置文件
node src/scripts/init-db.js    # 创建表与初始管理员
npm start                       # 启动后端: http://localhost:3000

# 2. 前端
cd frontend
npm install
npm run dev                     # 启动前端: http://localhost:5173
```

### 默认账号

| 账号 | 密码 | 角色 |
|---|---|---|
| `admin` | `admin123456` | super_admin（超级管理员） |

业务员账号请用管理员登录后在「用户管理」页创建，或运行 `node backend/src/scripts/seed-test-data.js` 一键插入测试账号与客户。

## 数据库脚本

| 脚本 | 用途 |
|---|---|
| `init-env.js` | 初始化数据库与配置文件 |
| `init-db.js` | 创建表结构与超级管理员 |
| `seed-test-data.js` | 插入测试业务员、客户、拜访记录 |
| `clean-data.js` | 清空所有测试数据 |
| `restore-permissions.js` | 重建 admin 用户的默认权限 |

## 说明

高德地图 key 在 `frontend/src/config/amap.js` 中配置，可替换为你自己的 key。
