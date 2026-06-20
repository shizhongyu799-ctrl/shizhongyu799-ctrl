const express = require('express');
const { query } = require('../config/db');
const { auth, hasModulePermission, buildCustomerWhereForUser, requirePermission } = require('../middleware/auth');
const { logOperation } = require('./log-routes');

const router = express.Router();

// ---------- 工具：健康度自动标记 ----------
function normalizeCustomerFields(c) {
  if (!c) return c;
  if (c.lat != null && typeof c.lat === 'string') c.lat = parseFloat(c.lat);
  if (c.lng != null && typeof c.lng === 'string') c.lng = parseFloat(c.lng);
  return c;
}

function normalizeCustomerList(rows) {
  return rows.map(normalizeCustomerFields);
}
async function computeHealthStatus(salespersonId, customerId) {
  try {
    const cfg = await query("SELECT config_value FROM system_config WHERE config_key = 'health_check_days'");
    const days = parseInt(cfg.rows[0]?.config_value || '30', 10) || 30;
    await query(
      `UPDATE customers SET health_status = CASE
         WHEN last_visit_at IS NULL OR last_visit_at < (CURRENT_TIMESTAMP - ($1 || ' days')::interval) THEN 'warning'
         ELSE 'normal'
       END WHERE id = $2`,
      [String(days), customerId]
    );
  } catch {}
}

async function refreshAllHealth() {
  try {
    const cfg = await query("SELECT config_value FROM system_config WHERE config_key = 'health_check_days'");
    const days = parseInt(cfg.rows[0]?.config_value || '30', 10) || 30;
    await query(
      `UPDATE customers SET health_status = CASE
         WHEN last_visit_at IS NULL OR last_visit_at < (CURRENT_TIMESTAMP - ($1 || ' days')::interval) THEN 'warning'
         ELSE 'normal'
       END WHERE status != 'lost' AND is_in_pool = false`
    , [String(days)]);
  } catch {}
}

// ==================== 客户列表（带搜索/状态过滤） ====================
router.get('/', auth, requirePermission('customer:view'), async (req, res) => {
  await refreshAllHealth();
  const { search, status, healthStatus, inPool, page = 1, pageSize = 20 } = req.query;
  const filter = await buildCustomerWhereForUser(req.user.id);
  const conditions = [];
  const params = [];
  let idx = 1;

  if (filter.sql) {
    conditions.push(filter.sql);
    filter.params.forEach((p) => params.push(p));
    idx += filter.params.length;
  }

  if (search) {
    conditions.push(`(company_name ILIKE $${idx} OR contact ILIKE $${idx} OR phone ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }
  if (status) {
    conditions.push(`status = $${idx++}`);
    params.push(status);
  }
  if (healthStatus) {
    conditions.push(`health_status = $${idx++}`);
    params.push(healthStatus);
  }
  const inPoolVal = inPool === 'true' ? true : inPool === 'false' ? false : null;
  if (inPoolVal !== null) {
    conditions.push(`is_in_pool = $${idx++}`);
    params.push(inPoolVal);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRes = await query(`SELECT COUNT(*) FROM customers ${whereSql}`, params);
  const total = parseInt(countRes.rows[0].count, 10);

  const limitIdx = idx;
  const offsetIdx = idx + 1;
  const result = await query(
    `SELECT c.*, u.real_name AS salesperson_name
     FROM customers c
     LEFT JOIN users u ON u.id = c.salesperson_id
     ${whereSql}
     ORDER BY c.created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    [...params, parseInt(pageSize, 10), (parseInt(page, 10) - 1) * parseInt(pageSize, 10)]
  );

  res.json({ customers: normalizeCustomerList(result.rows), total, page: parseInt(page, 10), pageSize: parseInt(pageSize, 10) });
});

// ==================== 地图用：全部客户点位 ====================
router.get('/markers', auth, requirePermission('map:view'), async (req, res) => {
  await refreshAllHealth();
  const filter = await buildCustomerWhereForUser(req.user.id);
  const whereSql = filter.sql ? `WHERE ${filter.sql}` : '';

  const result = await query(
    `SELECT id, company_name, contact, phone, address, lat, lng, status, health_status, salesperson_id
     FROM customers ${whereSql}`,
    filter.params
  );
  res.json({ markers: normalizeCustomerList(result.rows) });
});

// ==================== 地图画圈筛选：矩形/半径内的客户 ====================
router.post('/area-filter', auth, requirePermission('map:draw'), async (req, res) => {
  await refreshAllHealth();
  const { lat, lng, radiusKm = 5 } = req.body || {};
  if (lat == null || lng == null) {
    return res.status(400).json({ error: '缺少经纬度' });
  }
  const filter = await buildCustomerWhereForUser(req.user.id, 4);
  const baseWhere = filter.sql ? `AND ${filter.sql}` : '';

  const result = await query(
    `SELECT id, company_name, contact, phone, address, lat, lng, status, health_status, salesperson_id
     FROM customers
     WHERE lat IS NOT NULL AND lng IS NOT NULL
       AND (
         POWER(($1::double precision - lat) * 111.32, 2) +
         POWER(($2::double precision - lng) * 111.32 * COS(RADIANS($1::double precision)), 2)
       ) <= ($3::double precision * $3::double precision)
       ${baseWhere}
     ORDER BY company_name`,
    [parseFloat(lat), parseFloat(lng), parseFloat(radiusKm), ...filter.params]
  );
  res.json({ customers: normalizeCustomerList(result.rows) });
});

// ==================== 客户详情 ====================
router.get('/:id', auth, requirePermission('customer:view'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const filter = await buildCustomerWhereForUser(req.user.id, 2);
  const where = filter.sql ? `AND ${filter.sql}` : '';
  const result = await query(
    `SELECT c.*, u.real_name AS salesperson_name
     FROM customers c LEFT JOIN users u ON u.id = c.salesperson_id
     WHERE c.id = $1 ${where}`,
    [id, ...filter.params]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: '客户不存在' });
  res.json({ customer: normalizeCustomerFields(result.rows[0]) });
});

