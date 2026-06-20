const express = require('express');
const { query } = require('../config/db');
const { auth, buildCustomerWhereForUser, requirePermission } = require('../middleware/auth');

const router = express.Router();

// ==================== 生成当日健康度提醒 ====================
async function ensureHealthReminders() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    // 从系统配置读取健康检查天数（避免硬编码 30 天）
    let days = 30;
    try {
      const cfgRes = await query(
        "SELECT config_value FROM system_config WHERE config_key = 'health_check_days'"
      );
      days = parseInt(cfgRes.rows[0]?.config_value || '30', 10) || 30;
    } catch {}
    await query(
      `INSERT INTO reminders (user_id, customer_id, type, title, content, trigger_date)
       SELECT c.salesperson_id, c.id, 'health_warning',
              ('健康度预警：' || c.company_name),
              ('该客户已超过 ' || $2 || ' 天未拜访'), $1::date
       FROM customers c
       WHERE c.health_status = 'warning'
         AND c.salesperson_id IS NOT NULL
         AND c.is_in_pool = false
       ON CONFLICT (user_id, customer_id, type, trigger_date) DO NOTHING`,
      [today, String(days)]
    );
  } catch (e) {
    console.error('[reminder] ensureHealthReminders failed:', e.message);
  }
}

// ==================== 我的提醒列表 ====================
router.get('/my', auth, async (req, res) => {
  await ensureHealthReminders();
  const { unread, limit = 50 } = req.query;

  let sql = `SELECT r.*, c.company_name
             FROM reminders r LEFT JOIN customers c ON c.id = r.customer_id
             WHERE r.user_id = $1`;
  const params = [req.user.id];
  if (unread === 'true') {
    sql += ' AND r.is_read = false';
  }
  sql += ' ORDER BY r.is_read ASC, r.trigger_date DESC, r.created_at DESC LIMIT $2';
  params.push(parseInt(limit, 10));

  const result = await query(sql, params);
  const unreadCountRes = await query(
    "SELECT COUNT(*) FROM reminders WHERE user_id = $1 AND is_read = false",
    [req.user.id]
  );
  res.json({ reminders: result.rows, unreadCount: parseInt(unreadCountRes.rows[0].count, 10) });
});

// ==================== 标记已读 ====================
router.post('/:id/read', auth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await query(
    "UPDATE reminders SET is_read = true WHERE id = $1 AND user_id = $2",
    [id, req.user.id]
  );
  res.json({ ok: true });
});

// ==================== 批量已读 ====================
router.post('/read-all', auth, async (req, res) => {
  await query(
    "UPDATE reminders SET is_read = true WHERE user_id = $1 AND is_read = false",
    [req.user.id]
  );
  res.json({ ok: true });
});

// ==================== 顶部横幅：今天及近 N 天的跟进任务 ====================
router.get('/banner', auth, requirePermission('calendar:view'), async (req, res) => {
  const days = 3;
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + days);
  const startStr = today.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const filter = await buildCustomerWhereForUser(req.user.id, 3);
  const where = filter.sql ? `AND ${filter.sql.replace(/salesperson_id/g, 'c.salesperson_id')}` : '';

  const result = await query(
    `SELECT v.next_follow_up AS date, v.customer_id, c.company_name, c.contact, c.phone
     FROM visits v
     JOIN customers c ON c.id = v.customer_id
     WHERE v.next_follow_up BETWEEN $1 AND $2 ${where}
     ORDER BY v.next_follow_up LIMIT 20`,
    [startStr, endStr, ...filter.params]
  );
  res.json({ items: result.rows });
});

module.exports = router;
