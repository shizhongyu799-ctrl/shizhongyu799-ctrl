const { query } = require('../config/db');
const { ALL_MODULE_KEYS } = require('../config/schema');

async function main() {
  // 为所有 admin 角色用户分配全部模块权限
  const adminUsers = await query(
    "SELECT id, username FROM users WHERE role = 'admin'"
  );

  console.log(`发现 ${adminUsers.rows.length} 个 admin 用户：`);
  for (const u of adminUsers.rows) {
    console.log(`  [${u.id}] ${u.username}`);
    for (const key of ALL_MODULE_KEYS) {
      await query(
        'INSERT INTO permissions (user_id, module_key, enabled) VALUES ($1, $2, true) ON CONFLICT (user_id, module_key) DO NOTHING',
        [u.id, key]
      );
    }
    await query(
      'INSERT INTO data_scopes (user_id, scope_type, assigned_user_ids) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET scope_type = $2, assigned_user_ids = $3',
      [u.id, 'all', null]
    );
    console.log(`    ✓ 已分配 ${ALL_MODULE_KEYS.length} 个模块权限 + 全部数据范围`);
  }

  // 为 salesperson 设置数据范围 (self)
  const salesUsers = await query(
    "SELECT id, username FROM users WHERE role = 'salesperson'"
  );
  console.log(`\n发现 ${salesUsers.rows.length} 个 salesperson 用户：`);
  for (const u of salesUsers.rows) {
    await query(
      'INSERT INTO data_scopes (user_id, scope_type, assigned_user_ids) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET scope_type = $2, assigned_user_ids = $3',
      [u.id, 'self', [u.id]]
    );
    console.log(`  [${u.id}] ${u.username} ✓ 数据范围已设置 (self)`);
  }

  // 恢复系统配置
  await query(
    `INSERT INTO system_config (config_key, config_value) VALUES
     ('health_check_days', $1),
     ('reminder_days_before', $2)
     ON CONFLICT (config_key) DO NOTHING`,
    ['30', '3']
  );
  console.log('\n✓ 系统配置已恢复');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
