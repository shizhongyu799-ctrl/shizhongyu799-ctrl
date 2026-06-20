const http = require('http');

function request(method, path, body, token) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : '';
    const req = http.request({
      host: 'localhost', port: 3000, path, method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        ...(token ? { 'Authorization': 'Bearer ' + token } : {})
      }
    }, (res) => {
      let d = '';
      res.on('data', (c) => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  const login = await request('POST', '/api/auth/login', { username: 'admin', password: 'admin123456' });
  const token = JSON.parse(login.body).token;
  console.log('[1] 登录', login.status, 'token =', token ? 'OK' : 'NO');

  // 模拟新增客户（带坐标）
  const addr1 = '北京市朝阳区建国路88号';
  const r1 = await request('POST', '/api/customers', {
    companyName: '知地图测试公司_' + Date.now(),
    contact: '张测试',
    phone: '139' + String(10000000 + Math.floor(Math.random() * 90000000)),
    address: addr1,
    status: 'intent',
    lat: 39.9088,
    lng: 116.4612
  }, token);
  console.log('[2] POST /customers =', r1.status, r1.body.slice(0, 120));

  // 模拟新增客户（没有坐标，只有地址 — 后端不自动解析，由前端自动解析，存 null）
  const addr2 = '上海市浦东新区世纪大道100号';
  const r2 = await request('POST', '/api/customers', {
    companyName: 'NoCoord 公司_' + Date.now(),
    contact: '李测试',
    phone: '139' + String(20000000 + Math.floor(Math.random() * 90000000)),
    address: addr2,
    status: 'intent',
    lat: null,
    lng: null
  }, token);
  console.log('[3] POST /customers (无坐标) =', r2.status, r2.body.slice(0, 120));

  // 取 markers 接口
  const r3 = await request('GET', '/api/customers/markers', null, token);
  const list = JSON.parse(r3.body).markers;
  console.log('[4] markers 总数 =', list.length);

  const withCoords = list.filter((c) => c.lat != null && c.lng != null && !isNaN(Number(c.lat)) && !isNaN(Number(c.lng)));
  const noCoords = list.filter((c) => c.lat == null || c.lng == null || isNaN(Number(c.lat)) || isNaN(Number(c.lng)));
  console.log('   ✅ 有坐标（可在地图显示） =', withCoords.length);
  console.log('   ⚠️  无坐标（无法在地图显示） =', noCoords.length);
  noCoords.slice(0, 5).forEach((c) => console.log('     -', c.id, c.company_name, ' lat=', c.lat, ' lng=', c.lng));

  // 检查数据类型
  const typeMismatch = list.filter((c) => c.lat != null && typeof c.lat !== 'number');
  if (typeMismatch.length > 0) {
    console.log('❌ 部分 lat 不是 number 类型:', typeMismatch[0].company_name, 'lat=', typeMismatch[0].lat, '(type=', typeof typeMismatch[0].lat, ')');
  } else {
    console.log('✅ 所有有坐标的客户 lat/lng 都是 number 类型');
  }

  console.log('\n🎉 地图标记链路测试完成');
})();
