-- ============ WORKFLOW AUTOMÁTICO DEL EXPEDIENTE ============

-- Enums
DO $$ BEGIN
  CREATE TYPE public.workflow_status AS ENUM ('activo','pausado','borrador','archivado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.workflow_run_status AS ENUM ('pendiente','corriendo','exito','fallido','parcial','cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.workflow_step_status AS ENUM ('pendiente','corriendo','exito','fallido','omitido');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================  WORKFLOWS  =====================
CREATE TABLE IF NOT EXISTS public.workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id UUID NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE, -- null = global del despacho
  nombre TEXT NOT NULL,
  descripcion TEXT,
  template_key TEXT, -- si proviene de un template
  status public.workflow_status NOT NULL DEFAULT 'activo',
  trigger_type TEXT NOT NULL, -- ej: 'xml_uploaded', 'cron', 'buzon_notif', etc.
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb, -- ej: { cron: '0 */2 * * *', condiciones: [...] }
  nodes JSONB NOT NULL DEFAULT '[]'::jsonb, -- arreglo de nodos: [{id, type:'trigger|action|condition', kind, params, next:[ids]}]
  edges JSONB NOT NULL DEFAULT '[]'::jsonb, -- conexiones del builder visual
  responsable_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  prioridad TEXT NOT NULL DEFAULT 'media' CHECK (prioridad IN ('baja','media','alta','critica')),
  total_runs INT NOT NULL DEFAULT 0,
  total_success INT NOT NULL DEFAULT 0,
  total_failed INT NOT NULL DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workflows_despacho_idx ON public.workflows(despacho_id);
CREATE INDEX IF NOT EXISTS workflows_cliente_idx ON public.workflows(cliente_id);
CREATE INDEX IF NOT EXISTS workflows_trigger_idx ON public.workflows(trigger_type) WHERE status = 'activo';
CREATE INDEX IF NOT EXISTS workflows_next_run_idx ON public.workflows(next_run_at) WHERE status = 'activo' AND trigger_type = 'cron';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflows TO authenticated;
GRANT ALL ON public.workflows TO service_role;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflows: members select" ON public.workflows
  FOR SELECT TO authenticated USING (public.is_member_of(despacho_id));
CREATE POLICY "workflows: admins insert" ON public.workflows
  FOR INSERT TO authenticated WITH CHECK (public.is_despacho_admin(despacho_id));
CREATE POLICY "workflows: admins update" ON public.workflows
  FOR UPDATE TO authenticated USING (public.is_despacho_admin(despacho_id));
CREATE POLICY "workflows: admins delete" ON public.workflows
  FOR DELETE TO authenticated USING (public.is_despacho_admin(despacho_id));

CREATE TRIGGER trg_workflows_updated_at BEFORE UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =====================  WORKFLOW RUNS  =====================
CREATE TABLE IF NOT EXISTS public.workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id UUID NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  status public.workflow_run_status NOT NULL DEFAULT 'pendiente',
  trigger_type TEXT NOT NULL,
  trigger_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_ms INT,
  total_steps INT NOT NULL DEFAULT 0,
  steps_ok INT NOT NULL DEFAULT 0,
  steps_failed INT NOT NULL DEFAULT 0,
  error_message TEXT,
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wruns_workflow_idx ON public.workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS wruns_despacho_started_idx ON public.workflow_runs(despacho_id, started_at DESC);
CREATE INDEX IF NOT EXISTS wruns_cliente_idx ON public.workflow_runs(cliente_id);
CREATE INDEX IF NOT EXISTS wruns_status_idx ON public.workflow_runs(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_runs TO authenticated;
GRANT ALL ON public.workflow_runs TO service_role;
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wruns: members select" ON public.workflow_runs
  FOR SELECT TO authenticated USING (public.is_member_of(despacho_id));
CREATE POLICY "wruns: members insert" ON public.workflow_runs
  FOR INSERT TO authenticated WITH CHECK (public.is_member_of(despacho_id));
CREATE POLICY "wruns: admins update" ON public.workflow_runs
  FOR UPDATE TO authenticated USING (public.is_despacho_admin(despacho_id));
CREATE POLICY "wruns: admins delete" ON public.workflow_runs
  FOR DELETE TO authenticated USING (public.is_despacho_admin(despacho_id));

-- =====================  WORKFLOW RUN STEPS (bitácora detallada)  =====================
CREATE TABLE IF NOT EXISTS public.workflow_run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  despacho_id UUID NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL, -- id del nodo dentro del workflow.nodes
  kind TEXT NOT NULL, -- ej: 'auditor_express', 'crear_tarea', etc.
  step_type TEXT NOT NULL CHECK (step_type IN ('trigger','action','condition')),
  status public.workflow_step_status NOT NULL DEFAULT 'pendiente',
  input JSONB,
  output JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_ms INT,
  position INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS wrsteps_run_idx ON public.workflow_run_steps(run_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_run_steps TO authenticated;
GRANT ALL ON public.workflow_run_steps TO service_role;
ALTER TABLE public.workflow_run_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wrsteps: members select" ON public.workflow_run_steps
  FOR SELECT TO authenticated USING (public.is_member_of(despacho_id));
CREATE POLICY "wrsteps: members insert" ON public.workflow_run_steps
  FOR INSERT TO authenticated WITH CHECK (public.is_member_of(despacho_id));
CREATE POLICY "wrsteps: admins update" ON public.workflow_run_steps
  FOR UPDATE TO authenticated USING (public.is_despacho_admin(despacho_id));

-- =====================  WORKFLOW SUGGESTIONS (IA supervisora)  =====================
CREATE TABLE IF NOT EXISTS public.workflow_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id UUID NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  patron_detectado TEXT NOT NULL,
  template_sugerido TEXT,
  trigger_sugerido TEXT,
  acciones_sugeridas JSONB NOT NULL DEFAULT '[]'::jsonb,
  confianza NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  estado TEXT NOT NULL DEFAULT 'nueva' CHECK (estado IN ('nueva','aceptada','rechazada','aplicada')),
  evidencia JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS wsugg_despacho_idx ON public.workflow_suggestions(despacho_id, estado);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_suggestions TO authenticated;
GRANT ALL ON public.workflow_suggestions TO service_role;
ALTER TABLE public.workflow_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wsugg: members select" ON public.workflow_suggestions
  FOR SELECT TO authenticated USING (public.is_member_of(despacho_id));
CREATE POLICY "wsugg: members insert" ON public.workflow_suggestions
  FOR INSERT TO authenticated WITH CHECK (public.is_member_of(despacho_id));
CREATE POLICY "wsugg: admins update" ON public.workflow_suggestions
  FOR UPDATE TO authenticated USING (public.is_despacho_admin(despacho_id));
CREATE POLICY "wsugg: admins delete" ON public.workflow_suggestions
  FOR DELETE TO authenticated USING (public.is_despacho_admin(despacho_id));

-- =====================  TRIGGER EVENTS QUEUE (eventos pendientes de procesar)  =====================
CREATE TABLE IF NOT EXISTS public.workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id UUID NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  procesado BOOLEAN NOT NULL DEFAULT false,
  procesado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wevents_pendientes_idx ON public.workflow_events(despacho_id, procesado, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_events TO authenticated;
GRANT ALL ON public.workflow_events TO service_role;
ALTER TABLE public.workflow_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wevents: members select" ON public.workflow_events
  FOR SELECT TO authenticated USING (public.is_member_of(despacho_id));
CREATE POLICY "wevents: members insert" ON public.workflow_events
  FOR INSERT TO authenticated WITH CHECK (public.is_member_of(despacho_id));
CREATE POLICY "wevents: admins update" ON public.workflow_events
  FOR UPDATE TO authenticated USING (public.is_despacho_admin(despacho_id));