// ==================== 新增客户 ====================
router.post('/', auth, requirePermission('customer:edit'), async (req, res) => {
  const body = req.body || {};
  const { companyName, contact, phone, address, status = 'intent', salesVolume, lat, lng } = body;
  if (!companyName || !contact || !phone || !address) {
    return res.status(400).json({ error: '公司名称/联系人/电话/地址必填' });
  }

  // 归属业务员：默认自己；有 user:manage 权限的管理员或超级管理员可指定
  let salespersonId = req.user.role === 'salesperson' ? req.user.id : null;
  if (body.salespersonId) {
    const canAssign = req.user.role === 'super_admin' || await hasModulePermission(req.user.id, 'pool:manage');
    if (canAssign) salespersonId = parseInt(body.salespersonId, 10);
    else salespersonId = req.user.id;
  }

  const result = await query(
    `INSERT INTO customers
     (company_name, contact, phone, address, lat, lng, status, sales_volume, salesperson_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, company_name, contact, phone, address, status, salesperson_id`,
    [companyName, contact, phone, address,
     (lat != null && lat !== '') ? parseFloat(lat) : null,
     (lng != null && lng !== '') ? parseFloat(lng) : null,
     status, salesVolume || '', salespersonId, req.user.id]
  );

  const newCustomer = result.rows[0];
  logOperation(req.user.id, req.user.username, 'customer_create', 'customer', newCustomer.id, companyName,
    `新增客户：公司=${companyName}，联系人=${contact}，电话=${phone}，地址=${address}`, req.ip);
  await computeHealthStatus(req.user.id, newCustomer.id);
  res.json({ customer: normalizeCustomerFields({ ...newCustomer, id: newCustomer.id }) });
});

// ==================== 更新客户 ====================
router.put('/:id', auth, requirePermission('customer:edit'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const body = req.body || {};

  const filter = await buildCustomerWhereForUser(req.user.id, 2);
  const where = filter.sql ? `AND ${filter.sql}` : '';
  const exist = await query(`SELECT id FROM customers WHERE id = $1 ${where}`, [id, ...filter.params]);
  if (exist.rows.length === 0) return res.status(404).json({ error: '客户不存在或无权操作' });

  const updates = [];
  const params = [];
  let idx = 1;
  const map = {
    companyName: 'company_name', contact: 'contact', phone: 'phone',
    address: 'address', status: 'status', salesVolume: 'sales_volume',
    lat: 'lat', lng: 'lng'
  };
  for (const [key, col] of Object.entries(map)) {
    if (body[key] !== undefined && body[key] !== null) {
      let val = body[key];
      // lat/lng 空字符串转为 null
      if ((key === 'lat' || key === 'lng') && val === '') {
        val = null;
      }
      updates.push(`${col} = $${idx++}`);
      params.push(val);
    }
  }

  // 归属业务员变更
  if (body.salespersonId !== undefined) {
    const canAssign = req.user.role === 'super_admin' || await hasModulePermission(req.user.id, 'pool:manage');
    if (canAssign) {
      updates.push(`salesperson_id = $${idx++}`);
      params.push(body.salespersonId || null);
      updates.push(`is_in_pool = $${idx++}`);
      params.push(body.salespersonId ? false : true);  // 有归属则不在公海池
    }
  }
  if (updates.length === 0) return res.json({ ok: true });

  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  params.push(id);
  await query(`UPDATE customers SET ${updates.join(', ')} WHERE id = $${idx}`, params);

  // 获取客户名称用于日志
  const customerInfo = await query('SELECT company_name FROM customers WHERE id = $1', [id]);
  const companyName = customerInfo.rows[0]?.company_name || `ID:${id}`;
  logOperation(req.user.id, req.user.username, 'customer_update', 'customer', id, companyName,
    `修改客户信息：${Object.keys(body).filter(k => body[k] !== undefined).join(', ')}`, req.ip);

  await computeHealthStatus(req.user.id, id);
  res.json({ ok: true });
});

