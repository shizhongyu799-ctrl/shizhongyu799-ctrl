const { query } = require('../config/db');
const bcrypt = require('bcryptjs');

// ============== 测试配置 ==============
const DEFAULT_PASSWORD = '123456';
const SALESPERSONS = [
  { username: 'wangli',   realName: '王丽',   role: 'salesperson' },
  { username: 'zhaoming', realName: '赵明',   role: 'salesperson' },
  { username: 'chenjie',  realName: '陈杰',   role: 'salesperson' },
  { username: 'liuxiao',  realName: '刘潇',   role: 'salesperson' },
  { username: 'sunyu',    realName: '孙宇',   role: 'salesperson' }
];

// 测试客户 - 分布在多个城市，便于地图测试
const CUSTOMERS = [
  // 上海
  { company: '上海启航科技有限公司',   contact: '张经理', phone: '13800138001', address: '上海市浦东新区世纪大道100号',     lat: 31.2335, lng: 121.5061 },
  { company: '上海锦华贸易有限公司',   contact: '李总',   phone: '13800138002', address: '上海市浦东新区张江高科技园区',      lat: 31.2100, lng: 121.5970 },
  { company: '上海新视野文化传媒',      contact: '王先生', phone: '13800138003', address: '上海市徐汇区漕溪北路333号',         lat: 31.1887, lng: 121.4378 },
  { company: '上海浦东智能装备',         contact: '陈工',   phone: '13800138004', address: '上海市浦东新区金海路2588号',        lat: 31.2743, lng: 121.6251 },
  // 北京
  { company: '北京中创信测科技',         contact: '周总',   phone: '13900139001', address: '北京市海淀区中关村大街1号',          lat: 39.9795, lng: 116.3108 },
  { company: '北京数字长城科技',         contact: '刘经理', phone: '13900139002', address: '北京市朝阳区望京soho塔1',           lat: 40.0044, lng: 116.4730 },
  { company: '北京奥泰医疗器械',         contact: '孙总',   phone: '13900139003', address: '北京市东城区东四十条94号',          lat: 39.9399, lng: 116.4301 },
  // 深圳
  { company: '深圳市星源电子',           contact: '黄经理', phone: '13700137001', address: '深圳市南山区高新南一道8号',          lat: 22.5402, lng: 113.9341 },
  { company: '深圳腾达智能制造',         contact: '吴总',   phone: '13700137002', address: '深圳市宝安区福永街道107国道旁',      lat: 22.6730, lng: 113.8537 },
  { company: '深圳前海湾物流',           contact: '郑经理', phone: '13700137003', address: '深圳市南山区前海合作区临海大道',     lat: 22.5081, lng: 113.9028 },
  // 广州
  { company: '广州白云山生物科技',       contact: '林总',   phone: '13600136001', address: '广州市白云区同泰路88号',              lat: 23.1749, lng: 113.2842 },
  { company: '广州天河软件产业园',       contact: '徐经理', phone: '13600136002', address: '广州市天河区天河路385号',             lat: 23.1321, lng: 113.3223 },
  // 杭州
  { company: '杭州西湖数字科技',         contact: '胡总',   phone: '13500135001', address: '杭州市西湖区文三路90号',              lat: 30.2818, lng: 120.1348 },
  { company: '杭州滨江智慧城市',         contact: '高经理', phone: '13500135002', address: '杭州市滨江区江南大道4760号',         lat: 30.2085, lng: 120.2106 },
  // 成都
  { company: '成都天府软件园',           contact: '何总',   phone: '13400134001', address: '成都市高新区天府大道中段1268号',     lat: 30.5445, lng: 104.0668 },
  { company: '成都锦华建设集团',         contact: '罗经理', phone: '13400134002', address: '成都市锦江区红星路三段1号',          lat: 30.6548, lng: 104.0812 },
  // 武汉
  { company: '武汉光谷激光科技',         contact: '谢总',   phone: '13300133001', address: '武汉市东湖高新区光谷大道77号',        lat: 30.5084, lng: 114.4195 },
  // 南京
  { company: '南京江宁智能制造',         contact: '韩经理', phone: '13200132001', address: '南京市江宁区胜太西路88号',            lat: 31.9087, lng: 118.8323 },
  // 西安
  { company: '西安高新区半导体',         contact: '唐总',   phone: '13100131001', address: '西安市雁塔区高新路25号',              lat: 34.2286, lng: 108.8896 },
  // 苏州
  { company: '苏州工业园区精密制造',     contact: '冯经理', phone: '13000130001', address: '苏州市工业园区星湖街328号',          lat: 31.3215, lng: 120.6783 }
];

