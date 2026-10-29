-- Schema do Banco de Dados Cloudflare D1 (SQLite Engine)
-- Sistema: Apoio ao Tratamento

-- 1. Perfis de Usuários
CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY,
  auth_user_id TEXT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'ATENDENTE')),
  active INTEGER NOT NULL DEFAULT 1,
  attendant_id TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 2. Atendentes
CREATE TABLE IF NOT EXISTS attendants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 3. Apoios ao Tratamento
CREATE TABLE IF NOT EXISTS treatment_supports (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  attendant_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  observation TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  deleted_at TEXT,
  deleted_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (attendant_id) REFERENCES attendants (id)
);

-- 4. Auditoria de Apoios ao Tratamento
CREATE TABLE IF NOT EXISTS treatment_support_audits (
  id TEXT PRIMARY KEY,
  treatment_support_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'RESTORE')),
  old_value TEXT,
  new_value TEXT,
  created_at TEXT NOT NULL
);

-- 5. Metas Operacionais
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('DAILY_STORE', 'MONTHLY_STORE', 'DAILY_ATTENDANT', 'MONTHLY_ATTENDANT')),
  attendant_id TEXT,
  target_value INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 6. Análises de Inteligência Artificial
CREATE TABLE IF NOT EXISTS ai_analyses (
  id TEXT PRIMARY KEY,
  analysis_type TEXT NOT NULL CHECK (analysis_type IN ('DAILY', 'MONTHLY')),
  reference_date TEXT NOT NULL,
  reference_period TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  analysis_text TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 7. Logs Globais de Auditoria
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL
);

-- 8. Configurações Globais
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 9. Na Rotina (Registros Clínicos de Rotina)
CREATE TABLE IF NOT EXISTS routine_cares (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  attendant_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  observation TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  deleted_at TEXT,
  deleted_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (attendant_id) REFERENCES attendants (id)
);

-- Índices de Otimização para Consultas
CREATE INDEX IF NOT EXISTS idx_treatment_supports_date ON treatment_supports (date);
CREATE INDEX IF NOT EXISTS idx_treatment_supports_attendant ON treatment_supports (attendant_id);
CREATE INDEX IF NOT EXISTS idx_treatment_supports_deleted ON treatment_supports (deleted_at);
CREATE INDEX IF NOT EXISTS idx_routine_cares_date ON routine_cares (date);
CREATE INDEX IF NOT EXISTS idx_routine_cares_attendant ON routine_cares (attendant_id);
CREATE INDEX IF NOT EXISTS idx_routine_cares_deleted ON routine_cares (deleted_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_hash ON ai_analyses (input_hash);

