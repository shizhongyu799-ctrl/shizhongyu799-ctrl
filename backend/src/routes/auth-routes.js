const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { signToken, auth, requireRole, hasModulePermission, ALL_MODULE_KEYS } = require('../middleware/auth');
const { logOperation } = require('./log-routes');

const router = express.Router();

// ==================== 登录 ====================
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: '请输入账号密码' });
  }
  let result;
  try {
    // 使用 ILIKE 进行大小写不敏感的用户名匹配
    result = await query('SELECT * FROM users WHERE username ILIKE $1', [username]);
  } catch (err) {
    console.error('[AUTH] 查询用户失败：', err.message);
    return res.status(500).json({
      error: '数据库异常（请确认 PostgreSQL 已启动且数据库已创建）'
    });
  }
  if (result.rows.length === 0) {
    return res.status(401).json({ error: '账号或密码错误' });
  }
  const user = result.rows[0];
  if (user.is_locked) {
    return res.status(401).json({ error: '账号已锁定' });
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: '账号或密码错误' });
  }
  await query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
  logOperation(user.id, user.username, 'login', 'user', user.id, user.username, '用户登录系统', req.ip);

  const token = signToken(user);
  let permissions = null;
  let dataScope = null;
  if (user.role === 'admin') {
    const perm = await query(
      'SELECT module_key, enabled FROM permissions WHERE user_id = $1',
      [user.id]
    );
    permissions = perm.rows.reduce((acc, r) => { acc[r.module_key] = r.enabled; return acc; }, {});
    const ds = await query('SELECT scope_type, assigned_user_ids FROM data_scopes WHERE user_id = $1', [user.id]);
    dataScope = ds.rows[0] || null;
  }

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      realName: user.real_name,
      role: user.role
    },
    permissions,
    dataScope,
    allModuleKeys: user.role === 'super_admin' ? ALL_MODULE_KEYS : null
  });
});

// ==================== 获取当前用户信息 ====================
router.get('/me', auth, async (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      realName: req.user.real_name,
      role: req.user.role
    }
  });
});

// ==================== 修改密码 ====================
router.post('/change-password', auth, async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: '请输入旧密码和至少 6 位的新密码' });
  }
  const userRes = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  const user = userRes.rows[0];
  const ok = await bcrypt.compare(oldPassword, user.password_hash);
  if (!ok) return res.status(400).json({ error: '旧密码错误' });
  const hash = await bcrypt.hash(newPassword, 10);
  await query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [hash, req.user.id]);
  res.json({ ok: true });
});

// ==================== 用户列表（管理员可见） ====================
router.get('/users', auth, async (req, res) => {
  const isSuper = req.user.role === 'super_admin';
  const canUserManage = isSuper || await hasModulePermission(req.user.id, 'user:manage');
  if (!canUserManage) return res.status(403).json({ error: '权限不足' });

  const { role } = req.query;
  let sql = 'SELECT id, username, real_name, phone, role, is_locked, created_by, last_login_at, created_at, updated_at FROM users';
  let params = [];
  if (role) {
    sql += ' WHERE role = $1';
    params.push(role);
  }
  sql += ' ORDER BY role = \'super_admin\' DESC, created_at DESC';
  const result = await query(sql, params);
  res.json({ users: result.rows });
});

