const express = require('express');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const { query } = require('../config/db');
const { auth, requireRole, requirePermission, hasModulePermission, buildCustomerWhereForUser } = require('../middleware/auth');
const { logOperation } = require('./log-routes');

const router = express.Router();

// 确保输出目录存在
const EXPORT_DIR = path.join(__dirname, '..', '..', 'exports');
if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

// ==================== 绩效看板数据 ====================
router.get('/dashboard', auth, requirePermission('dashboard:view'), async (req, res) => {
  const { year, month } = req.query;
  const y = parseInt(year, 10) || new Date().getFullYear();
  const m = parseInt(month, 10) || new Date().getMonth() + 1;
  const startStr = `${y}-${String(m).padStart(2, '0')}-01`;
  const endDate = new Date(y, m, 0);
  const endStr = endDate.toISOString().slice(0, 10);

  // 各业务员数据
  const statsRes = await query(
    `SELECT u.id, u.real_name, u.username,
      (SELECT COUNT(*) FROM visits WHERE salesperson_id = u.id AND visit_time BETWEEN $1::date AND ($2 || '-01')::date + INTERVAL '1 month' - INTERVAL '1 day') AS total_visits,
      (SELECT COUNT(*) FROM visits WHERE salesperson_id = u.id AND visit_type = 'onsite' AND visit_time BETWEEN $1::date AND ($2 || '-01')::date + INTERVAL '1 month' - INTERVAL '1 day') AS onsite_visits,
      (SELECT COUNT(*) FROM visits WHERE salesperson_id = u.id AND visit_type = 'phone' AND visit_time BETWEEN $1::date AND ($2 || '-01')::date + INTERVAL '1 month' - INTERVAL '1 day') AS phone_visits,
      (SELECT COUNT(*) FROM customers WHERE created_by = u.id AND created_at BETWEEN $1::timestamp AND ($2 || '-01')::date + INTERVAL '1 month' - INTERVAL '1 day') AS new_customers,
      (SELECT COUNT(*) FROM visits WHERE salesperson_id = u.id AND result = 'deal' AND visit_time BETWEEN $1::date AND ($2 || '-01')::date + INTERVAL '1 month' - INTERVAL '1 day') AS deal_count,
      (SELECT COUNT(*) FROM customers c WHERE c.salesperson_id = u.id AND c.health_status = 'warning') AS warning_count
     FROM users u WHERE u.role = 'salesperson'
     ORDER BY total_visits DESC`,
    [startStr, `${y}-${String(m).padStart(2, '0')}`]
  );

  // 全局数据
  const globalRes = await query(
    `SELECT
      (SELECT COUNT(*) FROM customers) AS total_customers,
      (SELECT COUNT(*) FROM customers WHERE status = 'intent') AS intent_count,
      (SELECT COUNT(*) FROM customers WHERE status = 'cooperated') AS cooperated_count,
      (SELECT COUNT(*) FROM customers WHERE status = 'lost') AS lost_count,
      (SELECT COUNT(*) FROM customers WHERE health_status = 'warning') AS health_warning_count,
      (SELECT COUNT(*) FROM customers WHERE is_in_pool = true) AS pool_count`
  );

  // 成交结果分布
  const resultDist = await query(
    `SELECT result, COUNT(*) AS count FROM visits
     WHERE visit_time BETWEEN $1::date AND ($2 || '-01')::date + INTERVAL '1 month' - INTERVAL '1 day'
     GROUP BY result`,
    [startStr, `${y}-${String(m).padStart(2, '0')}`]
  );

  res.json({
    salespersonStats: statsRes.rows,
    global: globalRes.rows[0],
    resultDistribution: resultDist.rows,
    period: { year: y, month: m }
  });
});

