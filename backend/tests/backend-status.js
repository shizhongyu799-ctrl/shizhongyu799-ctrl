const http = require('http');

function request(method, path, body, token) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : '';
    const req = http.request({
      host: 'localhost', port: 3000, path, method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data, 'utf8'),
        ...(token ? { 'Authorization': 'Bearer ' + token } : {})
      }
    }, (res) => {
      let d = '';
      res.on('data', (c) => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', (e) => resolve({ status: -1, body: e.message }));
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  console.log('\n=== 1. 测试健康检查 ===');
  const health = await request('GET', '/api/health', null, null);
  console.log('GET /api/health ->', health.status, health.body.slice(0, 200));

  console.log('\n=== 2. 超级管理员登录 ===');
  const login1 = await request('POST', '/api/auth/login', { username: 'admin', password: 'admin123456' }, null);
  console.log('status:', login1.status, 'body:', login1.body.slice(0, 500));

  console.log('\n=== 3. 列出用户（找出业务员账号）===');
  if (login1.status === 200) {
    const adminToken = JSON.parse(login1.body).token;
    const users = await request('GET', '/api/auth/users', null, adminToken);
    console.log('GET /api/auth/users ->', users.status, users.body.slice(0, 2000));
  }

  console.log('\n=== 4. 直接试试一个已知业务员（salesperson / salesperson123）===');
  const login2 = await request('POST', '/api/auth/login', { username: 'salesperson', password: 'salesperson123' }, null);
  console.log('status:', login2.status, 'body:', login2.body.slice(0, 800));
  if (login2.status === 200) {
    const token2 = JSON.parse(login2.body).token;
    console.log('\n  → 用业务员 token 调 markers 接口：');
    const markers = await request('GET', '/api/customers/markers', null, token2);
    console.log('  GET /api/customers/markers ->', markers.status, markers.body.slice(0, 2000));

    console.log('\n  → 用业务员 token 调客户列表接口：');
    const custs = await request('GET', '/api/customers', null, token2);
    console.log('  GET /api/customers ->', custs.status, custs.body.slice(0, 2000));
  }
})();
