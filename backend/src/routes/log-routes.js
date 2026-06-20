const express = require('express');
const { query } = require('../config/db');
const { auth, requireRole, hasModulePermission } = require('../middleware/auth');

const router = express.Router();

// 操作类型常量
const ACTION_LABELS = {
  'customer_create': '新增客户',
  'customer_update': '修改客户',
  'customer_delete': '删除客户',
  'customer_export': '导出客户',
  'customer_assign': '分配客户',
  'customer_pool_move': '客户移入公海',
  'visit_create': '新增拜访',
  'visit_update': '修改拜访',
  'report_export': '导出报告',
  'user_create': '新增用户',
  'user_update': '修改用户',
  'user_delete': '删除用户',
  'user_reset_pwd': '重置密码',
  'user_lock': '锁定用户',
  'user_unlock': '解锁用户',
  'login': '登录系统',
  'logout': '退出系统',
  'reminder_create': '创建提醒',
  'reminder_complete': '完成提醒'
};

// ==================== 记录操作日志（供内部调用） ====================
// 注意：此函数永远不会抛出异常，内部 try-catch，调用方不需要 await 也能安全使用
function logOperation(userId, username, action, targetType, targetId, targetName, detail, ipAddress) {
  query(
    `INSERT INTO operation_logs (user_id, username, action, target_type, target_id, target_name, detail, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, username, action, targetType, targetId, targetName, detail, ipAddress]
  ).catch((err) => {
    console.error('[LOG] 记录操作日志失败（可能是 operation_logs 表尚未创建，请重启后端）：', err.message);
  });
}

// 导出给其他路由使用
module.exports.logOperation = logOperation;
module.exports.ACTION_LABELS = ACTION_LABELS;

// ==================== 查询操作日志（管理员可见） ====================
router.get('/logs', auth, async (req, res) => {
  try {
    // 权限检查：超级管理员 或 拥有 user:manage 权限
    const isSuper = req.user.role === 'super_admin';
    let canViewLogs = isSuper;
    if (!canViewLogs) {
      canViewLogs = await hasModulePermission(req.user.id, 'user:manage');
    }
    if (!canViewLogs) return res.status(403).json({ error: '权限不足' });

    const { page = 1, pageSize = 50, userId, action, startDate, endDate, keyword } = req.query;
    const params = [];
    let idx = 1;
    let where = [];

    if (userId) {
      where.push(`user_id = $${idx++}`);
      params.push(parseInt(userId));
    }
    if (action) {
      where.push(`action = $${idx++}`);
      params.push(action);
    }
    if (startDate) {
      where.push(`created_at >= $${idx++}`);
      params.push(startDate);
    }
    if (endDate) {
      where.push(`created_at <= $${idx++}`);
      params.push(`${endDate} 23:59:59`);
    }
    if (keyword) {
      where.push(`(target_name ILIKE $${idx} OR detail ILIKE $${idx} OR username ILIKE $${idx})`);
      params.push(`%${keyword}%`);
      idx++;
    }

    const whereSql = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    // 总数
    const countResult = await query(`SELECT COUNT(*) FROM operation_logs ${whereSql}`, params);
    const total = parseInt(countResult.rows[0].count);

    // 分页查询
    const pageParams = [...params, parseInt(pageSize), (parseInt(page) - 1) * parseInt(pageSize)];
    const result = await query(
      `SELECT id, user_id, username, action, target_type, target_id, target_name, detail, ip_address, created_at
       FROM operation_logs ${whereSql}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      pageParams
    );

    // 添加操作标签
    const logs = result.rows.map(row => ({
      ...row,
      actionLabel: ACTION_LABELS[row.action] || row.action
    }));

    res.json({ logs, total, page: parseInt(page), pageSize: parseInt(pageSize) });
  } catch (err) {
    console.error('[LOG] 查询操作日志失败：', err.message);
    if (err.message && err.message.indexOf('relation "operation_logs"') >= 0) {
      res.status(500).json({ error: 'operation_logs 表尚未创建，请重启后端服务' });
    } else {
      res.status(500).json({ error: err.message || '查询失败' });
    }
  }
});

// ==================== 获取操作类型列表 ====================
router.get('/logs/actions', auth, (req, res) => {
  const actions = Object.entries(ACTION_LABELS).map(([key, label]) => ({ key, label }));
  res.json({ actions });
});

// ==================== 导出日志（仅超级管理员） ====================
router.get('/logs/export', auth, requireRole('super_admin'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const params = [];
    let idx = 1;
    let where = [];

    if (startDate) {
      where.push(`created_at >= $${idx++}`);
      params.push(startDate);
    }
    if (endDate) {
      where.push(`created_at <= $${idx++}`);
      params.push(`${endDate} 23:59:59`);
    }

    const whereSql = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    const result = await query(
      `SELECT username, action, target_type, target_name, detail, ip_address, created_at
       FROM operation_logs ${whereSql}
       ORDER BY created_at DESC
       LIMIT 10000`,
      params
    );

    const logs = result.rows.map(row => ({
      ...row,
      actionLabel: ACTION_LABELS[row.action] || row.action,
      created_at: row.created_at ? new Date(row.created_at).toLocaleString('zh-CN') : ''
    }));

    res.json({ logs });
  } catch (err) {
    console.error('[LOG] 导出日志失败：', err.message);
    res.status(500).json({ error: err.message || '导出失败' });
  }
});

module.exports.router = router;
module.exports.logOperation = logOperation;
