const SCHEMA_SQL = `
-- ==================== 用户表 ====================
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  real_name VARCHAR(50),
  phone VARCHAR(20),
  role VARCHAR(20) NOT NULL CHECK (role IN ('super_admin', 'admin', 'salesperson')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_locked BOOLEAN DEFAULT FALSE,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== 管理员模块权限表 ====================
CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_key VARCHAR(50) NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, module_key)
);

-- ==================== 管理员数据范围表 ====================
CREATE TABLE IF NOT EXISTS data_scopes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope_type VARCHAR(20) NOT NULL CHECK (scope_type IN ('all', 'assigned', 'self')),
  assigned_user_ids INTEGER[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

-- ==================== 客户表 ====================
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  company_name VARCHAR(200) NOT NULL,
  contact VARCHAR(50) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  address VARCHAR(500) NOT NULL,
  lat DECIMAL(12,8),
  lng DECIMAL(12,8),
  status VARCHAR(20) NOT NULL DEFAULT 'intent'
    CHECK (status IN ('intent', 'cooperated', 'lost')),
  sales_volume VARCHAR(100),
  salesperson_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  health_status VARCHAR(20) DEFAULT 'normal'
    CHECK (health_status IN ('normal', 'warning')),
  last_visit_at TIMESTAMP,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_in_pool BOOLEAN DEFAULT FALSE,
  pool_moved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  pool_moved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customers_salesperson ON customers(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_health ON customers(health_status);

-- ==================== 拜访记录表 ====================
CREATE TABLE IF NOT EXISTS visits (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  salesperson_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visit_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  visit_type VARCHAR(20) NOT NULL
    CHECK (visit_type IN ('onsite', 'phone')),
  content TEXT,
  result VARCHAR(20) NOT NULL
    CHECK (result IN ('deal', 'follow_up', 'no_interest')),
  next_follow_up DATE,
  gps_lat DECIMAL(12,8),
  gps_lng DECIMAL(12,8),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_visits_customer ON visits(customer_id);
CREATE INDEX IF NOT EXISTS idx_visits_salesperson ON visits(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_visits_next ON visits(next_follow_up);

-- ==================== 站内提醒表 ====================
CREATE TABLE IF NOT EXISTS reminders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  type VARCHAR(30) NOT NULL
    CHECK (type IN ('follow_up', 'pre_reminder', 'health_warning')),
  title VARCHAR(200) NOT NULL,
  content TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  trigger_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT reminders_unique_key UNIQUE (user_id, customer_id, type, trigger_date)
);

CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id, is_read);

-- 确保 reminders 表存在唯一约束（对已存在的表也生效）
ALTER TABLE IF EXISTS reminders DROP CONSTRAINT IF EXISTS reminders_unique_key;
ALTER TABLE IF EXISTS reminders
  ADD CONSTRAINT reminders_unique_key UNIQUE (user_id, customer_id, type, trigger_date);

-- ==================== 系统配置表 ====================
CREATE TABLE IF NOT EXISTS system_config (
  id SERIAL PRIMARY KEY,
  config_key VARCHAR(50) UNIQUE NOT NULL,
  config_value TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== 报告表 ====================
CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  month VARCHAR(7) NOT NULL,
  scope_type VARCHAR(20) NOT NULL,
  scope_value VARCHAR(100),
  excel_file VARCHAR(500),
  analysis_content JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reports_month ON reports(month);

-- ==================== 操作日志表 ====================
CREATE TABLE IF NOT EXISTS operation_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username VARCHAR(50),
  action VARCHAR(50) NOT NULL,
  target_type VARCHAR(50),
  target_id INTEGER,
  target_name VARCHAR(200),
  detail TEXT,
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_logs_user ON operation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_action ON operation_logs(action);
CREATE INDEX IF NOT EXISTS idx_logs_created ON operation_logs(created_at DESC);
`;

const ALL_MODULE_KEYS = [
  'customer:view',
  'customer:edit',
  'customer:delete',
  'visit:view',
  'visit:edit',
  'map:view',
  'map:draw',
  'calendar:view',
  'import:excel',
  'export:data',
  'dashboard:view',
  'pool:manage',
  'user:manage',
  'user:admin',
  'health:auto'
];

module.exports = { SCHEMA_SQL, ALL_MODULE_KEYS };
