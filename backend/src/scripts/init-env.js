/**
 * 数据库初始化脚本（Windows / Node.js）
 *
 * 用法：
 *   node src/scripts/init-env.js
 *
 * 本脚本负责：
 *   1. 连接 postgres 默认库，创建 customer_map 数据库（如已存在则跳过）
 *   2. 在 customer_map 中建表 + 初始化超级管理员 + 示例数据
 *
 * 仅首次运行需要执行；再次运行会幂等跳过。
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { SCHEMA_SQL, ALL_MODULE_KEYS } = require('../config/schema');
const config = require('../config/config');

async function main() {
  // ---------- Step 1：连接 postgres 默认库，检查/创建 customer_map ----------
  console.log('[init] 正在连接 PostgreSQL...');
  let adminPool;
  try {
    adminPool = new Pool({
      host: config.DB.host,
      port: config.DB.port,
      database: 'postgres',
      user: config.DB.user,
      password: config.DB.password,
      connectionTimeoutMillis: 5000
    });
    await adminPool.query('SELECT 1');
    console.log('[init] PostgreSQL 连接成功');
  } catch (err) {
    console.error('[init] 无法连接 PostgreSQL：', err.message);
    console.error('[init] 请确认：');
    console.error('[init]   1. PostgreSQL 已安装并正在运行');
    console.error('[init]   2. 端口 ' + config.DB.port + ' 可用');
    console.error('[init]   3. 用户名/密码匹配（当前：' + config.DB.user + ' / ' + config.DB.password + '）');
    process.exit(1);
  }

  // 检查 customer_map 是否存在
  let dbExists = false;
  try {
    const r = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [config.DB.database]
    );
    dbExists = r.rows.length > 0;
  } catch {}

  if (dbExists) {
    console.log('[init] 数据库 ' + config.DB.database + ' 已存在，跳过创建');
  } else {
    try {
      await adminPool.query('CREATE DATABASE ' + config.DB.database);
      console.log('[init] 数据库 ' + config.DB.database + ' 创建成功');
    } catch (err) {
      // 并发初始化时可能已被另一进程创建，忽略错误
      if (err.code !== '42P04') {
        console.error('[init] 创建数据库失败：', err.message);
        process.exit(1);
      }
      console.log('[init] 数据库 ' + config.DB.database + ' 已存在（并发创建）');
    }
  }
  await adminPool.end();

  // ---------- Step 2：连接 customer_map，建表 + 初始化数据 ----------
  let appPool;
  try {
    appPool = new Pool({
      host: config.DB.host,
      port: config.DB.port,
      database: config.DB.database,
      user: config.DB.user,
      password: config.DB.password,
      connectionTimeoutMillis: 5000
    });
    await appPool.query('SELECT 1');
    console.log('[init] 连接 ' + config.DB.database + ' 成功');
  } catch (err) {
    console.error('[init] 连接 customer_map 失败：', err.message);
    process.exit(1);
  }

  // 建表
  try {
    await appPool.query(SCHEMA_SQL);
    console.log('[init] 表结构创建/更新完成');
  } catch (err) {
    console.error('[init] 建表失败：', err.message);
    process.exit(1);
  }

  // 检查超级管理员是否已存在
  const adminCheck = await appPool.query(
    "SELECT id FROM users WHERE role = $1 LIMIT 1",
    ['super_admin']
  );
  if (adminCheck.rows.length > 0) {
    console.log('[init] 超级管理员已存在，跳过账号创建');
  } else {
    const pwdHash = await bcrypt.hash(config.SUPER_ADMIN.password, 10);
    await appPool.query(
      `INSERT INTO users (username, password_hash, real_name, role, created_by)
       VALUES ($1, $2, $3, 'super_admin', NULL) RETURNING id`,
      [config.SUPER_ADMIN.username, pwdHash, config.SUPER_ADMIN.realName]
    );
    console.log('[init] 超级管理员创建成功：' + config.SUPER_ADMIN.username + ' / ' + config.SUPER_ADMIN.password);
  }

  // 插入系统配置
  await appPool.query(
    `INSERT INTO system_config (config_key, config_value) VALUES
     ('health_check_days', $1),
     ('reminder_days_before', $2)
     ON CONFLICT (config_key) DO NOTHING`,
    [String(config.HEALTH_CHECK_DAYS), String(config.REMINDER_DAYS_BEFORE)]
  );
  console.log('[init] 系统配置写入完成');

  // 创建 2 名示例业务员
  for (let i = 1; i <= 2; i++) {
    const existRes = await appPool.query(
      'SELECT id FROM users WHERE username = $1',
      [`sales${i}`]
    );
    if (existRes.rows.length === 0) {
      const hash = await bcrypt.hash(`sales${i}123`, 10);
      await appPool.query(
        `INSERT INTO users (username, password_hash, real_name, role, created_by)
         VALUES ($1, $2, $3, 'salesperson', $4)`,
        [`sales${i}`, hash, `业务员${i}`, 1]
      );
      console.log(`[init] 业务员 sales${i} 创建成功：sales${i} / sales${i}123`);
    }
  }

  await appPool.end();
  console.log('[init] ===== 环境初始化完成 =====');
  console.log('[init] 现在可以启动后端：cd backend && npm start');
  process.exit(0);
}

main().catch((err) => {
  console.error('[init] 初始化失败：', err.message);
  process.exit(1);
});
