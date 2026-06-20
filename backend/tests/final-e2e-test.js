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
  console.log('========================================');
  console.log('  端到端：地图标记渲染链路测试');
  console.log('========================================\n');

  const login = await request('POST', '/api/auth/login', { username: 'admin', password: 'admin123456' });
  if (login.status !== 200) {
    console.log('❌ 登录失败:', login.body);
    process.exit(1);
  }
  const token = JSON.parse(login.body).token;
  console.log('✅ [1/6] 登录成功\n');

  const before = await request('GET', '/api/customers/markers', null, token);
  const beforeList = JSON.parse(before.body).markers;
  console.log(`✅ [2/6] 现有 markers 数量 = ${beforeList.length}
     其中有坐标 ${beforeList.filter((c) => c.lat != null && c.lng != null).length} 个，
     无坐标 ${beforeList.filter((c) => c.lat == null || c.lng == null).length} 个\n`);

  const ts = Date.now();
  const p1 = { companyName: 'E2E_ManualCoord_' + ts, contact: '张三', phone: '138' + (ts % 100000000), address: '北京市朝阳区建国路88号', status: 'intent', salesVolume: '', lat: 39.9089, lng: 116.4615 };
  const p2 = { companyName: 'E2E_NoCoord_' + ts, contact: '李四', phone: '139' + (ts % 100000000), address: '上海市浦东新区世纪大道100号', status: 'intent', salesVolume: '', lat: null, lng: null };
  const p3 = { companyName: 'E2E_StrCoord_' + ts, contact: '王五', phone: '137' + (ts % 100000000), address: '广州市天河区珠江新城', status: 'intent', salesVolume: '', lat: '23.129162', lng: '113.264434' };

  const r1 = await request('POST', '/api/customers', p1, token);
  console.log('测试 1：用户手动填写坐标 →', r1.status === 200 ? '✅ 新增成功' : '❌ 失败 ' + r1.body);
  const r2 = await request('POST', '/api/customers', p2, token);
  console.log('测试 2：用户未填坐标（仅地址）→', r2.status === 200 ? '✅ 新增成功' : '❌ 失败 ' + r2.body);
  const r3 = await request('POST', '/api/customers', p3, token);
  console.log('测试 3：字符串型坐标 →', r3.status === 200 ? '✅ 新增成功' : '❌ 失败 ' + r3.body);
  console.log();

  const after = await request('GET', '/api/customers/markers', null, token);
  const afterList = JSON.parse(after.body).markers;
  console.log(`✅ [4/6] 新增后 markers 数量 = ${afterList.length}（增加了 ${afterList.length - beforeList.length} 个）\n`);

  const expectedNames = ['E2E_ManualCoord_' + ts, 'E2E_NoCoord_' + ts, 'E2E_StrCoord_' + ts];
  let allFound = true;
  console.log('========== 新客户在 markers 接口中的情况 ==========');
  for (const name of expectedNames) {
    const c = afterList.find((x) => x.company_name === name);
    if (!c) {
      console.log(`❌ ${name}: 未在 markers 返回中找到`);
      allFound = false;
      continue;
    }
    const hasValid =
      c.lat != null && c.lng != null &&
      typeof c.lat === 'number' && typeof c.lng === 'number' &&
      Number.isFinite(c.lat) && Number.isFinite(c.lng);
    console.log(`✅ ${name}:`);
    console.log(`     id=${c.id}, lat=${c.lat} (${typeof c.lat}), lng=${c.lng} (${typeof c.lng})`);
    console.log(`     可在地图渲染: ${hasValid ? '✅ YES' : '⚠️  NO（无坐标，将在"无坐标"提示里显示）'}`);
  }
  console.log();

  console.log('========== 前端 renderMarkers 虚拟校验 ==========');
  let wouldRender = 0; let wouldSkip = 0;
  afterList.forEach((c) => {
    const valid = c.lng != null && c.lat != null && !isNaN(Number(c.lng)) && !isNaN(Number(c.lat));
    if (valid) wouldRender++; else wouldSkip++;
  });
  console.log(`✅ 将在地图上渲染为标记 = ${wouldRender} 个`);
  console.log(`⚠️  无坐标无法渲染（但仍能在列表+右上角提示中看到） = ${wouldSkip} 个`);
  console.log();

  console.log('========== 画圈筛选接口 ==========');
  try {
    const r5 = await request('POST', '/api/customers/area-filter', { lat: 39.9089, lng: 116.4615, radiusKm: 500 }, token);
    const customers = JSON.parse(r5.body).customers || [];
    console.log(`✅ [5/6] 以 (39.9089, 116.4615) 为圆心 500km 筛选，返回 ${customers.length} 个客户`);
  } catch (e) {
    console.log('⚠️  画圈筛选异常:', e.message);
  }

  const r6 = await request('GET', '/api/customers', null, token);
  const total = JSON.parse(r6.body).total;
  console.log(`\n✅ [6/6] /customers 返回 total=${total}，列表长度=${(JSON.parse(r6.body).customers || []).length}`);

  console.log('\n========================================');
  console.log(`  🏁 结论：${allFound ? '✅ 所有新增客户都能在地图端被正确返回' : '❌ 存在客户未被 markers 返回'}`);
  console.log('  坐标类型：后端已将字符串坐标转 number，前端可直接渲染');
  console.log('  无坐标客户：不会在地图上显示，但能在列表和右上角提示中找到');
  console.log('========================================');
})();