// ==================== 新增用户 ====================
router.post('/users', auth, async (req, res) => {
  const isSuper = req.user.role === 'super_admin';
  const body = req.body || {};
  const { username, password, realName, phone, role } = body;

  if (!username || !password || !role) {
    return res.status(400).json({ error: '缺少必填项' });
  }

  // 权限检查
  if (role === 'super_admin') {
    return res.status(403).json({ error: '无法创建超级管理员' });
  }
  if (role === 'admin') {
    if (!isSuper) return res.status(403).json({ error: '只有超级管理员可创建管理员' });
  }
  if (role === 'salesperson') {
    const canUserManage = isSuper || await hasModulePermission(req.user.id, 'user:manage');
    if (!canUserManage) return res.status(403).json({ error: '权限不足' });
  }

  // 用户名重复
  const exist = await query('SELECT id FROM users WHERE username = $1', [username]);
  if (exist.rows.length > 0) {
    return res.status(400).json({ error: '用户名已存在' });
  }

  const hash = await bcrypt.hash(password, 10);
  const result = await query(
    `INSERT INTO users (username, password_hash, real_name, phone, role, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, username, real_name, phone, role, is_locked, created_at`,
    [username, hash, realName || '', phone || '', role, req.user.id]
  );

  const newUser = result.rows[0];

  // 记录日志
  const roleLabel = { admin: '管理员', salesperson: '业务员' }[role] || role;
  logOperation(req.user.id, req.user.username, 'user_create', 'user', newUser.id, username,
    `创建${roleLabel}账号：${username}（姓名：${realName || '未设置'}）`, req.ip);

  // 若是管理员：为其创建默认权限（基础权限 + self 数据范围）
  if (role === 'admin') {
    const defaults = [
      'customer:view', 'customer:edit',
      'visit:view', 'visit:edit',
      'map:view', 'map:draw',
      'calendar:view', 'dashboard:view', 'pool:manage'
    ];
    for (const key of defaults) {
      await query(
        'INSERT INTO permissions (user_id, module_key, enabled) VALUES ($1, $2, true) ON CONFLICT (user_id, module_key) DO NOTHING',
        [newUser.id, key]
      );
    }
    await query(
      'INSERT INTO data_scopes (user_id, scope_type, assigned_user_ids) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO NOTHING',
      [newUser.id, 'self', [newUser.id]]
    );
  }

  res.json({ user: newUser });
});