// ==================== 删除客户 ====================
router.delete('/:id', auth, requirePermission('customer:delete'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const filter = await buildCustomerWhereForUser(req.user.id, 2);
  const where = filter.sql ? `AND ${filter.sql}` : '';
  const r = await query(`DELETE FROM customers WHERE id = $1 ${where} RETURNING id, company_name`, [id, ...filter.params]);
  if (r.rows.length === 0) return res.status(404).json({ error: '客户不存在或无权操作' });
  logOperation(req.user.id, req.user.username, 'customer_delete', 'customer', id, r.rows[0].company_name,
    `删除客户：${r.rows[0].company_name}`, req.ip);
  res.json({ ok: true });
});

// ==================== 批量转移到公海池 ====================
router.post('/pool/move', auth, requirePermission('pool:manage'), async (req, res) => {
  const { customerIds } = req.body || {};
  if (!Array.isArray(customerIds) || customerIds.length === 0) {
    return res.status(400).json({ error: '请选择客户' });
  }
  // 数据范围限制：仅可操作自己数据范围内的客户
  const filter = await buildCustomerWhereForUser(req.user.id, 3);
  const scopeWhere = filter.sql ? `AND ${filter.sql}` : '';
  // 获取客户名称用于日志
  const namesRes = await query(
    `SELECT company_name FROM customers WHERE id = ANY($1::int[]) ${scopeWhere}`,
    [customerIds, ...filter.params]
  );
  const names = namesRes.rows.map(r => r.company_name).join(', ');
  const updateRes = await query(
    `UPDATE customers SET salesperson_id = NULL, is_in_pool = true, pool_moved_by = $1, pool_moved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ANY($2::int[]) ${scopeWhere}`,
    [req.user.id, customerIds, ...filter.params]
  );
  logOperation(req.user.id, req.user.username, 'customer_pool_move', 'customer', null, `${customerIds.length}个客户`,
    `将客户移入公海池：${names || '(未获取到名称)'}`, req.ip);
  res.json({ ok: true, moved: updateRes.rowCount || 0 });
});

// ==================== 从公海池分配给业务员 ====================
router.post('/pool/assign', auth, requirePermission('pool:manage'), async (req, res) => {
  const { customerIds, salespersonId } = req.body || {};
  if (!Array.isArray(customerIds) || customerIds.length === 0 || !salespersonId) {
    return res.status(400).json({ error: '缺少参数' });
  }
  // 验证业务员是否存在
  const checkSales = await query(
    "SELECT id, username, real_name FROM users WHERE id = $1 AND role = 'salesperson' AND is_locked = false",
    [parseInt(salespersonId, 10)]
  );
  if (checkSales.rows.length === 0) {
    return res.status(400).json({ error: '业务员不存在或已锁定' });
  }
  const salesName = checkSales.rows[0].real_name || checkSales.rows[0].username;
  // 获取客户名称用于日志
  const namesRes = await query(`SELECT company_name FROM customers WHERE id = ANY($1::int[])`, [customerIds]);
  const names = namesRes.rows.map(r => r.company_name).join(', ');
  const filter = await buildCustomerWhereForUser(req.user.id, 3);
  const scopeWhere = filter.sql ? `AND ${filter.sql}` : '';
  const updateRes = await query(
    `UPDATE customers SET salesperson_id = $1, is_in_pool = false, updated_at = CURRENT_TIMESTAMP
     WHERE id = ANY($2::int[]) AND is_in_pool = true ${scopeWhere}`,
    [parseInt(salespersonId, 10), customerIds, ...filter.params]
  );
  logOperation(req.user.id, req.user.username, 'customer_assign', 'customer', parseInt(salespersonId), salesName,
    `从公海池分配客户给${salesName}：${names || '(未获取到名称)'}`, req.ip);
  res.json({ ok: true, assigned: updateRes.rowCount || 0 });
});

// ==================== 公海池客户列表 ====================
router.get('/pool/list', auth, requirePermission('pool:manage'), async (req, res) => {
  const { search, page = 1, pageSize = 20 } = req.query;
  const sql = search
    ? `SELECT c.*, NULL AS salesperson_name FROM customers c
       WHERE is_in_pool = true AND (company_name ILIKE $3 OR contact ILIKE $3)
       ORDER BY created_at DESC LIMIT $1 OFFSET $2`
    : `SELECT c.*, NULL AS salesperson_name FROM customers c
       WHERE is_in_pool = true ORDER BY created_at DESC LIMIT $1 OFFSET $2`;
  const params = [parseInt(pageSize, 10), (parseInt(page, 10) - 1) * parseInt(pageSize, 10)];
  if (search) params.push(`%${search}%`);
  const result = await query(sql, params);
  // 总计数：同样应用搜索条件
  const countSql = search
    ? 'SELECT COUNT(*) FROM customers WHERE is_in_pool = true AND (company_name ILIKE $1 OR contact ILIKE $1)'
    : 'SELECT COUNT(*) FROM customers WHERE is_in_pool = true';
  const count = await query(countSql, search ? [`%${search}%`] : []);
  res.json({ customers: normalizeCustomerList(result.rows), total: parseInt(count.rows[0].count, 10) });
});

module.exports = router;