// ==================== Excel 导入模板 ====================
router.get('/excel/template', auth, async (req, res) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('客户导入模板');
  ws.columns = [
    { header: '客户公司名称', key: 'companyName', width: 30 },
    { header: '联系人', key: 'contact', width: 15 },
    { header: '联系电话', key: 'phone', width: 15 },
    { header: '详细地址', key: 'address', width: 40 },
    { header: '合作状态(intent/cooperated/lost)', key: 'status', width: 25 },
    { header: '销售体量', key: 'salesVolume', width: 15 },
    { header: '归属业务员ID(可为空)', key: 'salespersonId', width: 20 },
    { header: '纬度(可选)', key: 'lat', width: 12 },
    { header: '经度(可选)', key: 'lng', width: 12 }
  ];
  ws.addRow({
    companyName: '示例科技有限公司', contact: '张三', phone: '13800138000',
    address: '北京市海淀区中关村大街1号', status: 'intent',
    salesVolume: '100万', salespersonId: '', lat: '', lng: ''
  });

  const fileName = `客户导入模板_${Date.now()}.xlsx`;
  const filePath = path.join(EXPORT_DIR, fileName);
  await wb.xlsx.writeFile(filePath);

  res.setHeader('Content-Disposition', `attachment; filename="customer-template.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  stream.on('end', () => fs.promises.unlink(filePath).catch(() => {}));
});

// ==================== Excel 批量导入 ====================
router.post('/excel/import', auth, requirePermission('import:excel'), async (req, res) => {
  const body = req.body || {};
  const { rows } = body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: '格式错误' });

  const canAssign = req.user.role === 'super_admin' || (await hasModulePermission(req.user.id, 'pool:manage'));
  const results = { success: 0, failed: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.companyName || !row.contact || !row.phone || !row.address) {
      results.failed++;
      results.errors.push(`第${i + 1}行：缺少必填字段`);
      continue;
    }
    try {
      const salespersonId = (canAssign && row.salespersonId)
        ? parseInt(row.salespersonId, 10)
        : (req.user.role === 'salesperson' ? req.user.id : null);

      await query(
        `INSERT INTO customers (company_name, contact, phone, address, status, sales_volume, salesperson_id, lat, lng, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [row.companyName, row.contact, row.phone, row.address,
         ['intent', 'cooperated', 'lost'].includes(row.status) ? row.status : 'intent',
         row.salesVolume || '', salespersonId,
         row.lat ? parseFloat(row.lat) : null,
         row.lng ? parseFloat(row.lng) : null,
         req.user.id]
      );
      results.success++;
    } catch (err) {
      results.failed++;
      results.errors.push(`第${i + 1}行：${err.message}`);
    }
  }

  // 记录日志
  logOperation(req.user.id, req.user.username, 'customer_create', 'customer', null, '批量导入',
    `Excel批量导入：成功${results.success}条，失败${results.failed}条`, req.ip);

  res.json({ results });
});

