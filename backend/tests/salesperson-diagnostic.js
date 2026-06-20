const http = require('http');

function httpRequest(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (body) headers['Content-Length'] = Buffer.byteLength(body);
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api' + path,
      method,
      headers,
      timeout: 5000
    }, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(buf); } catch {}
        resolve({ status: res.statusCode, data: json, raw: buf });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

async function login(username, password) {
  const r = await httpRequest('POST', '/auth/login', { username, password });
  if (r.status !== 200) throw new Error('登录失败: ' + (r.data?.error || r.raw));
  return r.data.token;
}

async function testEndpoint(label, path, token) {
  try {
    const r = await httpRequest('GET', path, null, token);
    return { label, ok: r.status === 200, status: r.status, data: r.data, error: r.data?.error || null };
  } catch (e) {
    return { label, ok: false, status: 'ERR', error: e.message };
  }
}

async function run() {
  const users = [
    { username: 'zx001', password: '123456', role: '业务员' },
    { username: 'sales1', password: '123456', role: '业务员' },
    { username: 'admin', password: 'admin123456', role: '超级管理员' }
  ];

  const endpoints = [
    { label: '客户标记', path: '/customers/markers' },
    { label: '客户列表', path: '/customers?limit=5' },
    { label: '我的提醒', path: '/reminders/my?unread=false&limit=10' },
    { label: '到期 banner', path: '/reminders/banner' },
    { label: '我的拜访', path: '/visits/my' },
    { label: '拜访列表', path: '/visits?limit=5' },
    { label: '当前用户', path: '/auth/me' },
    { label: '日历数据', path: '/visits/calendar' }
  ];

  // 先检查健康
  try {
    const r = await httpRequest('GET', '/health');
    console.log('✅ 后端健康检查：', r.status, JSON.stringify(r.data));
  } catch (e) {
    console.log('❌ 后端健康检查失败：', e.message);
    return;
  }

  for (const u of users) {
    console.log(`\n========== 用户：${u.username}（${u.role}） ==========\n`);
    let token;
    try {
      token = await login(u.username, u.password);
      console.log('✅ 登录成功');
    } catch (e) {
      console.log('❌', e.message);
      continue;
    }
    for (const ep of endpoints) {
      const res = await testEndpoint(ep.label, ep.path, token);
      if (res.ok) {
        let preview = '';
        if (res.data && typeof res.data === 'object') {
          const keys = Object.keys(res.data);
          preview = keys.map(k => {
            const v = res.data[k];
            if (Array.isArray(v)) return `${k}:${v.length}项`;
            if (v && typeof v === 'object') return `${k}:{${Object.keys(v).slice(0,3).join(',')}}`;
            return `${k}:${JSON.stringify(v).slice(0,30)}`;
          }).join(' | ');
        }
        console.log(`✅ ${res.label} (${res.status}) ${preview}`);
      } else {
        console.log(`❌ ${res.label} (${res.status}) ${res.error}`);
      }
    }
  }

  console.log('\n========== 完成 ==========\n');
}

run().catch(e => console.error('脚本异常：', e));
