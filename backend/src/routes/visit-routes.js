const express = require('express');
const { query } = require('../config/db');
const { auth, buildCustomerWhereForUser, requirePermission, hasModulePermission } = require('../middleware/auth');
const { logOperation } = require('./log-routes');

const router = express.Router();

// ---------- 工具：GPS 字段从 NUMERIC 转回 number ----------
function normalizeVisitFields(v) {
  if (!v) return v;
  if (v.gps_lat != null && typeof v.gps_lat === 'string') v.gps_lat = parseFloat(v.gps_lat);
  if (v.gps_lng != null && typeof v.gps_lng === 'string') v.gps_lng = parseFloat(v.gps_lng);
  return v;
}
function normalizeVisitList(rows) {
  return rows.map(normalizeVisitFields);
}

// ==================== 客户的拜访记录列表 ====================
router.get('/customer/:customerId', auth, requirePermission('visit:view'), async (req, res) => {
  const customerId = parseInt(req.params.customerId, 10);
  const filter = await buildCustomerWhereForUser(req.user.id, 2);
  const scopeFilter = filter.sql
    ? `AND (c.salesperson_id IS NULL OR ${filter.sql.replace(/salesperson_id/g, 'c.salesperson_id')})`
    : '';

  const result = await query(
    `SELECT v.*, u.real_name AS salesperson_name, c.company_name
     FROM visits v
     JOIN customers c ON c.id = v.customer_id
     JOIN users u ON u.id = v.salesperson_id
     WHERE v.customer_id = $1 ${scopeFilter}
     ORDER BY v.visit_time DESC`,
    [customerId, ...filter.params]
  );
  res.json({ visits: normalizeVisitList(result.rows) });
});

// ==================== 我的拜访记录 ====================
router.get('/my', auth, requirePermission('visit:view'), async (req, res) => {
  const { page = 1, pageSize = 20 } = req.query;
  // 主查询的 WHERE 子句（LIMIT=$1, OFFSET=$2, salesperson_id=$3）
  const whereForMain = req.user.role === 'salesperson'
    ? 'WHERE v.salesperson_id = $3'
    : 'WHERE 1=1';
  // COUNT 查询的 WHERE 子句（只有 1 个参数）
  const whereForCount = req.user.role === 'salesperson'
    ? 'WHERE v.salesperson_id = $1'
    : 'WHERE 1=1';
  const params = [parseInt(pageSize, 10), (parseInt(page, 10) - 1) * parseInt(pageSize, 10)];
  if (req.user.role === 'salesperson') params.push(req.user.id);

  const count = await query(
    `SELECT COUNT(*) FROM visits v ${whereForCount}`,
    req.user.role === 'salesperson' ? [req.user.id] : []
  );

  const result = await query(
    `SELECT v.*, u.real_name AS salesperson_name, c.company_name, c.contact
     FROM visits v
     JOIN customers c ON c.id = v.customer_id
     JOIN users u ON u.id = v.salesperson_id
     ${whereForMain}
     ORDER BY v.visit_time DESC
     LIMIT $1 OFFSET $2`,
    params
  );
  res.json({ visits: normalizeVisitList(result.rows), total: parseInt(count.rows[0].count, 10) });
});

