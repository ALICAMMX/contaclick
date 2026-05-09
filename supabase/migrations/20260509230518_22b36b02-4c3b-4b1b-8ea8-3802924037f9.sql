-- =========================================================
-- ContaClick IA — MVP schema
-- Multi-tenant SaaS: despacho -> cliente -> rfc
-- =========================================================

-- ---------- ENUM roles ----------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum
      ('super_admin','despacho','contador','auxiliar','cliente_final');
  end if;
end $$;

-- ---------- updated_at helper (reuse if exists) ----------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- =========================================================
-- 1. NUCLEO SAAS
-- =========================================================

create table if not exists public.planes (
  id uuid primary key default gen_random_uuid(),
  clave text unique not null,
  nombre text not null,
  precio_mxn numeric(10,2) not null default 0,
  limites jsonb not null default '{}'::jsonb,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.despachos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  rfc_despacho text,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references public.planes(id),
  estado text not null default 'trial',
  trial_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_despachos_owner on public.despachos(owner_user_id);

create table if not exists public.user_memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  estado text not null default 'activo',
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (user_id, despacho_id)
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  despacho_id uuid references public.despachos(id) on delete cascade,
  cliente_id uuid,
  created_at timestamptz not null default now(),
  unique (user_id, role, despacho_id, cliente_id)
);
create index if not exists idx_user_roles_user on public.user_roles(user_id);

-- =========================================================
-- 2. HELPERS SECURITY DEFINER
-- =========================================================

create or replace function public.is_member_of(_despacho uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_memberships
    where user_id = auth.uid() and despacho_id = _despacho and estado = 'activo'
  );
$$;

create or replace function public.has_role(_role public.app_role, _despacho uuid default null, _cliente uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
      and role = _role
      and (_despacho is null or despacho_id = _despacho)
      and (_cliente  is null or cliente_id  = _cliente)
  );
$$;

-- =========================================================
-- 3. EXPEDIENTES (clientes ya existe; añadir despacho_id)
-- =========================================================

alter table public.clientes
  add column if not exists despacho_id uuid references public.despachos(id) on delete cascade;
create index if not exists idx_clientes_despacho on public.clientes(despacho_id);

create table if not exists public.rfcs (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  cliente_id  uuid not null references public.clientes(id) on delete cascade,
  rfc text not null,
  tipo_persona text not null check (tipo_persona in ('fisica','moral')),
  regimen_fiscal text,
  cp_fiscal text,
  obligaciones jsonb default '[]'::jsonb,
  csf_pdf_path text,
  vigente boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (despacho_id, rfc)
);
create index if not exists idx_rfcs_cliente on public.rfcs(cliente_id);
create trigger trg_rfcs_updated before update on public.rfcs
for each row execute function public.tg_set_updated_at();

