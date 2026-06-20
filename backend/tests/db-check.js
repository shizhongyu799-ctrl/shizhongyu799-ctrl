const { query } = require('../src/config/db');
(async () => {
  await query('SELECT 1'); // 确保数据库连接初始化
  const r = await query('SELECT id, company_name, lat, lng, pg_typeof(lat), pg_typeof(lng) FROM customers ORDER BY id');
  console.log('总数:', r.rows.length);
  r.rows.forEach((row) => {
    console.log(`id=${row.id} ${row.company_name.substring(0, 30)} | lat=${row.lat}(${row.pg_typeof}) lng=${row.lng}(${row.pg_typeof})`);
  });
})();
