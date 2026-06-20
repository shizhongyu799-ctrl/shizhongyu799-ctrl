const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'customer_map',
  user: 'postgres',
  password: 'postgres'
});

async function test() {
  await client.connect();
  
  // 查询所有用户，包括密码哈希
  const result = await client.query('SELECT id, username, real_name, role, password_hash FROM users');
  console.log('\n=== 所有用户 ===');
  for (const row of result.rows) {
    console.log(`ID: ${row.id}, Username: ${row.username}, Role: ${row.role}, 真实姓名: ${row.real_name}`);
  }
  
  // 测试密码 123456 是否匹配 ZX001
  const zx001 = result.rows.find(r => r.username.toLowerCase() === 'zx001');
  if (zx001) {
    const matches = await bcrypt.compare('123456', zx001.password_hash);
    console.log(`\n=== 密码测试 ===`);
    console.log(`用户 ${zx001.username}: 密码 "123456" ${matches ? '✅ 匹配' : '❌ 不匹配'}`);
    
    // 如果不匹配，用常见密码尝试
    const commonPasswords = ['admin123456', 'password', '12345678', 'admin123', 'zx001', '111111', '1234567890'];
    for (const pwd of commonPasswords) {
      const match = await bcrypt.compare(pwd, zx001.password_hash);
      if (match) {
        console.log(`  ✅ 找到匹配密码: "${pwd}"`);
      }
    }
  }
  
  await client.end();
}

test().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
