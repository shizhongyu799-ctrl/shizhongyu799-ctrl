const jwt = require('jsonwebtoken');
const config = require('../config/config');
const { query } = require('../config/db');
const { ALL_MODULE_KEYS } = require('../config/schema');

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN }
  );
}

function parseToken(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  if (!token) return null;
  try {
    return jwt.verify(token, config.JWT_SECRET);
  } catch {
    return null;
  }
}

// ---------- 鉴权中间件 ----------

async function auth(req, res, next) {
  const payload = parseToken(req);
  if (!payload) {
    return res.status(401).json({ error: '未登录或 Token 失效' });
  }
  const result = await query(
    'SELECT id, username, real_name, role, is_locked FROM users WHERE id = $1',
    [payload.id]
  );
  if (result.rows.length === 0 || result.rows[0].is_locked) {
    return res.status(401).json({ error: '账号不存在或已锁定' });
  }
  req.user = result.rows[0];
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: '未登录' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: '权限不足' });
    }
    next();
  };
}

// ---------- 模块权限检查 ----------

async function hasModulePermission(userId, moduleKey) {
  // 超级管理员：所有权限
  const userRes = await query('SELECT role FROM users WHERE id = $1', [userId]);
  if (userRes.rows.length === 0) return false;
  if (userRes.rows[0].role === 'super_admin') return true;
  if (userRes.rows[0].role === 'salesperson') {
    // 业务员默认拥有基础业务权限
    const salesBasic = [
      'customer:view', 'customer:edit',
      'visit:view', 'visit:edit',
      'map:view', 'map:draw',
      'calendar:view'
    ];
    return salesBasic.includes(moduleKey);
  }
  // 管理员：从 permissions 表读取
  if (!ALL_MODULE_KEYS.includes(moduleKey)) return false;
  const result = await query(
    'SELECT enabled FROM permissions WHERE user_id = $1 AND module_key = $2',
    [userId, moduleKey]
  );
  if (result.rows.length === 0) return false;
  return result.rows[0].enabled;
}

function requirePermission(moduleKey) {
  return async (req, res, next) => {
    const ok = await hasModulePermission(req.user.id, moduleKey);
    if (!ok) return res.status(403).json({ error: `缺少权限: ${moduleKey}` });
    next();
  };
}

// ---------- 数据范围过滤 ----------

async function getDataScope(userId) {
  const userRes = await query('SELECT role FROM users WHERE id = $1', [userId]);
  if (userRes.rows.length === 0) return { type: 'self', userIds: [userId] };
  const role = userRes.rows[0].role;

  if (role === 'super_admin') return { type: 'all', userIds: null };
  if (role === 'salesperson') return { type: 'self', userIds: [userId] };

  // admin
  const ds = await query(
    'SELECT scope_type, assigned_user_ids FROM data_scopes WHERE user_id = $1',
    [userId]
  );
  if (ds.rows.length === 0) return { type: 'self', userIds: [userId] };
  const row = ds.rows[0];
  if (row.scope_type === 'all') return { type: 'all', userIds: null };
  if (row.scope_type === 'self') return { type: 'self', userIds: [userId] };
  return {
    type: 'assigned',
    userIds: Array.isArray(row.assigned_user_ids) && row.assigned_user_ids.length > 0
      ? row.assigned_user_ids
      : [userId]
  };
}

/**
 * 为当前用户构造客户范围过滤条件。
 * @param {number} userId - 当前登录用户 ID
 * @param {number} [startIdx - 当前 SQL 中已占用的参数数量（从 1 开始），用于正确编号 $N
 * @returns {Promise<{sql:string, params:Array}>}
 */
function buildCustomerWhereForUser(userId, startIdx = 1) {
  return getDataScope(userId).then((scope) => {
    if (scope.type === 'all') {
      return { sql: '', params: [] };
    }
    const base = startIdx >= 1 ? startIdx : 1;
    const placeholders = scope.userIds.map((_, i) => `$${base + i}`).join(',');
    return {
      sql: `salesperson_id IN (${placeholders})`,
      params: scope.userIds.slice()
    };
  });
}

module.exports = {
  signToken,
  auth,
  requireRole,
  requirePermission,
  hasModulePermission,
  getDataScope,
  buildCustomerWhereForUser,
  ALL_MODULE_KEYS
};
