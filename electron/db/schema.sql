-- ContaClick Desktop - Local SQLite schema (mirror of cloud tables)
-- Phase 1: core tables. Other tables will be added in Phase 2 migrations.

CREATE TABLE IF NOT EXISTS despachos (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  rfc TEXT,
  estado TEXT DEFAULT 'activo',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  telefono TEXT,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clientes (
  id TEXT PRIMARY KEY,
  despacho_id TEXT NOT NULL,
  rfc TEXT,
  razon_social TEXT,
  regimen_fiscal TEXT,
  email TEXT,
  telefono TEXT,
  estado TEXT DEFAULT 'activo',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (despacho_id) REFERENCES despachos(id)
);
CREATE INDEX IF NOT EXISTS idx_clientes_despacho ON clientes(despacho_id);
CREATE INDEX IF NOT EXISTS idx_clientes_rfc ON clientes(rfc);

CREATE TABLE IF NOT EXISTS cfdi_xml (
  id TEXT PRIMARY KEY,
  cliente_id TEXT,
  despacho_id TEXT NOT NULL,
  uuid TEXT UNIQUE,
  rfc_emisor TEXT,
  rfc_receptor TEXT,
  nombre_emisor TEXT,
  nombre_receptor TEXT,
  tipo TEXT,
  forma_pago TEXT,
  metodo_pago TEXT,
  uso_cfdi TEXT,
  moneda TEXT,
  tipo_cambio REAL,
  subtotal REAL,
  total REAL,
  iva REAL,
  isr_ret REAL,
  iva_ret REAL,
  fecha TEXT,
  fecha_timbrado TEXT,
  serie TEXT,
  folio TEXT,
  estatus_sat TEXT,
  xml_raw TEXT,
  json_data TEXT,
  riesgo TEXT,
  hallazgos TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cfdi_cliente ON cfdi_xml(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cfdi_fecha ON cfdi_xml(fecha);
CREATE INDEX IF NOT EXISTS idx_cfdi_uuid ON cfdi_xml(uuid);

CREATE TABLE IF NOT EXISTS tool_runs (
  id TEXT PRIMARY KEY,
  despacho_id TEXT NOT NULL,
  cliente_id TEXT,
  tool TEXT NOT NULL,
  status TEXT,
  input_summary TEXT,
  output_summary TEXT,
  hallazgos_count INTEGER DEFAULT 0,
  riesgo TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  despacho_id TEXT,
  user_id TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  metadata TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS license (
  key TEXT PRIMARY KEY,
  despacho_id TEXT,
  plan TEXT,
  valid_until TEXT,
  last_check TEXT,
  signature TEXT
);
