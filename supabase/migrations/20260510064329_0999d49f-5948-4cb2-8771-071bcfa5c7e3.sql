create table public.sat_credenciales (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null,
  cliente_id uuid not null unique,
  proveedor text not null default 'sw_sapien',
  pac_token text,
  estatus text not null default 'sin_conectar',
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sat_credenciales enable row level security;

create policy "sat select" on public.sat_credenciales
  for select using (is_member_of(despacho_id));
create policy "sat insert" on public.sat_credenciales
  for insert with check (is_member_of(despacho_id));
create policy "sat update" on public.sat_credenciales
  for update using (is_member_of(despacho_id));
create policy "sat delete" on public.sat_credenciales
  for delete using (has_role('despacho'::app_role, despacho_id));

create trigger trg_sat_updated_at before update on public.sat_credenciales
  for each row execute function public.tg_set_updated_at();