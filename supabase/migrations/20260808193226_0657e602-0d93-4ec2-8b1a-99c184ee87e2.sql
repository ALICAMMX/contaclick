alter table public.cfdi_xml
  add column if not exists origen text,
  add column if not exists proveedor text,
  add column if not exists sat_run_id uuid references public.sat_sync_runs(id) on delete set null,
  add column if not exists sat_solicitud_id text,
  add column if not exists sat_paquete_id text,
  add column if not exists validacion text;

create index if not exists idx_cfdi_xml_sat_run on public.cfdi_xml(sat_run_id);
create index if not exists idx_sat_sync_eventos_run on public.sat_sync_eventos(run_id);
create index if not exists idx_sat_sync_eventos_tipo on public.sat_sync_eventos(cliente_id, tipo);