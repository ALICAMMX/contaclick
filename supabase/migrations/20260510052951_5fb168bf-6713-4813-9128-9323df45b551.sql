CREATE TABLE IF NOT EXISTS public.invitaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  role public.app_role NOT NULL DEFAULT 'colaborador'::public.app_role,
  created_by uuid NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  used_by uuid,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitaciones_despacho ON public.invitaciones(despacho_id);
CREATE INDEX IF NOT EXISTS idx_invitaciones_token ON public.invitaciones(token);

ALTER TABLE public.invitaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inv select admin" ON public.invitaciones
  FOR SELECT USING (has_role('despacho'::app_role, despacho_id));

CREATE POLICY "inv insert admin" ON public.invitaciones
  FOR INSERT WITH CHECK (has_role('despacho'::app_role, despacho_id) AND created_by = auth.uid());

CREATE POLICY "inv update admin" ON public.invitaciones
  FOR UPDATE USING (has_role('despacho'::app_role, despacho_id));

CREATE POLICY "inv delete admin" ON public.invitaciones
  FOR DELETE USING (has_role('despacho'::app_role, despacho_id));

CREATE POLICY "inv select valid by token" ON public.invitaciones
  FOR SELECT TO authenticated
  USING (used_at IS NULL AND revoked_at IS NULL AND expires_at > now());

CREATE OR REPLACE FUNCTION public.accept_invitation(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.invitaciones%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para aceptar la invitación';
  END IF;

  SELECT * INTO v_inv FROM public.invitaciones WHERE token = _token FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Invitación no encontrada'; END IF;
  IF v_inv.used_at IS NOT NULL THEN RAISE EXCEPTION 'Esta invitación ya fue utilizada'; END IF;
  IF v_inv.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Esta invitación fue cancelada'; END IF;
  IF v_inv.expires_at < now() THEN RAISE EXCEPTION 'Esta invitación expiró'; END IF;

  INSERT INTO public.user_memberships (user_id, despacho_id, estado, invited_by)
  VALUES (v_uid, v_inv.despacho_id, 'activo', v_inv.created_by)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_roles (user_id, despacho_id, role)
  VALUES (v_uid, v_inv.despacho_id, v_inv.role)
  ON CONFLICT DO NOTHING;

  UPDATE public.invitaciones SET used_at = now(), used_by = v_uid WHERE id = v_inv.id;

  RETURN v_inv.despacho_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;

UPDATE public.planes
SET limites = jsonb_set(coalesce(limites, '{}'::jsonb), '{max_miembros}', '2'::jsonb, true)
WHERE clave = 'trial' AND NOT (coalesce(limites, '{}'::jsonb) ? 'max_miembros');

UPDATE public.planes
SET limites = jsonb_set(coalesce(limites, '{}'::jsonb), '{max_miembros}', '5'::jsonb, true)
WHERE clave = 'basico' AND NOT (coalesce(limites, '{}'::jsonb) ? 'max_miembros');

UPDATE public.planes
SET limites = jsonb_set(coalesce(limites, '{}'::jsonb), '{max_miembros}', 'null'::jsonb, true)
WHERE clave = 'pro' AND NOT (coalesce(limites, '{}'::jsonb) ? 'max_miembros');