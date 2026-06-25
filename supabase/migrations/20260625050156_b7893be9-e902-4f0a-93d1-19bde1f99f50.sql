
-- Extender tareas
ALTER TABLE public.tareas
  ADD COLUMN IF NOT EXISTS tipo text,
  ADD COLUMN IF NOT EXISTS kanban_estado text NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS tiempo_invertido_min integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS requires_evidence boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS evidencia_url text,
  ADD COLUMN IF NOT EXISTS completada_at timestamptz,
  ADD COLUMN IF NOT EXISTS completada_by uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE INDEX IF NOT EXISTS idx_tareas_despacho_kanban ON public.tareas(despacho_id, kanban_estado);
CREATE INDEX IF NOT EXISTS idx_tareas_asignado ON public.tareas(asignado_a);
CREATE INDEX IF NOT EXISTS idx_tareas_cliente ON public.tareas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_tareas_due ON public.tareas(due_date);

-- Comentarios
CREATE TABLE IF NOT EXISTS public.tarea_comentarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id uuid NOT NULL REFERENCES public.tareas(id) ON DELETE CASCADE,
  despacho_id uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  contenido text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarea_comentarios TO authenticated;
GRANT ALL ON public.tarea_comentarios TO service_role;
ALTER TABLE public.tarea_comentarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read comentarios" ON public.tarea_comentarios FOR SELECT TO authenticated
  USING (public.is_member_of(despacho_id));
CREATE POLICY "members insert comentarios" ON public.tarea_comentarios FOR INSERT TO authenticated
  WITH CHECK (public.is_member_of(despacho_id) AND user_id = auth.uid());
CREATE POLICY "owner delete comentarios" ON public.tarea_comentarios FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_despacho_admin(despacho_id));
CREATE INDEX IF NOT EXISTS idx_tarea_comentarios_tarea ON public.tarea_comentarios(tarea_id, created_at DESC);

-- Bitácora
CREATE TABLE IF NOT EXISTS public.tarea_bitacora (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id uuid NOT NULL REFERENCES public.tareas(id) ON DELETE CASCADE,
  despacho_id uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  user_id uuid,
  evento text NOT NULL,
  detalle jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.tarea_bitacora TO authenticated;
GRANT ALL ON public.tarea_bitacora TO service_role;
ALTER TABLE public.tarea_bitacora ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read bitacora" ON public.tarea_bitacora FOR SELECT TO authenticated
  USING (public.is_member_of(despacho_id));
CREATE POLICY "members insert bitacora" ON public.tarea_bitacora FOR INSERT TO authenticated
  WITH CHECK (public.is_member_of(despacho_id));
CREATE INDEX IF NOT EXISTS idx_tarea_bitacora_tarea ON public.tarea_bitacora(tarea_id, created_at DESC);

-- Adjuntos
CREATE TABLE IF NOT EXISTS public.tarea_adjuntos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id uuid NOT NULL REFERENCES public.tareas(id) ON DELETE CASCADE,
  despacho_id uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  nombre text NOT NULL,
  url text NOT NULL,
  tamano_bytes bigint,
  mime text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.tarea_adjuntos TO authenticated;
GRANT ALL ON public.tarea_adjuntos TO service_role;
ALTER TABLE public.tarea_adjuntos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read adjuntos" ON public.tarea_adjuntos FOR SELECT TO authenticated
  USING (public.is_member_of(despacho_id));
CREATE POLICY "members insert adjuntos" ON public.tarea_adjuntos FOR INSERT TO authenticated
  WITH CHECK (public.is_member_of(despacho_id) AND user_id = auth.uid());
CREATE POLICY "owner delete adjuntos" ON public.tarea_adjuntos FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_despacho_admin(despacho_id));
CREATE INDEX IF NOT EXISTS idx_tarea_adjuntos_tarea ON public.tarea_adjuntos(tarea_id, created_at DESC);
