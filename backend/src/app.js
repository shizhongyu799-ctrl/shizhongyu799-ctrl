const express = require('express');
const cors = require('cors');
const config = require('./config/config');
const { query } = require('./config/db');
const bcrypt = require('bcryptjs');
const { SCHEMA_SQL, ALL_MODULE_KEYS } = require('./config/schema');

const authRoutes = require('./routes/auth-routes');
const customerRoutes = require('./routes/customer-routes');
const visitRoutes = require('./routes/visit-routes');
const reminderRoutes = require('./routes/reminder-routes');
const adminRoutes = require('./routes/admin-routes');
const { router: logRoutes, logOperation } = require('./routes/log-routes');

// 导出 logOperation 供其他模块使用
module.exports.logOperation = logOperation;

// ==================== 自动初始化数据库 ====================
// 启动时自动建表、建超级管理员（幂等：已存在则跳过），避免用户漏跑 init-db
async function ensureDBReady() {
  try {
    await query('SELECT 1');
  } catch (err) {
    console.error('[DB] 连接失败：', err.message);
    console.error('[DB] 请确保 PostgreSQL 已启动，且配置文件 config.js 的 DB 字段正确。');
    console.error('[DB] 默认数据库名：customer_map，默认账号：postgres / postgres。');
    throw err;
  }
  try {
    await query(SCHEMA_SQL);
    console.log('[DB] 表结构已就绪。');
  } catch (err) {
    console.error('[DB] 创建表失败：', err.message);
    throw err;
  }
  try {
    const existRes = await query("SELECT id FROM users WHERE role = $1 LIMIT 1", ['super_admin']);
    if (existRes.rows.length > 0) {
      console.log('[DB] 已存在超级管理员，跳过初始化数据。');
      return;
    }
    const pwdHash = await bcrypt.hash(config.SUPER_ADMIN.password, 10);
    await query(
      `INSERT INTO users (username, password_hash, real_name, role, created_by)
       VALUES ($1, $2, $3, 'super_admin', NULL) RETURNING id`,
      [config.SUPER_ADMIN.username, pwdHash, config.SUPER_ADMIN.realName]
    );
    await query(
      `INSERT INTO system_config (config_key, config_value) VALUES
       ('health_check_days', $1),
       ('reminder_days_before', $2)
       ON CONFLICT (config_key) DO NOTHING`,
      [String(config.HEALTH_CHECK_DAYS), String(config.REMINDER_DAYS_BEFORE)]
    );
    console.log('[DB] 已初始化超级管理员：admin / ' + config.SUPER_ADMIN.password);
  } catch (err) {
    console.error('[DB] 初始化数据失败：', err.message);
  }
}

// 全局异常兜底：防止未捕获的异常/Rejection直接杀死进程
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err);
});
process.on('unhandledRejection', (reason, p) => {
  console.error('[FATAL] unhandledRejection:', reason);
});

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 简易请求日志（仅记录方法与路径）
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleString()}] ${req.method} ${req.url}`);
  next();
});

// 健康检查（可用于确认后端是否已就绪）
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/logs', logRoutes);

// 全局错误处理：输出更友好的 JSON 错误
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  const status = err.status || 500;
  const msg = err.message || '服务器内部错误';
  res.status(status).json({ error: msg });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: '接口不存在：' + req.url });
});

const PORT = config.PORT || 3000;

// 先等数据库就绪，再启动 HTTP 监听，避免"服务启动但数据库还没好"的问题
ensureDBReady()
  .then(() => {
    app.listen(PORT, () => {
      console.log('[SERVER] 后端已就绪，监听端口 ' + PORT);
      console.log('[SERVER] 默认超级管理员：admin / ' + config.SUPER_ADMIN.password);
      console.log('[SERVER] 前端请把 /api 代理到 http://localhost:' + PORT);
      console.log('[SERVER] 健康检查：GET http://localhost:' + PORT + '/api/health');
    });
  })
  .catch((err) => {
    console.error('[SERVER] 启动失败，退出进程：', err.message);
    process.exit(1);
  });

module.exports = app;
