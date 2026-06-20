const http = require('http');

function testLogin(label, username, password) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({ username, password });

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        console.log(`\n========== ${label} ==========`);
        console.log(`账号: ${username} / ${password}`);
        console.log(`状态码: ${res.statusCode}`);
        console.log(`响应头 Content-Type: ${res.headers['content-type']}`);
        console.log('响应 Body:');
        try {
          const json = JSON.parse(body);
          console.log(JSON.stringify(json, null, 2));
          if (json.token) {
            console.log(`\n[OK] 登录成功，获取到 token (长度: ${json.token.length})`);
          } else if (json.success === false) {
            console.log(`\n[FAIL] 登录失败: ${json.message || body}`);
          }
        } catch (e) {
          console.log(body);
          console.log(`\n[WARN] 响应不是合法 JSON: ${e.message}`);
        }
        resolve();
      });
    });

    req.on('error', (err) => {
      console.log(`\n========== ${label} ==========`);
      console.log(`账号: ${username} / ${password}`);
      console.log(`[ERROR] 请求失败: ${err.message}`);
      console.log(`错误详情: ${JSON.stringify(err, null, 2)}`);
      resolve();
    });

    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('开始测试 POST http://localhost:3000/api/auth/login');
  console.log('请求格式: Content-Type: application/json');

  await testLogin('管理员账号', 'admin', 'admin123456');
  await testLogin('业务员账号', 'zx001', '123456');

  console.log('\n========== 测试完成 ==========');
}

main();
