const { query } = require('../config/db');

const TABLES = [
  'operation_logs',
  'reminders',
  'visits',
  'reports',
  'customers',
  'data_scopes',
  'permissions',
  'system_config',
];

async function main() {
  console.log('开始清空测试数据...');

  for (const table of TABLES) {
    try {
      await query(`TRUNCATE TABLE ${table} CASCADE`);
      console.log(`  ✓ 已清空 ${table}`);
    } catch (e) {
      console.log(`  ✗ ${table} 失败: ${e.message}`);
    }
  }

  const seqs = [
    'operation_logs_id_seq',
    'reminders_id_seq',
    'visits_id_seq',
    'reports_id_seq',
    'customers_id_seq',
    'data_scopes_id_seq',
    'permissions_id_seq',
  ];

  for (const seq of seqs) {
    try {
      await query(`ALTER SEQUENCE ${seq} RESTART WITH 1`);
      console.log(`  ✓ 已重置 ${seq}`);
    } catch (e) {
      console.log(`  - ${seq}: ${e.message}`);
    }
  }

  console.log('\n完成！');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