// ==================== Excel 导出 + 智能分析 ====================
router.post('/export', auth, requirePermission('export:data'), async (req, res) => {
  const { year, month, scopeType, scopeValue } = req.body || {};
  const y = parseInt(year, 10) || new Date().getFullYear();
  const m = parseInt(month, 10) || new Date().getMonth() + 1;
  const startStr = `${y}-${String(m).padStart(2, '0')}-01`;
  const endDate = new Date(y, m, 0);
  const endStr = endDate.toISOString().slice(0, 10);

  // 客户数据
  let customerSql = `SELECT c.*, u.real_name AS salesperson_name FROM customers c LEFT JOIN users u ON u.id = c.salesperson_id`;
  let customerParams = [];
  if (scopeType === 'salesperson' && scopeValue) {
    customerSql += ' WHERE c.salesperson_id = $1';
    customerParams = [parseInt(scopeValue, 10)];
  }
  const customers = await query(customerSql, customerParams);

  // 拜访记录数据
  let visitSql = `SELECT v.*, u.real_name AS salesperson_name, c.company_name
                  FROM visits v JOIN users u ON u.id = v.salesperson_id
                  JOIN customers c ON c.id = v.customer_id
                  WHERE v.visit_time BETWEEN $1::date AND ($2 || '-01')::date + INTERVAL '1 month' - INTERVAL '1 day'`;
  const visitParams = [startStr, `${y}-${String(m).padStart(2, '0')}`];
  if (scopeType === 'salesperson' && scopeValue) {
    visitSql += ' AND v.salesperson_id = $3';
    visitParams.push(parseInt(scopeValue, 10));
  }
  const visits = await query(visitSql, visitParams);

  // 智能分析
  const totalCustomers = customers.rows.length;
  const statusCounts = customers.rows.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {});
  const resultCounts = visits.rows.reduce((acc, v) => {
    acc[v.result] = (acc[v.result] || 0) + 1;
    return acc;
  }, {});
  const warningCount = customers.rows.filter((c) => c.health_status === 'warning').length;

  // 业务员维度的拜访次数
  const salesVisitMap = {};
  for (const v of visits.rows) {
    salesVisitMap[v.salesperson_name] = (salesVisitMap[v.salesperson_name] || 0) + 1;
  }

  // 生成 Excel
  const wb = new ExcelJS.Workbook();

  const ws1 = wb.addWorksheet('客户信息');
  ws1.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: '公司名称', key: 'company_name', width: 30 },
    { header: '联系人', key: 'contact', width: 15 },
    { header: '电话', key: 'phone', width: 15 },
    { header: '地址', key: 'address', width: 40 },
    { header: '合作状态', key: 'status', width: 15 },
    { header: '健康度', key: 'health_status', width: 12 },
    { header: '销售体量', key: 'sales_volume', width: 15 },
    { header: '业务员', key: 'salesperson_name', width: 15 },
    { header: '创建时间', key: 'created_at', width: 20 }
  ];
  for (const c of customers.rows) ws1.addRow(c);

  const ws2 = wb.addWorksheet('拜访记录明细');
  ws2.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: '公司名称', key: 'company_name', width: 25 },
    { header: '拜访时间', key: 'visit_time', width: 22 },
    { header: '方式', key: 'visit_type', width: 10 },
    { header: '内容', key: 'content', width: 40 },
    { header: '结果', key: 'result', width: 15 },
    { header: '下次跟进', key: 'next_follow_up', width: 15 },
    { header: 'GPS纬度', key: 'gps_lat', width: 12 },
    { header: 'GPS经度', key: 'gps_lng', width: 12 },
    { header: '业务员', key: 'salesperson_name', width: 15 }
  ];
  for (const v of visits.rows) ws2.addRow(v);

  const ws3 = wb.addWorksheet('智能分析报告');
  ws3.getCell('A1').value = `客户地图管理系统 - ${y}年${m}月分析报告`;
  ws3.getCell('A1').font = { bold: true, size: 16 };
  ws3.mergeCells('A1:D1');

  ws3.getCell('A3').value = '一、客户状态分布';
  ws3.getCell('A4').value = '状态'; ws3.getCell('B4').value = '数量'; ws3.getCell('C4').value = '占比';
  let rowIdx = 5;
  const statusLabels = { intent: '意向客户', cooperated: '已合作', lost: '流失客户' };
  for (const key of ['intent', 'cooperated', 'lost']) {
    const n = statusCounts[key] || 0;
    ws3.getCell(`A${rowIdx}`).value = statusLabels[key];
    ws3.getCell(`B${rowIdx}`).value = n;
    ws3.getCell(`C${rowIdx}`).value = totalCustomers ? `${(n / totalCustomers * 100).toFixed(1)}%` : '0%';
    rowIdx++;
  }

  rowIdx += 2;
  ws3.getCell(`A${rowIdx}`).value = '二、各业务员拜访次数';
  rowIdx++;
  ws3.getCell(`A${rowIdx}`).value = '业务员'; ws3.getCell(`B${rowIdx}`).value = '拜访次数';
  rowIdx++;
  for (const [name, count] of Object.entries(salesVisitMap)) {
    ws3.getCell(`A${rowIdx}`).value = name;
    ws3.getCell(`B${rowIdx}`).value = count;
    rowIdx++;
  }

  rowIdx += 2;
  ws3.getCell(`A${rowIdx}`).value = '三、跟进结果汇总';
  rowIdx++;
  ws3.getCell(`A${rowIdx}`).value = '结果'; ws3.getCell(`B${rowIdx}`).value = '数量'; ws3.getCell(`C${rowIdx}`).value = '占比';
  rowIdx++;
  const resultLabels = { deal: '成交', follow_up: '继续跟进', no_interest: '无意向' };
  const totalResults = visits.rows.length;
  for (const key of ['deal', 'follow_up', 'no_interest']) {
    const n = resultCounts[key] || 0;
    ws3.getCell(`A${rowIdx}`).value = resultLabels[key];
    ws3.getCell(`B${rowIdx}`).value = n;
    ws3.getCell(`C${rowIdx}`).value = totalResults ? `${(n / totalResults * 100).toFixed(1)}%` : '0%';
    rowIdx++;
  }

  rowIdx += 2;
  ws3.getCell(`A${rowIdx}`).value = '四、健康度异常客户';
  rowIdx++;
  ws3.getCell(`A${rowIdx}`).value = warningCount;
  ws3.getCell(`B${rowIdx}`).value = '个客户超过设定天数未拜访，需重点关注';

  const fileName = `report_${y}-${String(m).padStart(2, '0')}_${Date.now()}.xlsx`;
  const filePath = path.join(EXPORT_DIR, fileName);
  await wb.xlsx.writeFile(filePath);

  // 存储报告记录
  await query(
    `INSERT INTO reports (user_id, month, scope_type, scope_value, excel_file, analysis_content)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [req.user.id, `${y}-${String(m).padStart(2, '0')}`, scopeType || 'all', scopeValue || '', fileName, {
      totalCustomers, statusCounts, resultCounts, warningCount, salesVisitMap
    }]
  );

  // 记录导出日志
  const scopeLabel = scopeType === 'salesperson' ? `业务员ID=${scopeValue}` : '全部';
  logOperation(req.user.id, req.user.username, 'report_export', 'report', null, `${y}年${m}月报告`,
    `导出${y}年${m}月报告（客户${totalCustomers}条，拜访${visits.rows.length}条），范围：${scopeLabel}`, req.ip);

  // 下载
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  stream.on('end', () => {
    // 保留文件用于历史下载
  });
});

// ==================== 历史报告列表 ====================
router.get('/reports', auth, requirePermission('export:data'), async (req, res) => {
  const result = await query(
    `SELECT r.*, u.real_name AS user_name FROM reports r LEFT JOIN users u ON u.id = r.user_id
     ORDER BY r.created_at DESC LIMIT 100`
  );
  res.json({ reports: result.rows });
});

// ==================== 历史报告下载 ====================
router.get('/reports/:id/download', auth, requirePermission('export:data'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const r = await query('SELECT excel_file FROM reports WHERE id = $1', [id]);
  if (r.rows.length === 0) return res.status(404).json({ error: '报告不存在' });
  const filePath = path.join(EXPORT_DIR, r.rows[0].excel_file);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件已被清理' });
  res.setHeader('Content-Disposition', `attachment; filename="${r.rows[0].excel_file}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  fs.createReadStream(filePath).pipe(res);
});

// ==================== 系统配置 ====================
router.get('/config', auth, async (req, res) => {
  const result = await query('SELECT config_key, config_value FROM system_config');
  const map = {};
  for (const row of result.rows) map[row.config_key] = row.config_value;
  res.json({ config: map });
});

router.put('/config', auth, requireRole('super_admin'), async (req, res) => {
  const { key, value } = req.body || {};
  if (!key) return res.status(400).json({ error: '缺少 key' });
  await query(
    `INSERT INTO system_config (config_key, config_value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (config_key) DO UPDATE SET config_value = $2, updated_at = CURRENT_TIMESTAMP`,
    [key, String(value)]
  );
  res.json({ ok: true });
});

module.exports = router;