// ==================== 新增拜访记录 ====================
router.post('/', auth, requirePermission('visit:edit'), async (req, res) => {
  const body = req.body || {};
  const { customerId, visitType = 'onsite', content, result = 'follow_up', nextFollowUp, gpsLat, gpsLng } = body;
  if (!customerId) return res.status(400).json({ error: '缺少客户' });

  const filter = await buildCustomerWhereForUser(req.user.id, 2);
  const where = filter.sql ? `AND ${filter.sql}` : '';
  const exist = await query(`SELECT id FROM customers WHERE id = $1 ${where}`, [customerId, ...filter.params]);
  if (exist.rows.length === 0) return res.status(404).json({ error: '客户不存在或无权操作' });

  const visitRes = await query(
    `INSERT INTO visits (customer_id, salesperson_id, visit_type, content, result, next_follow_up, gps_lat, gps_lng)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      parseInt(customerId, 10),
      req.user.id,
      visitType,
      content || '',
      result,
      nextFollowUp || null,
      gpsLat != null ? parseFloat(gpsLat) : null,
      gpsLng != null ? parseFloat(gpsLng) : null
    ]
  );

  // 更新客户 last_visit_at, health_status
  await query(
    `UPDATE customers SET last_visit_at = CURRENT_TIMESTAMP, health_status = 'normal', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [parseInt(customerId, 10)]
  );

  // 若设置了下次跟进日期，创建提醒（通过唯一约束去重）
  if (nextFollowUp) {
    await query(
      `INSERT INTO reminders (user_id, customer_id, type, title, content, trigger_date)
       VALUES ($1, $2, 'follow_up', $3, $4, $5)
       ON CONFLICT (user_id, customer_id, type, trigger_date) DO NOTHING`,
      [req.user.id, parseInt(customerId, 10), `跟进：${body.companyName || '客户'}`, content || '', nextFollowUp]
    );
  }

  // 返回完整的拜访记录对象（含公司名和业务员名）
  const detail = await query(
    `SELECT v.*, u.real_name AS salesperson_name, c.company_name, c.contact
     FROM visits v
     JOIN customers c ON c.id = v.customer_id
     JOIN users u ON u.id = v.salesperson_id
     WHERE v.id = $1`,
    [visitRes.rows[0].id]
  );
  const visitData = detail.rows[0];
  const resultLabel = { deal: '成交', follow_up: '继续跟进', no_interest: '无意向' }[result] || result;
  const visitTypeLabel = { onsite: '现场拜访', phone: '电话拜访' }[visitType] || visitType;
  logOperation(req.user.id, req.user.username, 'visit_create', 'customer', parseInt(customerId), visitData.company_name,
    `新增${visitTypeLabel}记录：公司=${visitData.company_name}，结果=${resultLabel}${nextFollowUp ? `，下次跟进=${nextFollowUp}` : ''}`, req.ip);
  res.json({ visit: normalizeVisitFields(visitData) });
});

// ==================== 日历数据（本月的跟进计划） ====================
router.get('/calendar', auth, requirePermission('calendar:view'), async (req, res) => {
  const { year, month } = req.query;
  const y = parseInt(year, 10) || new Date().getFullYear();
  const m = parseInt(month, 10) || new Date().getMonth() + 1;

  const startStr = `${y}-${String(m).padStart(2, '0')}-01`;
  const endDate = new Date(y, m, 0);
  const endStr = endDate.toISOString().slice(0, 10);

  const filter = await buildCustomerWhereForUser(req.user.id, 3);
  const scopeFilter = filter.sql
    ? `AND (c.salesperson_id IS NULL OR ${filter.sql.replace(/salesperson_id/g, 'c.salesperson_id')})`
    : '';

  const result = await query(
    `SELECT v.next_follow_up AS date, v.customer_id, c.company_name, c.contact, c.phone,
            v.id AS visit_id, u.real_name AS salesperson_name
     FROM visits v
     JOIN customers c ON c.id = v.customer_id
     LEFT JOIN users u ON u.id = v.salesperson_id
     WHERE v.next_follow_up BETWEEN $1 AND $2 ${scopeFilter}
     ORDER BY v.next_follow_up`,
    [startStr, endStr, ...filter.params]
  );
  res.json({ items: result.rows });
});

// ==================== 拜访记录详情（必须在所有静态路由之后，否则 /:id 会匹配 /calendar 等） ====================
router.get('/:id', auth, requirePermission('visit:view'), async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  // 如果不是纯数字ID，让后续路由处理（实际上这里没有后续路由，但防止 calendar 等误匹配）
  if (isNaN(id)) return next();
  const filter = await buildCustomerWhereForUser(req.user.id, 2);
  const scopeFilter = filter.sql
    ? `AND (c.salesperson_id IS NULL OR ${filter.sql.replace(/salesperson_id/g, 'c.salesperson_id')})`
    : '';
  const result = await query(
    `SELECT v.*, u.real_name AS salesperson_name, c.company_name, c.contact, c.address, c.phone
     FROM visits v
     JOIN customers c ON c.id = v.customer_id
     JOIN users u ON u.id = v.salesperson_id
     WHERE v.id = $1 ${scopeFilter}`,
    [id, ...filter.params]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: '拜访记录不存在' });
  res.json({ visit: normalizeVisitFields(result.rows[0]) });
});

module.exports = router;
