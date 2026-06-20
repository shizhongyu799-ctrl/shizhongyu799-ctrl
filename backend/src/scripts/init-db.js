const { query } = require('../config/db');
const bcrypt = require('bcryptjs');
const config = require('../config/config');
const { SCHEMA_SQL, ALL_MODULE_KEYS } = require('../config/schema');

async function initDB() {
  console.log('[DB] Creating tables...');
  await query(SCHEMA_SQL);
  console.log('[DB] Tables created.');

  // 检查是否已有超级管理员
  const existing = await query('SELECT id FROM users WHERE role = $1', ['super_admin']);
  if (existing.rows.length > 0) {
    console.log('[DB] Super admin already exists, skipping.');
    process.exit(0);
  }

  // 创建超级管理员
  const pwdHash = await bcrypt.hash(config.SUPER_ADMIN.password, 10);
  const adminRes = await query(
    `INSERT INTO users (username, password_hash, real_name, role, created_by)
     VALUES ($1, $2, $3, 'super_admin', NULL)
     RETURNING id`,
    [config.SUPER_ADMIN.username, pwdHash, config.SUPER_ADMIN.realName]
  );
  const superAdminId = adminRes.rows[0].id;
  console.log(`[DB] Super admin created: id=${superAdminId}, username=${config.SUPER_ADMIN.username}`);

  // 插入系统配置
  await query(
    `INSERT INTO system_config (config_key, config_value) VALUES
     ('health_check_days', $1),
     ('reminder_days_before', $2)
     ON CONFLICT (config_key) DO NOTHING`,
    [String(config.HEALTH_CHECK_DAYS), String(config.REMINDER_DAYS_BEFORE)]
  );

  // 插入示例业务员 2 名（方便测试）
  for (let i = 1; i <= 2; i++) {
    const hash = await bcrypt.hash(`sales${i}123`, 10);
    await query(
      `INSERT INTO users (username, password_hash, real_name, role, created_by)
       VALUES ($1, $2, $3, 'salesperson', $4)
       RETURNING id`,
      [`sales${i}`, hash, `业务员${i}`, superAdminId]
    );
  }
  console.log('[DB] Sample salespersons created: sales1/sales123, sales2/sales2123');

  console.log('[DB] ALL_MODULE_KEYS for reference:', ALL_MODULE_KEYS.join(', '));
  console.log('[DB] Init done.');
  process.exit(0);
}

initDB().catch((err) => {
  console.error('[DB] Init failed:', err);
  process.exit(1);
});
