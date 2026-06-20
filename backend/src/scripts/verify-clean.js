const { query } = require('../config/db');

const TABLES = [
  'users',
  'customers',
  'visits',
  'reminders',
  'reports',
  'operation_logs',
  'permissions',
  'data_scopes',
  'system_config',
];

async function main() {
  console.log('验证各表记录数：');
  console.log('');
  for (const table of TABLES) {
    try {
      const res = await query(`SELECT COUNT(*) FROM ${table}`);
      console.log(`  ${table.padEnd(20)} ${res.rows[0].count} 条`);
    } catch (e) {
      console.log(`  ${table.padEnd(20)} ERROR: ${e.message}`);
    }
  }
  console.log('');
  console.log('用户列表：');
  const users = await query('SELECT id, username, real_name, role, is_locked FROM users ORDER BY id');
  users.rows.forEach(u => {
    console.log(`  [${u.id}] ${u.username} / ${u.real_name || '-'} / ${u.role} / locked=${u.is_locked}`);
  });
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
