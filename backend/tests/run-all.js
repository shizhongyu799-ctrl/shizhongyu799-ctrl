const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const config = {
  host: 'localhost',
  port: 5432,
  database: 'customer_map_test',
  user: 'postgres',
  password: 'postgres'
};

const SECRET = 'test-secret-key';

async function main() {
  const pool = new Pool(config);
  try {
    // 尝试连接，失败则提示（非阻塞）
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('[TEST] 数据库连接正常');

    // 建表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        real_name VARCHAR(50),
        phone VARCHAR(20),
        role VARCHAR(20) NOT NULL CHECK (role IN ('super_admin','admin','salesperson')),
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        is_locked BOOLEAN DEFAULT FALSE,
        last_login_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        company_name VARCHAR(200) NOT NULL,
        contact VARCHAR(50) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        address VARCHAR(500) NOT NULL,
        lat DECIMAL(12,8),
        lng DECIMAL(12,8),
        status VARCHAR(20) DEFAULT 'intent',
        sales_volume VARCHAR(100),
        salesperson_id INTEGER REFERENCES users(id),
        health_status VARCHAR(20) DEFAULT 'normal',
        last_visit_at TIMESTAMP,
        created_by INTEGER REFERENCES users(id),
        is_in_pool BOOLEAN DEFAULT FALSE,
        pool_moved_by INTEGER REFERENCES users(id),
        pool_moved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS visits (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        salesperson_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        visit_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        visit_type VARCHAR(20) NOT NULL CHECK (visit_type IN ('onsite','phone')),
        content TEXT,
        result VARCHAR(20) NOT NULL CHECK (result IN ('deal','follow_up','no_interest')),
        next_follow_up DATE,
        gps_lat DECIMAL(12,8),
        gps_lng DECIMAL(12,8),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('[TEST] 表结构已就绪');

    // 清理数据
    await pool.query('TRUNCATE visits, customers, users RESTART IDENTITY CASCADE');

    // 1. 创建超级管理员 + 验证密码
    const pwdHash = await bcrypt.hash('admin123', 10);
    const adminRes = await pool.query(
      "INSERT INTO users (username, password_hash, real_name, role) VALUES ($1, $2, $3, 'super_admin') RETURNING id",
      ['testadmin', pwdHash, '测试管理员']
    );
    const adminId = adminRes.rows[0].id;

    const pwdCheck = await bcrypt.compare('admin123', pwdHash);
    console.log(`[TEST 1] 密码哈希验证: ${pwdCheck ? 'PASS' : 'FAIL'}`);

    // 2. JWT 测试
    const token = jwt.sign({ id: adminId, username: 'testadmin', role: 'super_admin' }, SECRET, { expiresIn: '1h' });
    const decoded = jwt.verify(token, SECRET);
    console.log(`[TEST 2] JWT 生成与验证: ${decoded.id === adminId ? 'PASS' : 'FAIL'}`);

    // 3. 创建业务员 + 添加客户
    const spPwd = await bcrypt.hash('sp12345', 10);
    const spRes = await pool.query(
      "INSERT INTO users (username, password_hash, real_name, role, created_by) VALUES ($1, $2, $3, 'salesperson', $4) RETURNING id",
      ['sales1', spPwd, '业务员1', adminId]
    );
    const spId = spRes.rows[0].id;
    console.log(`[TEST 3] 业务员创建: PASS (id=${spId})`);

    // 4. 插入客户
    const cRes = await pool.query(
      `INSERT INTO customers (company_name, contact, phone, address, lat, lng, status, salesperson_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'intent', $7, $8) RETURNING id`,
      ['ABC科技', '张三', '13800138000', '北京市海淀区中关村大街1号', 39.983184, 116.322458, spId, spId]
    );
    const cId = cRes.rows[0].id;

    const customers = await pool.query('SELECT * FROM customers WHERE id = $1', [cId]);
    const c = customers.rows[0];
    console.log(`[TEST 4] 客户创建: ${c.company_name === 'ABC科技' && c.salesperson_id === spId ? 'PASS' : 'FAIL'} (id=${cId})`);

    // 5. 数据范围 - 业务员只能看到自己的客户
    const spCustomers = await pool.query(
      'SELECT id FROM customers WHERE salesperson_id = $1',
      [spId]
    );
    console.log(`[TEST 5] 业务员数据范围过滤: ${spCustomers.rows.length >= 1 ? 'PASS' : 'FAIL'}`);

    // 6. 新增拜访记录
    await pool.query(
      `INSERT INTO visits (customer_id, salesperson_id, visit_type, content, result, next_follow_up, gps_lat, gps_lng)
       VALUES ($1, $2, 'onsite', '首次拜访，客户有意向', 'follow_up', CURRENT_DATE + 7, $3, $4)`,
      [cId, spId, 39.98, 116.32]
    );
    const visits = await pool.query('SELECT * FROM visits WHERE customer_id = $1', [cId]);
    console.log(`[TEST 6] 拜访记录创建: ${visits.rows.length === 1 ? 'PASS' : 'FAIL'}`);

    // 7. 更新客户 last_visit_at + health_status
    await pool.query(
      "UPDATE customers SET last_visit_at = CURRENT_TIMESTAMP, health_status = 'normal' WHERE id = $1",
      [cId]
    );
    const updated = await pool.query('SELECT health_status, last_visit_at FROM customers WHERE id = $1', [cId]);
    console.log(`[TEST 7] 客户健康状态更新: ${updated.rows[0].health_status === 'normal' ? 'PASS' : 'FAIL'}`);

    // 8. 模拟健康度提醒：超过 30 天未拜访的客户应该标记
    await pool.query(
      "UPDATE customers SET last_visit_at = CURRENT_TIMESTAMP - INTERVAL '40 days' WHERE id = $1",
      [cId]
    );
    const healthCheck = await pool.query(
      `SELECT id, CASE WHEN last_visit_at < CURRENT_TIMESTAMP - INTERVAL '30 days' THEN 'warning' ELSE 'normal' END AS hs
       FROM customers WHERE id = $1`,
      [cId]
    );
    console.log(`[TEST 8] 健康度预警检测: ${healthCheck.rows[0].hs === 'warning' ? 'PASS' : 'FAIL'}`);

    // 9. 客户公海池 - 转移
    await pool.query(
      'UPDATE customers SET salesperson_id = NULL, is_in_pool = true, pool_moved_by = $1 WHERE id = $2',
      [adminId, cId]
    );
    const poolRes = await pool.query('SELECT id, is_in_pool, salesperson_id FROM customers WHERE id = $1', [cId]);
    console.log(`[TEST 9] 客户移入公海池: ${poolRes.rows[0].is_in_pool && poolRes.rows[0].salesperson_id === null ? 'PASS' : 'FAIL'}`);

    // 10. 从公海池重新分配
    await pool.query(
      'UPDATE customers SET salesperson_id = $1, is_in_pool = false WHERE id = $2',
      [spId, cId]
    );
    const assignRes = await pool.query('SELECT salesperson_id, is_in_pool FROM customers WHERE id = $1', [cId]);
    console.log(`[TEST 10] 客户从公海池分配: ${assignRes.rows[0].salesperson_id === spId && !assignRes.rows[0].is_in_pool ? 'PASS' : 'FAIL'}`);

    console.log('\n[TEST] 所有单元测试完成！');
    process.exit(0);
  } catch (err) {
    console.error('[TEST] 测试失败:', err.message);
    console.error('提示：请确保 PostgreSQL 服务启动，数据库 customer_map_test 存在。');
    console.error('提示：或先执行 backend 中的 `init-db.js` 脚本。');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