create table if not exists public.obligaciones_fiscales (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  rfc_id uuid not null references public.rfcs(id) on delete cascade,
  clave text not null,
  periodicidad text not null,
  proximo_vencimiento date,
  estatus text not null default 'pendiente',
  evidencia_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_oblig_rfc on public.obligaciones_fiscales(rfc_id);

create table if not exists public.semaforo_fiscal (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  rfc_id uuid not null references public.rfcs(id) on delete cascade,
  periodo date not null,
  color text not null check (color in ('verde','amarillo','rojo')),
  motivos jsonb default '[]'::jsonb,
  calculado_at timestamptz not null default now(),
  unique (rfc_id, periodo)
);

-- =========================================================
-- 4. CFDI / XML
-- =========================================================

create table if not exists public.cfdi_xml (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  cliente_id  uuid not null references public.clientes(id) on delete cascade,
  rfc_id      uuid not null references public.rfcs(id) on delete cascade,
  uuid text not null,
  tipo_cfdi text not null,
  version text not null default '4.0',
  rfc_emisor text not null,
  nombre_emisor text,
  rfc_receptor text not null,
  nombre_receptor text,
  fecha timestamptz not null,
  fecha_timbrado timestamptz,
  metodo_pago text,
  forma_pago text,
  uso_cfdi text,
  moneda text default 'MXN',
  tipo_cambio numeric(18,6),
  subtotal numeric(18,2) not null default 0,
  descuento numeric(18,2) not null default 0,
  iva_trasladado numeric(18,2) not null default 0,
  ieps_trasladado numeric(18,2) not null default 0,
  iva_retenido numeric(18,2) not null default 0,
  isr_retenido numeric(18,2) not null default 0,
  total numeric(18,2) not null default 0,
  estatus_sat text,
  estatus_sat_check_at timestamptz,
  archivo_path text,
  archivo_hash text not null,
  fecha_carga timestamptz not null default now(),
  unique (despacho_id, uuid),
  unique (despacho_id, archivo_hash)
);
create index if not exists idx_cfdi_rfc_fecha on public.cfdi_xml(rfc_id, fecha desc);
create index if not exists idx_cfdi_desp_tipo on public.cfdi_xml(despacho_id, tipo_cfdi, fecha desc);

create table if not exists public.cfdi_conceptos (
  id uuid primary key default gen_random_uuid(),
  cfdi_id uuid not null references public.cfdi_xml(id) on delete cascade,
  clave_prod_serv text,
  descripcion text,
  cantidad numeric(18,6),
  valor_unitario numeric(18,6),
  importe numeric(18,2),
  descuento numeric(18,2)
);
create index if not exists idx_concep_cfdi on public.cfdi_conceptos(cfdi_id);

create table if not exists public.cfdi_relaciones (
  id uuid primary key default gen_random_uuid(),
  cfdi_id uuid not null references public.cfdi_xml(id) on delete cascade,
  uuid_relacionado text not null,
  tipo_relacion text not null
);
create index if not exists idx_relac_cfdi on public.cfdi_relaciones(cfdi_id);

-- =========================================================
-- 5. BANCOS Y CONCILIACION
-- =========================================================

create table if not exists public.cuentas_bancarias (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  cliente_id  uuid not null references public.clientes(id) on delete cascade,
  banco text not null,
  alias text,
  numero_cuenta_mask text,
  moneda text not null default 'MXN',
  created_at timestamptz not null default now()
);

create table if not exists public.movimientos_bancarios (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  cliente_id  uuid not null references public.clientes(id) on delete cascade,
  cuenta_id   uuid not null references public.cuentas_bancarias(id) on delete cascade,
  fecha date not null,
  descripcion text,
  referencia text,
  cargo numeric(18,2) not null default 0,
  abono numeric(18,2) not null default 0,
  saldo numeric(18,2),
  hash text not null,
  created_at timestamptz not null default now(),
  unique (cuenta_id, hash)
);
create index if not exists idx_mov_cuenta_fecha on public.movimientos_bancarios(cuenta_id, fecha desc);

create table if not exists public.conciliaciones (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  cliente_id  uuid not null references public.clientes(id) on delete cascade,
  movimiento_id uuid references public.movimientos_bancarios(id) on delete cascade,
  cfdi_id uuid references public.cfdi_xml(id) on delete set null,
  tipo_match text not null,
  probabilidad numeric(5,2),
  diferencia numeric(18,2),
  estatus text not null default 'propuesto',
  motivo text,
  confirmado_por uuid references auth.users(id),
  confirmado_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_conc_cliente on public.conciliaciones(cliente_id, estatus);

-- =========================================================
-- 6. ALERTAS / REPORTES / TAREAS / MENSAJES / IA
-- =========================================================

create table if not exists public.alertas (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete cascade,
  rfc_id uuid references public.rfcs(id) on delete cascade,
  nivel text not null check (nivel in ('bajo','medio','alto')),
  tipo text not null,
  titulo text not null,
  descripcion text,
  evidencia jsonb,
  recomendacion text,
  accion_sugerida text,
  estatus text not null default 'abierta',
  resuelta_por uuid references auth.users(id),
  resuelta_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_alertas_estado on public.alertas(despacho_id, estatus, nivel);

create table if not exists public.reportes (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete cascade,
  rfc_id uuid references public.rfcs(id) on delete cascade,
  tipo text not null,
  periodo daterange,
  parametros jsonb,
  resultado jsonb,
  archivo_path text,
  generado_por uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.tareas (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete cascade,
  titulo text not null,
  descripcion text,
  asignado_a uuid references auth.users(id),
  due_date date,
  prioridad text not null default 'media',
  estatus text not null default 'pendiente',
  origen text,
  origen_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mensajes (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete cascade,
  canal text not null,
  destinatario text,
  asunto text,
  cuerpo text,
  plantilla_key text,
  variables jsonb,
  estatus text not null default 'pendiente',
  enviado_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists public.ia_historial (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete cascade,
  rfc_id uuid references public.rfcs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_key text not null,
  modelo text not null,
  prompt jsonb,
  respuesta jsonb,
  tokens_in integer,
  tokens_out integer,
  costo_usd numeric(10,6),
  created_at timestamptz not null default now()
);
create index if not exists idx_ia_desp on public.ia_historial(despacho_id, created_at desc);

-- =========================================================
-- 7. BILLING
-- =========================================================

create table if not exists public.suscripciones (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  plan_id uuid not null references public.planes(id),
  estatus text not null,
  proveedor text not null,
  proveedor_sub_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pagos (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  suscripcion_id uuid references public.suscripciones(id) on delete set null,
  monto_mxn numeric(10,2),
  estatus text,
  proveedor text,
  proveedor_pago_id text,
  pagado_at timestamptz,
  created_at timestamptz not null default now()
);

-- =========================================================
-- 8. AUDITORIA / CONFIGURACION
-- =========================================================

create table if not exists public.audit_logs (
  id bigserial primary key,
  despacho_id uuid references public.despachos(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  accion text not null,
  entidad text,
  entidad_id uuid,
  payload jsonb,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_desp on public.audit_logs(despacho_id, created_at desc);

create table if not exists public.configuraciones (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  clave text not null,
  valor jsonb not null,
  updated_at timestamptz not null default now(),
  unique (despacho_id, clave)
);

-- =========================================================
-- 9. RLS — habilitar en todas las nuevas tablas
-- =========================================================

alter table public.planes              enable row level security;
alter table public.despachos           enable row level security;
alter table public.user_memberships    enable row level security;
alter table public.user_roles          enable row level security;
alter table public.rfcs                enable row level security;
alter table public.obligaciones_fiscales enable row level security;
alter table public.semaforo_fiscal     enable row level security;
alter table public.cfdi_xml            enable row level security;
alter table public.cfdi_conceptos      enable row level security;
alter table public.cfdi_relaciones     enable row level security;
alter table public.cuentas_bancarias   enable row level security;
alter table public.movimientos_bancarios enable row level security;
alter table public.conciliaciones      enable row level security;
alter table public.alertas             enable row level security;
alter table public.reportes            enable row level security;
alter table public.tareas              enable row level security;
alter table public.mensajes            enable row level security;
alter table public.ia_historial        enable row level security;
alter table public.suscripciones       enable row level security;
alter table public.pagos               enable row level security;
alter table public.audit_logs          enable row level security;
alter table public.configuraciones     enable row level security;

-- ---------- planes: lectura pública (catálogo) ----------
create policy "planes lectura todos" on public.planes for select using (true);

-- ---------- despachos ----------
create policy "despacho ve si es miembro" on public.despachos
  for select using (public.is_member_of(id) or owner_user_id = auth.uid());
create policy "despacho crea propio" on public.despachos
  for insert with check (owner_user_id = auth.uid());
create policy "despacho actualiza owner" on public.despachos
  for update using (owner_user_id = auth.uid() or public.has_role('despacho', id));
create policy "despacho borra owner" on public.despachos
  for delete using (owner_user_id = auth.uid());

-- ---------- user_memberships ----------
create policy "membresias propias" on public.user_memberships
  for select using (user_id = auth.uid() or public.has_role('despacho', despacho_id));
create policy "membresias insert despacho" on public.user_memberships
  for insert with check (public.has_role('despacho', despacho_id) or user_id = auth.uid());
create policy "membresias delete despacho" on public.user_memberships
  for delete using (public.has_role('despacho', despacho_id));

-- ---------- user_roles ----------
create policy "roles propios visibles" on public.user_roles
  for select using (user_id = auth.uid() or public.has_role('despacho', despacho_id));
create policy "roles asigna despacho" on public.user_roles
  for insert with check (public.has_role('despacho', despacho_id) or user_id = auth.uid());
create policy "roles borra despacho" on public.user_roles
  for delete using (public.has_role('despacho', despacho_id));

-- ---------- Helper macro: políticas estándar por despacho_id ----------
-- Aplicamos el mismo patrón a todas las tablas operativas.

-- rfcs
create policy "rfcs select" on public.rfcs for select using (public.is_member_of(despacho_id));
create policy "rfcs insert" on public.rfcs for insert with check (public.is_member_of(despacho_id));
create policy "rfcs update" on public.rfcs for update using (public.is_member_of(despacho_id));
create policy "rfcs delete" on public.rfcs for delete using (public.has_role('despacho', despacho_id));

-- obligaciones_fiscales
create policy "oblig select" on public.obligaciones_fiscales for select using (public.is_member_of(despacho_id));
create policy "oblig insert" on public.obligaciones_fiscales for insert with check (public.is_member_of(despacho_id));
create policy "oblig update" on public.obligaciones_fiscales for update using (public.is_member_of(despacho_id));
create policy "oblig delete" on public.obligaciones_fiscales for delete using (public.is_member_of(despacho_id));

-- semaforo_fiscal
create policy "sem select" on public.semaforo_fiscal for select using (public.is_member_of(despacho_id));
create policy "sem insert" on public.semaforo_fiscal for insert with check (public.is_member_of(despacho_id));
create policy "sem update" on public.semaforo_fiscal for update using (public.is_member_of(despacho_id));
create policy "sem delete" on public.semaforo_fiscal for delete using (public.is_member_of(despacho_id));

-- cfdi_xml
create policy "cfdi select" on public.cfdi_xml for select using (public.is_member_of(despacho_id));
create policy "cfdi insert" on public.cfdi_xml for insert with check (public.is_member_of(despacho_id));
create policy "cfdi update" on public.cfdi_xml for update using (public.is_member_of(despacho_id));
create policy "cfdi delete" on public.cfdi_xml for delete using (public.has_role('despacho', despacho_id));

-- cfdi_conceptos (vía cfdi)
create policy "concep select" on public.cfdi_conceptos for select using (
  exists (select 1 from public.cfdi_xml c where c.id = cfdi_id and public.is_member_of(c.despacho_id)));
create policy "concep insert" on public.cfdi_conceptos for insert with check (
  exists (select 1 from public.cfdi_xml c where c.id = cfdi_id and public.is_member_of(c.despacho_id)));
create policy "concep delete" on public.cfdi_conceptos for delete using (
  exists (select 1 from public.cfdi_xml c where c.id = cfdi_id and public.is_member_of(c.despacho_id)));

create policy "rel select" on public.cfdi_relaciones for select using (
  exists (select 1 from public.cfdi_xml c where c.id = cfdi_id and public.is_member_of(c.despacho_id)));
create policy "rel insert" on public.cfdi_relaciones for insert with check (
  exists (select 1 from public.cfdi_xml c where c.id = cfdi_id and public.is_member_of(c.despacho_id)));
create policy "rel delete" on public.cfdi_relaciones for delete using (
  exists (select 1 from public.cfdi_xml c where c.id = cfdi_id and public.is_member_of(c.despacho_id)));

-- cuentas_bancarias
create policy "cta select" on public.cuentas_bancarias for select using (public.is_member_of(despacho_id));
create policy "cta insert" on public.cuentas_bancarias for insert with check (public.is_member_of(despacho_id));
create policy "cta update" on public.cuentas_bancarias for update using (public.is_member_of(despacho_id));
create policy "cta delete" on public.cuentas_bancarias for delete using (public.has_role('despacho', despacho_id));

-- movimientos_bancarios
create policy "mov select" on public.movimientos_bancarios for select using (public.is_member_of(despacho_id));
create policy "mov insert" on public.movimientos_bancarios for insert with check (public.is_member_of(despacho_id));
create policy "mov update" on public.movimientos_bancarios for update using (public.is_member_of(despacho_id));
create policy "mov delete" on public.movimientos_bancarios for delete using (public.has_role('despacho', despacho_id));

-- conciliaciones
create policy "conc select" on public.conciliaciones for select using (public.is_member_of(despacho_id));
create policy "conc insert" on public.conciliaciones for insert with check (public.is_member_of(despacho_id));
create policy "conc update" on public.conciliaciones for update using (public.is_member_of(despacho_id));
create policy "conc delete" on public.conciliaciones for delete using (public.is_member_of(despacho_id));

-- alertas
create policy "al select" on public.alertas for select using (public.is_member_of(despacho_id));
create policy "al insert" on public.alertas for insert with check (public.is_member_of(despacho_id));
create policy "al update" on public.alertas for update using (public.is_member_of(despacho_id));
create policy "al delete" on public.alertas for delete using (public.has_role('despacho', despacho_id));

-- reportes
create policy "rep select" on public.reportes for select using (public.is_member_of(despacho_id));
create policy "rep insert" on public.reportes for insert with check (public.is_member_of(despacho_id));
create policy "rep update" on public.reportes for update using (public.is_member_of(despacho_id));
create policy "rep delete" on public.reportes for delete using (public.is_member_of(despacho_id));

-- tareas
create policy "tar select" on public.tareas for select using (public.is_member_of(despacho_id));
create policy "tar insert" on public.tareas for insert with check (public.is_member_of(despacho_id));
create policy "tar update" on public.tareas for update using (public.is_member_of(despacho_id));
create policy "tar delete" on public.tareas for delete using (public.is_member_of(despacho_id));

-- mensajes
create policy "msg select" on public.mensajes for select using (public.is_member_of(despacho_id));
create policy "msg insert" on public.mensajes for insert with check (public.is_member_of(despacho_id));
create policy "msg update" on public.mensajes for update using (public.is_member_of(despacho_id));
create policy "msg delete" on public.mensajes for delete using (public.has_role('despacho', despacho_id));

-- ia_historial
create policy "ia select" on public.ia_historial for select using (public.is_member_of(despacho_id));
create policy "ia insert" on public.ia_historial for insert with check (public.is_member_of(despacho_id) and user_id = auth.uid());

-- suscripciones / pagos: solo despacho
create policy "sub select" on public.suscripciones for select using (public.has_role('despacho', despacho_id) or public.is_member_of(despacho_id));
create policy "sub insert" on public.suscripciones for insert with check (public.has_role('despacho', despacho_id));
create policy "sub update" on public.suscripciones for update using (public.has_role('despacho', despacho_id));

create policy "pag select" on public.pagos for select using (public.has_role('despacho', despacho_id) or public.is_member_of(despacho_id));
create policy "pag insert" on public.pagos for insert with check (public.has_role('despacho', despacho_id));

-- audit_logs: solo lectura por miembros
create policy "audit select" on public.audit_logs for select using (
  despacho_id is null and user_id = auth.uid()
  or public.is_member_of(despacho_id)
);
create policy "audit insert" on public.audit_logs for insert with check (
  user_id = auth.uid()
);

-- configuraciones
create policy "cfg select" on public.configuraciones for select using (public.is_member_of(despacho_id));
create policy "cfg insert" on public.configuraciones for insert with check (public.has_role('despacho', despacho_id));
create policy "cfg update" on public.configuraciones for update using (public.has_role('despacho', despacho_id));
create policy "cfg delete" on public.configuraciones for delete using (public.has_role('despacho', despacho_id));

-- =========================================================
-- 10. PLANES seed
-- =========================================================
insert into public.planes (clave, nombre, precio_mxn, limites)
values
  ('starter','Starter', 299.00, '{"clientes":10,"rfcs":20,"xml_mes":1000,"ia_msgs":200}'::jsonb),
  ('pro','Pro', 799.00, '{"clientes":50,"rfcs":100,"xml_mes":5000,"ia_msgs":1000}'::jsonb),
  ('despacho','Despacho', 1999.00, '{"clientes":200,"rfcs":500,"xml_mes":25000,"ia_msgs":5000}'::jsonb)
on conflict (clave) do nothing;
