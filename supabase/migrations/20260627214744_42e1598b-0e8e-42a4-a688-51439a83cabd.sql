
CREATE TABLE IF NOT EXISTS public.mp_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  despacho_id UUID NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  plan_id TEXT NOT NULL,
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('mensual','anual')),
  iva_included BOOLEAN NOT NULL DEFAULT true,
  amount_mxn NUMERIC(12,2) NOT NULL,
  mp_preapproval_id TEXT,
  mp_init_point TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  last_event JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mp_subs_despacho ON public.mp_subscriptions(despacho_id);
CREATE INDEX IF NOT EXISTS idx_mp_subs_preapproval ON public.mp_subscriptions(mp_preapproval_id);

GRANT SELECT ON public.mp_subscriptions TO authenticated;
GRANT ALL ON public.mp_subscriptions TO service_role;

ALTER TABLE public.mp_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their despacho subscriptions"
  ON public.mp_subscriptions FOR SELECT TO authenticated
  USING (
    despacho_id IN (
      SELECT despacho_id FROM public.user_memberships
      WHERE user_id = auth.uid() AND estado = 'activo'
    )
  );

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_mp_subs_updated_at ON public.mp_subscriptions;
CREATE TRIGGER update_mp_subs_updated_at
  BEFORE UPDATE ON public.mp_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