// 拜访结果与类型的随机池
const VISIT_TYPES = ['onsite', 'phone'];
const VISIT_RESULTS = ['deal', 'follow_up', 'no_interest'];

// 为每个客户生成的拜访记录条数范围（随机）
const VISIT_PER_CUSTOMER = [1, 4]; // 1~4 条

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function pad(n) { return String(n).padStart(2, '0'); }

// 在给定日期范围内随机选一个日期
function randomDateInRange(start, end) {
  const s = start.getTime();
  const e = end.getTime();
  return new Date(s + Math.random() * (e - s));
}

async function main() {
  console.log('============ 开始插入测试数据 ============\n');

  // 1. 确认超级管理员存在
  const superAdmin = await query(
    "SELECT id, username FROM users WHERE role = 'super_admin' ORDER BY id LIMIT 1"
  );
  if (superAdmin.rows.length === 0) {
    console.error('✗ 没有找到 super_admin，请先执行 init-db.js 初始化');
    process.exit(1);
  }
  const superAdminId = superAdmin.rows[0].id;
  console.log(`✓ super_admin: id=${superAdminId}, username=${superAdmin.rows[0].username}`);

  // 2. 创建新测试业务员（如果已存在则跳过）
  const pwdHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const createdSales = [];
  for (const sp of SALESPERSONS) {
    const exist = await query('SELECT id FROM users WHERE username = $1', [sp.username]);
    if (exist.rows.length > 0) {
      createdSales.push({ id: exist.rows[0].id, username: sp.username, realName: sp.realName });
      console.log(`  · 业务员 ${sp.username}(${sp.realName}) 已存在，跳过`);
      continue;
    }
    const res = await query(
      `INSERT INTO users (username, password_hash, real_name, role, created_by)
       VALUES ($1, $2, $3, 'salesperson', $4) RETURNING id`,
      [sp.username, pwdHash, sp.realName, superAdminId]
    );
    createdSales.push({ id: res.rows[0].id, username: sp.username, realName: sp.realName });
    console.log(`  · 已新增业务员: ${sp.username}/${sp.realName} (id=${res.rows[0].id})`);
  }
  console.log(`\n✓ 业务员共 ${createdSales.length} 个（密码均为 ${DEFAULT_PASSWORD}）`);

  // 3. 插入测试客户，平均分配给所有业务员（含 super_admin 也参与分配）
  //    先确认所有业务员 + 管理员的 id 池
  const allUsers = await query(
    "SELECT id, username, real_name, role FROM users WHERE role IN ('super_admin', 'salesperson')"
  );
  const assignPool = allUsers.rows.filter(u => u.role === 'salesperson').length > 0
    ? allUsers.rows.filter(u => u.role === 'salesperson')
    : allUsers.rows;

  console.log(`\n开始插入 ${CUSTOMERS.length} 个测试客户...`);
  const now = new Date();
  const createdCustomers = [];
  for (let i = 0; i < CUSTOMERS.length; i++) {
    const c = CUSTOMERS[i];
    // 随机分配一个业务员
    const owner = assignPool[i % assignPool.length];

    // 随机状态：大部分 intent，部分 cooperated，少量 lost
    const status = pick(['intent', 'intent', 'intent', 'cooperated', 'cooperated', 'lost']);

    const res = await query(
      `INSERT INTO customers
        (company_name, contact, phone, address, lat, lng, status, salesperson_id,
         health_status, created_by, is_in_pool, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'normal', $9, false, $10, $10)
       RETURNING id`,
      [c.company, c.contact, c.phone, c.address, c.lat, c.lng, status, owner.id, superAdminId, now]
    );
    createdCustomers.push({
      id: res.rows[0].id,
      company: c.company,
      ownerId: owner.id,
      ownerName: owner.real_name || owner.username,
      status
    });
  }
  console.log(`✓ 已插入 ${createdCustomers.length} 个测试客户`);

  // 4. 插入拜访记录 —— 每个客户随机 1~4 条，时间分布在过去 45 天 ~ 未来 60 天
  //    过去的作为历史拜访，未来的作为"下次跟进"（next_follow_up）
  console.log('\n开始插入测试拜访记录...');
  const pastStart = new Date();
  pastStart.setDate(pastStart.getDate() - 45);
  const futureEnd = new Date();
  futureEnd.setDate(futureEnd.getDate() + 60);

  let visitCount = 0;
  for (const customer of createdCustomers) {
    const visitNum = randInt(VISIT_PER_CUSTOMER[0], VISIT_PER_CUSTOMER[1]);
    // 至少保证一条有 next_follow_up（日历页面用）
    for (let i = 0; i < visitNum; i++) {
      const isLast = i === visitNum - 1;
      // 拜访时间：随机分布
      const visitDate = randomDateInRange(pastStart, futureEnd);
      const visitType = pick(VISIT_TYPES);
      // 成交客户结果更倾向 deal
      const result = customer.status === 'cooperated'
        ? pick(['deal', 'deal', 'follow_up'])
        : pick(VISIT_RESULTS);

      // next_follow_up：50% 概率有下次跟进（最后一条必带以便日历显示）
      let nextFollowUp = null;
      if (isLast || Math.random() > 0.5) {
        const nextD = new Date(visitDate);
        nextD.setDate(nextD.getDate() + randInt(3, 21));
        nextFollowUp = `${nextD.getFullYear()}-${pad(nextD.getMonth() + 1)}-${pad(nextD.getDate())}`;
      }

      // 拜访时间（visit_time）也存储到数据库 — 写成完整 timestamptz 字符串
      const visitTimeStr = `${visitDate.getFullYear()}-${pad(visitDate.getMonth() + 1)}-${pad(visitDate.getDate())} ${pad(randInt(8, 18))}:${pad(randInt(0, 59))}:00`;

      await query(
        `INSERT INTO visits
          (customer_id, salesperson_id, visit_time, visit_type, result, next_follow_up, created_at)
         VALUES ($1, $2, $3::timestamp, $4, $5, $6::date, CURRENT_TIMESTAMP)`,
        [customer.id, customer.ownerId, visitTimeStr, visitType, result, nextFollowUp]
      );
      visitCount++;
    }
  }
  console.log(`✓ 已插入 ${visitCount} 条拜访记录`);

  // 5. 更新每个客户的 last_visit_at 为最新一次拜访时间
  console.log('\n更新客户最新拜访时间...');
  await query(
    `UPDATE customers c SET last_visit_at = (
       SELECT MAX(v.visit_time) FROM visits v WHERE v.customer_id = c.id
     )
     WHERE EXISTS (SELECT 1 FROM visits v WHERE v.customer_id = c.id)`
  );
  console.log('✓ 已更新 last_visit_at');

  // 6. 触发健康度重算
  await query(
    `UPDATE customers SET health_status = CASE
       WHEN last_visit_at IS NULL OR last_visit_at < (CURRENT_TIMESTAMP - '30 days'::interval) THEN 'warning'
       ELSE 'normal'
     END WHERE status != 'lost' AND is_in_pool = false`
  );
  console.log('✓ 已重算健康状态');

  console.log('\n============ 全部完成 ============');
  console.log(`登录账号: 任意业务员账号 / 密码 ${DEFAULT_PASSWORD}`);
  console.log(`管理员账号: admin / admin123456（或系统原有密码）`);

  // 简单汇总输出
  const summary = await query(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE role = 'salesperson') AS sales_n,
      (SELECT COUNT(*) FROM customers) AS customer_n,
      (SELECT COUNT(*) FROM visits) AS visit_n
  `);
  const s = summary.rows[0];
  console.log(`当前统计: 业务员 ${s.sales_n} 人，客户 ${s.customer_n} 家，拜访记录 ${s.visit_n} 条`);

  process.exit(0);
}

main().catch((err) => {
  console.error('执行失败:', err);
  process.exit(1);
});
