-- Módulo Descarga Masiva SAT: tablas para configuración, runs y eventos de sincronización
CREATE TABLE IF NOT EXISTS public.sat_sync_config (
  cliente_id uuid PRIMARY KEY REFERENCES public.clientes(id) ON DELETE CASCADE,
  despacho_id uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  emitidos boolean NOT NULL DEFAULT true,
  recibidos boolean NOT NULL DEFAULT true,
  nomina boolean NOT NULL DEFAULT true,
  pagos boolean NOT NULL DEFAULT true,
  retenciones boolean NOT NULL DEFAULT false,
  frecuencia text NOT NULL DEFAULT 'diaria' CHECK (frecuencia IN ('manual','diaria','semanal','mensual')),
  periodo text NOT NULL DEFAULT 'mes_actual' CHECK (periodo IN ('30d','mes_actual','ejercicio','personalizado')),
  fecha_desde date,
  fecha_hasta date,
  activo boolean NOT NULL DEFAULT true,
  ultima_corrida_at timestamptz,
  proxima_corrida_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sat_sync_config TO authenticated;
GRANT ALL ON public.sat_sync_config TO service_role;
ALTER TABLE public.sat_sync_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ssc select" ON public.sat_sync_config FOR SELECT TO authenticated USING (public.is_member_of(despacho_id));
CREATE POLICY "ssc insert" ON public.sat_sync_config FOR INSERT TO authenticated WITH CHECK (public.is_member_of(despacho_id));
CREATE POLICY "ssc update" ON public.sat_sync_config FOR UPDATE TO authenticated USING (public.is_member_of(despacho_id));
CREATE POLICY "ssc delete" ON public.sat_sync_config FOR DELETE TO authenticated USING (public.has_role('despacho'::public.app_role, despacho_id));

CREATE TRIGGER trg_ssc_updated_at BEFORE UPDATE ON public.sat_sync_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


CREATE TABLE IF NOT EXISTS public.sat_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  iniciado_at timestamptz NOT NULL DEFAULT now(),
  finalizado_at timestamptz,
  duracion_ms integer,
  origen text NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','cron','expediente')),
  tipo text NOT NULL DEFAULT 'ambos',
  estatus text NOT NULL DEFAULT 'en_curso' CHECK (estatus IN ('en_curso','exitoso','parcial','error')),
  desde date,
  hasta date,
  descargados integer NOT NULL DEFAULT 0,
  nuevos integer NOT NULL DEFAULT 0,
  cancelados integer NOT NULL DEFAULT 0,
  duplicados integer NOT NULL DEFAULT 0,
  errores jsonb NOT NULL DEFAULT '[]'::jsonb,
  detalle text,
  triggered_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_ssr_despacho_fecha ON public.sat_sync_runs(despacho_id, iniciado_at DESC);
CREATE INDEX IF NOT EXISTS idx_ssr_cliente_fecha ON public.sat_sync_runs(cliente_id, iniciado_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.sat_sync_runs TO authenticated;
GRANT ALL ON public.sat_sync_runs TO service_role;
ALTER TABLE public.sat_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ssr select" ON public.sat_sync_runs FOR SELECT TO authenticated USING (public.is_member_of(despacho_id));
CREATE POLICY "ssr insert" ON public.sat_sync_runs FOR INSERT TO authenticated WITH CHECK (public.is_member_of(despacho_id));
CREATE POLICY "ssr update" ON public.sat_sync_runs FOR UPDATE TO authenticated USING (public.is_member_of(despacho_id));


CREATE TABLE IF NOT EXISTS public.sat_sync_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.sat_sync_runs(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN ('nuevo','cancelado','sustituido','duplicado','sospechoso','error')),
  uuid_cfdi text,
  monto numeric(18,2),
  rfc_contraparte text,
  mensaje text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sse_cliente ON public.sat_sync_eventos(cliente_id, created_at DESC);

GRANT SELECT, INSERT ON public.sat_sync_eventos TO authenticated;
GRANT ALL ON public.sat_sync_eventos TO service_role;
ALTER TABLE public.sat_sync_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sse select" ON public.sat_sync_eventos FOR SELECT TO authenticated USING (public.is_member_of(despacho_id));
CREATE POLICY "sse insert" ON public.sat_sync_eventos FOR INSERT TO authenticated WITH CHECK (public.is_member_of(despacho_id));