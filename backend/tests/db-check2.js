const { query } = require('../src/config/db');
(async () => {
  const r = await query('SELECT id, company_name, lat, lng, salesperson_id, is_in_pool FROM customers ORDER BY id');
  console.log('总数:', r.rows.length);
  r.rows.forEach((row) => {
    console.log(`id=${row.id} ${row.company_name.substring(0, 30)} | salesperson_id=${row.salesperson_id} is_in_pool=${row.is_in_pool} | lat=${row.lat} lng=${row.lng}`);
  });
  // 查无坐标客户
  const noCoords = r.rows.filter((c) => c.lat == null || c.lng == null);
  console.log('\n无坐标客户数:', noCoords.length);
  noCoords.forEach((c) => console.log(`  ${c.id} ${c.company_name} salesperson_id=${c.salesperson_id}`));
})();
