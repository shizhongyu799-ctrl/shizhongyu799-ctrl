/**
 * 完整的后端 API 测试脚本
 */

const http = require('http');

const BASE = 'http://localhost:3000';

function request(path, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const req = http.request(
      { hostname: 'localhost', port: 3000, path: url.pathname + url.search, method: options.method || 'GET', headers: options.headers || {} },
      (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            resolve({ status: res.statusCode, data: parsed });
          } catch {
            resolve({ status: res.statusCode, data: { raw: data } });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

const results = [];

function log(name, status, data, error) {
  const ok = status >= 200 && status < 300;
  results.push({ name, status: status, ok, data: data, error: error || null });
  const icon = ok ? '✅' : (status >= 400 && status < 500 ? '⚠️ ' : '❌');
  const preview = data ? JSON.stringify(data).substring(0, 120) : '';
  console.log(`  ${icon} ${name} => HTTP ${status}${error ? ' | ' + error : ''}`);
  if (!ok && data) console.log(`     响应: ${preview}`);
}

async function run() {
  console.log('========== 后端 API 完整性测试 ==========\n');

  // ---- 1. 健康检查 ----
  console.log('[1] 健康检查');
  try {
    const r = await request('/api/health');
    log('GET /api/health', r.status, r.data);
  } catch (e) { log('GET /api/health', 0, null, e.message); }

  // ---- 2. 登录（admin/admin123456） ----
  console.log('\n[2] 登录接口');
  let token = null;
  let userId = null;
  try {
    const r = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' } }, { username: 'admin', password: 'admin123456' });
    log('POST /api/auth/login (admin)', r.status, r.data);
    if (r.data.token) {
      token = 'Bearer ' + r.data.token;
      userId = r.data.user?.id;
    }
  } catch (e) { log('POST /api/auth/login (admin)', 0, null, e.message); }

  // ---- 3. 测试未登录访问受保护接口（应401） ----
  console.log('\n[3] 权限验证（未登录访问受保护接口）');
  try {
    const r = await request('/api/customers');
    log('GET /api/customers (no token)', r.status, r.data);
  } catch (e) { log('GET /api/customers (no token)', 0, null, e.message); }

  // ---- 4. 客户管理 ----
  console.log('\n[4] 客户管理接口');
  const authHeader = { 'Authorization': token, 'Content-Type': 'application/json' };

  // 创建客户
  let customerId = null;
  try {
    const r = await request('/api/customers', { method: 'POST', headers: authHeader }, {
      companyName: '测试客户有限公司',
      contact: '张三',
      phone: '13800138000',
      address: '北京市朝阳区建国路88号',
      lng: 116.472,
      lat: 39.909,
      status: 'intent'
    });
    log('POST /api/customers (新建客户)', r.status, r.data);
    if (r.data.customer) customerId = r.data.customer.id;
  } catch (e) { log('POST /api/customers (新建客户)', 0, null, e.message); }

  // 再创建一个客户以便列表不为空
  try {
    await request('/api/customers', { method: 'POST', headers: authHeader }, {
      companyName: '示例科技股份公司',
      contact: '李四',
      phone: '13900139000',
      address: '上海市浦东新区世纪大道100号',
      lng: 121.506,
      lat: 31.245,
      status: 'cooperated'
    });
  } catch {}

  // 客户列表
  try {
    const r = await request('/api/customers?page=1&pageSize=10', { headers: { 'Authorization': token } });
    log('GET /api/customers?page=1&pageSize=10', r.status, r.data);
  } catch (e) { log('GET /api/customers', 0, null, e.message); }

  // 客户详情
  if (customerId) {
    try {
      const r = await request('/api/customers/' + customerId, { headers: { 'Authorization': token } });
      log('GET /api/customers/{id}', r.status, r.data);
    } catch (e) { log('GET /api/customers/{id}', 0, null, e.message); }
  }

  // 地图标记
  try {
    const r = await request('/api/customers/markers', { headers: { 'Authorization': token } });
    log('GET /api/customers/markers (地图标记)', r.status, r.data);
  } catch (e) { log('GET /api/customers/markers', 0, null, e.message); }

  // 区域筛选
  try {
    const r = await request('/api/customers/area-filter', { method: 'POST', headers: authHeader }, {
      lat: 39.909, lng: 116.472, radiusKm: 50
    });
    log('POST /api/customers/area-filter (圆形区域筛选)', r.status, r.data);
  } catch (e) { log('POST /api/customers/area-filter', 0, null, e.message); }

  // 公海池
  try {
    const r = await request('/api/customers/pool/list', { headers: { 'Authorization': token } });
    log('GET /api/customers/pool/list (公海池列表)', r.status, r.data);
  } catch (e) { log('GET /api/customers/pool/list', 0, null, e.message); }

  // 移到公海
  if (customerId) {
    try {
      const r = await request('/api/customers/pool/move', { method: 'POST', headers: authHeader }, { customerIds: [customerId] });
      log('POST /api/customers/pool/move (移入公海)', r.status, r.data);
    } catch (e) { log('POST /api/customers/pool/move', 0, null, e.message); }
  }

  // ---- 5. 拜访管理 ----
  console.log('\n[5] 拜访管理接口');

  // 创建拜访记录
  let visitId = null;
  if (customerId) {
    try {
      const r = await request('/api/visits', { method: 'POST', headers: authHeader }, {
        customerId: customerId,
        visitType: 'onsite',
        content: '与客户详细沟通需求，客户对产品表达强烈兴趣',
        result: 'follow_up',
        nextFollowUp: '2026-06-27',
        gpsLat: 39.909,
        gpsLng: 116.472,
        companyName: '测试客户有限公司'
      });
      log('POST /api/visits (新建拜访)', r.status, r.data);
      if (r.data.visit) visitId = r.data.visit.id;
    } catch (e) { log('POST /api/visits', 0, null, e.message); }
  }

  // 我的拜访列表
  try {
    const r = await request('/api/visits/my?page=1&pageSize=10', { headers: { 'Authorization': token } });
    log('GET /api/visits/my (我的拜访)', r.status, r.data);
  } catch (e) { log('GET /api/visits/my', 0, null, e.message); }

  // 日历视图
  try {
    const r = await request('/api/visits/calendar?year=2026&month=6', { headers: { 'Authorization': token } });
    log('GET /api/visits/calendar (日历视图)', r.status, r.data);
  } catch (e) { log('GET /api/visits/calendar', 0, null, e.message); }

  // 详情
  if (visitId) {
    try {
      const r = await request('/api/visits/' + visitId, { headers: { 'Authorization': token } });
      log('GET /api/visits/{id} (拜访详情)', r.status, r.data);
    } catch (e) { log('GET /api/visits/{id}', 0, null, e.message); }
  }

  // 客户的拜访列表
  if (customerId) {
    try {
      const r = await request('/api/visits/customer/' + customerId, { headers: { 'Authorization': token } });
      log('GET /api/visits/customer/{id} (客户拜访历史)', r.status, r.data);
    } catch (e) { log('GET /api/visits/customer/{id}', 0, null, e.message); }
  }

  // ---- 6. 提醒管理 ----
  console.log('\n[6] 提醒管理接口');
  try {
    const r = await request('/api/reminders/my', { headers: { 'Authorization': token } });
    log('GET /api/reminders/my (我的提醒)', r.status, r.data);
  } catch (e) { log('GET /api/reminders/my', 0, null, e.message); }

  // ---- 7. 用户管理 ----
  console.log('\n[7] 用户管理接口');
  try {
    const r = await request('/api/auth/users', { headers: { 'Authorization': token } });
    log('GET /api/auth/users (用户列表)', r.status, r.data);
  } catch (e) { log('GET /api/auth/users', 0, null, e.message); }

  // 业务员列表
  try {
    const r = await request('/api/auth/salespersons', { headers: { 'Authorization': token } });
    log('GET /api/auth/salespersons (业务员列表)', r.status, r.data);
  } catch (e) { log('GET /api/auth/salespersons', 0, null, e.message); }

  // 管理员权限
  try {
    const r = await request('/api/auth/admins/' + userId + '/permissions', { headers: { 'Authorization': token } });
    log('GET /api/auth/admins/{id}/permissions', r.status, r.data);
  } catch (e) { log('GET /api/auth/admins/{id}/permissions', 0, null, e.message); }

  // 修改密码
  try {
    const r = await request('/api/auth/change-password', { method: 'POST', headers: authHeader }, {
      oldPassword: 'admin123456',
      newPassword: 'admin123456'
    });
    log('POST /api/auth/change-password', r.status, r.data);
  } catch (e) { log('POST /api/auth/change-password', 0, null, e.message); }

  // ---- 8. 管理功能 ----
  console.log('\n[8] 管理功能接口');

  // 仪表盘
  try {
    const r = await request('/api/admin/dashboard?year=2026&month=6', { headers: { 'Authorization': token } });
    log('GET /api/admin/dashboard (仪表盘)', r.status, r.data);
  } catch (e) { log('GET /api/admin/dashboard', 0, null, e.message); }

  // 导出报告
  try {
    const r = await request('/api/admin/export', { method: 'POST', headers: authHeader }, {
      year: 2026, month: 6, scopeType: 'all', scopeValue: null
    });
    log('POST /api/admin/export (月度报告导出)', r.status, { isExcel: typeof r.data === 'object' && r.data.raw ? '返回二进制' : '返回文本' });
  } catch (e) { log('POST /api/admin/export', 0, null, e.message); }

  // 报告列表
  try {
    const r = await request('/api/admin/reports', { headers: { 'Authorization': token } });
    log('GET /api/admin/reports (报告列表)', r.status, r.data);
  } catch (e) { log('GET /api/admin/reports', 0, null, e.message); }

  // ---- 9. 系统配置 ----
  console.log('\n[9] 系统配置接口');
  try {
    const r = await request('/api/admin/config', { headers: { 'Authorization': token } });
    log('GET /api/admin/config (系统配置)', r.status, r.data);
  } catch (e) { log('GET /api/admin/config', 0, null, e.message); }

  // ---- 10. 错误输入测试 ----
  console.log('\n[10] 异常输入测试（应返回合理错误）');
  try {
    const r = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' } }, { username: 'admin', password: 'wrong_password' });
    log('POST /api/auth/login (错误密码)', r.status, r.data);
  } catch (e) { log('POST /api/auth/login (错误密码)', 0, null, e.message); }

  try {
    const r = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' } }, {});
    log('POST /api/auth/login (空请求体)', r.status, r.data);
  } catch (e) { log('POST /api/auth/login (空请求体)', 0, null, e.message); }

  try {
    const r = await request('/api/customers', { method: 'POST', headers: authHeader }, {});
    log('POST /api/customers (空字段)', r.status, r.data);
  } catch (e) { log('POST /api/customers (空字段)', 0, null, e.message); }

  // ---- 11. CORS 预检 ----
  console.log('\n[11] CORS 预检');
  try {
    const r = await request('/api/health', { method: 'OPTIONS', headers: { 'Origin': 'http://localhost:5173', 'Access-Control-Request-Method': 'GET' } });
    log('OPTIONS /api/health (CORS 预检)', r.status, { corsOK: r.status === 200 });
  } catch (e) { log('OPTIONS /api/health (CORS)', 0, null, e.message); }

  // ---- 汇总 ----
  console.log('\n\n========== 测试结果汇总 ==========');
  const total = results.length;
  const passCount = results.filter(x => x.ok || x.status === 401 || x.status === 403 || x.status === 400).length;
  const failCount = total - passCount;
  const realErrors = results.filter(x => x.status >= 500 || x.status === 0);

  console.log(`\n总接口数: ${total}`);
  console.log(`✅ 通过 (2xx/401/403/400): ${passCount}`);
  console.log(`❌ 失败 (5xx/网络错误): ${failCount}`);

  if (realErrors.length > 0) {
    console.log('\n--- 严重错误详情 ---');
    realErrors.forEach(x => console.log(`  ❌ ${x.name}: HTTP ${x.status} - ${x.error || JSON.stringify(x.data).substring(0, 200)}`));
  }

  console.log('\n--- 测试完成 ---');
}

run().catch(err => {
  console.error('测试脚本崩溃:', err);
  process.exit(1);
});
