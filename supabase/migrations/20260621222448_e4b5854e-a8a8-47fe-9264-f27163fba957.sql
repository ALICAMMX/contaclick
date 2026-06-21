
-- 1) Add despacho_id columns (nullable for backfill)
ALTER TABLE public.defensas  ADD COLUMN IF NOT EXISTS despacho_id uuid REFERENCES public.despachos(id) ON DELETE CASCADE;
ALTER TABLE public.tool_runs ADD COLUMN IF NOT EXISTS despacho_id uuid REFERENCES public.despachos(id) ON DELETE CASCADE;

-- 2) Backfill: prefer active membership, fall back to owned despacho
UPDATE public.defensas d
SET despacho_id = COALESCE(
  (SELECT m.despacho_id FROM public.user_memberships m
    WHERE m.user_id = d.user_id AND m.estado = 'activo'
    ORDER BY m.created_at ASC LIMIT 1),
  (SELECT x.id FROM public.despachos x
    WHERE x.owner_user_id = d.user_id
    ORDER BY x.created_at ASC LIMIT 1)
)
WHERE d.despacho_id IS NULL;

UPDATE public.tool_runs t
SET despacho_id = COALESCE(
  (SELECT m.despacho_id FROM public.user_memberships m
    WHERE m.user_id = t.user_id AND m.estado = 'activo'
    ORDER BY m.created_at ASC LIMIT 1),
  (SELECT x.id FROM public.despachos x
    WHERE x.owner_user_id = t.user_id
    ORDER BY x.created_at ASC LIMIT 1)
)
WHERE t.despacho_id IS NULL;

-- 3) Drop orphan rows that could not be mapped (no membership and no owned despacho)
DELETE FROM public.defensas  WHERE despacho_id IS NULL;
DELETE FROM public.tool_runs WHERE despacho_id IS NULL;

-- 4) Enforce NOT NULL
ALTER TABLE public.defensas  ALTER COLUMN despacho_id SET NOT NULL;
ALTER TABLE public.tool_runs ALTER COLUMN despacho_id SET NOT NULL;

-- 5) Indexes
CREATE INDEX IF NOT EXISTS idx_defensas_despacho  ON public.defensas(despacho_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_runs_despacho ON public.tool_runs(despacho_id, created_at DESC);

-- 6) Replace RLS policies with despacho-scoped membership checks
DROP POLICY IF EXISTS "Users manage their own defensas" ON public.defensas;
DROP POLICY IF EXISTS "Users view own tool_runs"   ON public.tool_runs;
DROP POLICY IF EXISTS "Users insert own tool_runs" ON public.tool_runs;
DROP POLICY IF EXISTS "Users update own tool_runs" ON public.tool_runs;
DROP POLICY IF EXISTS "Users delete own tool_runs" ON public.tool_runs;

CREATE POLICY "Members view defensas of their despacho"
  ON public.defensas FOR SELECT TO authenticated
  USING (public.is_member_of(despacho_id));

CREATE POLICY "Members insert defensas in their despacho"
  ON public.defensas FOR INSERT TO authenticated
  WITH CHECK (public.is_member_of(despacho_id) AND auth.uid() = user_id);

CREATE POLICY "Members update defensas of their despacho"
  ON public.defensas FOR UPDATE TO authenticated
  USING (public.is_member_of(despacho_id))
  WITH CHECK (public.is_member_of(despacho_id));

CREATE POLICY "Members delete defensas of their despacho"
  ON public.defensas FOR DELETE TO authenticated
  USING (public.is_member_of(despacho_id));

CREATE POLICY "Members view tool_runs of their despacho"
  ON public.tool_runs FOR SELECT TO authenticated
  USING (public.is_member_of(despacho_id));

CREATE POLICY "Members insert tool_runs in their despacho"
  ON public.tool_runs FOR INSERT TO authenticated
  WITH CHECK (public.is_member_of(despacho_id) AND auth.uid() = user_id);

CREATE POLICY "Members update tool_runs of their despacho"
  ON public.tool_runs FOR UPDATE TO authenticated
  USING (public.is_member_of(despacho_id))
  WITH CHECK (public.is_member_of(despacho_id));

CREATE POLICY "Members delete tool_runs of their despacho"
  ON public.tool_runs FOR DELETE TO authenticated
  USING (public.is_member_of(despacho_id));