// ==================== 更新用户（锁定/解锁） ====================
router.put('/users/:id', auth, async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const isSuper = req.user.role === 'super_admin';
  const body = req.body || {};

  const targetRes = await query('SELECT role, username FROM users WHERE id = $1', [targetId]);
  if (targetRes.rows.length === 0) return res.status(404).json({ error: '用户不存在' });
  const target = targetRes.rows[0];

  // 禁止编辑超级管理员（除非自己是超级管理员且改自己）
  if (target.role === 'super_admin' && !isSuper) {
    return res.status(403).json({ error: '权限不足' });
  }
  if (target.role === 'admin' && !isSuper) {
    return res.status(403).json({ error: '只有超级管理员可编辑管理员' });
  }
  if (target.role === 'salesperson') {
    const canUserManage = isSuper || await hasModulePermission(req.user.id, 'user:manage');
    if (!canUserManage) return res.status(403).json({ error: '权限不足' });
  }

  const updates = [];
  const params = [];
  let idx = 1;

  if (body.realName !== undefined) {
    updates.push(`real_name = $${idx++}`);
    params.push(body.realName);
  }
  if (body.phone !== undefined) {
    updates.push(`phone = $${idx++}`);
    params.push(body.phone);
  }
  if (typeof body.isLocked === 'boolean') {
    // 超级管理员不能锁定自己
    if (targetId === req.user.id && body.isLocked) {
      return res.status(400).json({ error: '不能锁定自己' });
    }
    updates.push(`is_locked = $${idx++}`);
    params.push(body.isLocked);
  }
  if (body.password) {
    updates.push(`password_hash = $${idx++}`);
    params.push(await bcrypt.hash(body.password, 10));
  }

  // 记录日志（密码重置、锁定/解锁等）
  if (body.password) {
    logOperation(req.user.id, req.user.username, 'user_reset_pwd', 'user', targetId, target.username,
      `重置用户 ${target.username} 的密码`, req.ip);
  }
  if (typeof body.isLocked === 'boolean') {
    const action = body.isLocked ? 'user_lock' : 'user_unlock';
    logOperation(req.user.id, req.user.username, action, 'user', targetId, target.username,
      `${body.isLocked ? '锁定' : '解锁'}用户 ${target.username}`, req.ip);
  }

  if (updates.length === 0) return res.json({ ok: true });

  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  params.push(targetId);

  await query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`, params);
  res.json({ ok: true });
});

// ==================== 删除用户 ====================
router.delete('/users/:id', auth, requireRole('super_admin'), async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const targetRes = await query('SELECT role, username FROM users WHERE id = $1', [targetId]);
  if (targetRes.rows.length === 0) return res.status(404).json({ error: '用户不存在' });
  if (targetRes.rows[0].role === 'super_admin') {
    return res.status(400).json({ error: '不能删除超级管理员' });
  }
  const targetUsername = targetRes.rows[0].username;
  // 转移客户（避免外键问题）：将其名下客户放入公海池（仅对非公海池客户）
  await query(
    `UPDATE customers SET salesperson_id = NULL, is_in_pool = true, pool_moved_by = $1, pool_moved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE salesperson_id = $2 AND is_in_pool = false`,
    [req.user.id, targetId]
  );
  await query('DELETE FROM users WHERE id = $1', [targetId]);
  logOperation(req.user.id, req.user.username, 'user_delete', 'user', targetId, targetUsername,
    `删除用户账号：${targetUsername}，其客户已移入公海池`, req.ip);
  res.json({ ok: true });
});

// ==================== 获取管理员权限配置 ====================
router.get('/admins/:id/permissions', auth, requireRole('super_admin'), async (req, res) => {
  const adminId = parseInt(req.params.id, 10);
  const adminRes = await query('SELECT role FROM users WHERE id = $1', [adminId]);
  if (adminRes.rows.length === 0) return res.status(404).json({ error: '用户不存在' });
  if (adminRes.rows[0].role !== 'admin') {
    return res.status(400).json({ error: '仅管理员可配置权限' });
  }

  const perm = await query(
    'SELECT module_key, enabled FROM permissions WHERE user_id = $1',
    [adminId]
  );
  const permissions = perm.rows.reduce((acc, r) => { acc[r.module_key] = r.enabled; return acc; }, {});
  // 补全未配置的 key
  ALL_MODULE_KEYS.forEach((k) => { if (!(k in permissions)) permissions[k] = false; });

  const ds = await query(
    'SELECT scope_type, assigned_user_ids FROM data_scopes WHERE user_id = $1',
    [adminId]
  );
  const dataScope = ds.rows[0] || { scope_type: 'self', assigned_user_ids: [] };

  // 可选业务员列表
  const salesRes = await query(
    "SELECT id, real_name, username FROM users WHERE role = 'salesperson' ORDER BY id"
  );

  res.json({ permissions, dataScope, availableSalespersons: salesRes.rows });
});

// ==================== 更新管理员权限配置 ====================
router.put('/admins/:id/permissions', auth, requireRole('super_admin'), async (req, res) => {
  const adminId = parseInt(req.params.id, 10);
  const { permissions, dataScope } = req.body || {};

  const adminRes = await query('SELECT role FROM users WHERE id = $1', [adminId]);
  if (adminRes.rows.length === 0) return res.status(404).json({ error: '用户不存在' });
  if (adminRes.rows[0].role !== 'admin') {
    return res.status(400).json({ error: '仅管理员可配置权限' });
  }

  // 更新模块权限
  if (permissions && typeof permissions === 'object') {
    for (const key of ALL_MODULE_KEYS) {
      if (key in permissions) {
        await query(
          `INSERT INTO permissions (user_id, module_key, enabled) VALUES ($1, $2, $3)
           ON CONFLICT (user_id, module_key) DO UPDATE SET enabled = $3`,
          [adminId, key, !!permissions[key]]
        );
      }
    }
  }

  // 更新数据范围
  if (dataScope) {
    const { scope_type, assigned_user_ids } = dataScope;
    const validType = ['all', 'assigned', 'self'].includes(scope_type) ? scope_type : 'self';
    const ids = validType === 'assigned' ? (Array.isArray(assigned_user_ids) ? assigned_user_ids : []) : [];
    await query(
      `INSERT INTO data_scopes (user_id, scope_type, assigned_user_ids) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET scope_type = $2, assigned_user_ids = $3`,
      [adminId, validType, ids]
    );
  }

  res.json({ ok: true });
});

// ==================== 获取业务员列表（用于分配客户/选择） ====================
router.get('/salespersons', auth, async (req, res) => {
  const result = await query(
    "SELECT id, username, real_name, phone FROM users WHERE role = 'salesperson' AND is_locked = false ORDER BY id"
  );
  res.json({ users: result.rows });
});

module.exports = router;
