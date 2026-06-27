
CREATE TABLE public.despacho_google_tokens (
  despacho_id uuid PRIMARY KEY REFERENCES public.despachos(id) ON DELETE CASCADE,
  google_email text NOT NULL,
  refresh_token text NOT NULL,
  access_token text,
  expires_at timestamptz,
  scope text,
  calendar_id text DEFAULT 'primary',
  connected_by uuid REFERENCES auth.users(id),
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.despacho_google_tokens TO service_role;
ALTER TABLE public.despacho_google_tokens ENABLE ROW LEVEL SECURITY;
-- Owners may SEE that a connection exists (no token columns exposed via app code; server uses service_role)
CREATE POLICY "Owner can view own google connection" ON public.despacho_google_tokens
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.despachos d WHERE d.id = despacho_id AND d.owner_user_id = auth.uid()));
GRANT SELECT ON public.despacho_google_tokens TO authenticated;

CREATE TABLE public.google_oauth_states (
  state text PRIMARY KEY,
  despacho_id uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.google_oauth_states TO service_role;
ALTER TABLE public.google_oauth_states ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.google_calendar_event_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  obligacion_id uuid NOT NULL REFERENCES public.obligaciones_fiscales(id) ON DELETE CASCADE,
  google_event_id text NOT NULL,
  last_pushed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (despacho_id, obligacion_id)
);
GRANT ALL ON public.google_calendar_event_map TO service_role;
ALTER TABLE public.google_calendar_event_map ENABLE ROW LEVEL SECURITY;
