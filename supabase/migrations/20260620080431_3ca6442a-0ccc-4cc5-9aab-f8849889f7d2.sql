
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telefono text,
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

-- Helper: ¿el usuario actual es super_admin?
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'::app_role
  );
$$;

-- handle_new_user actualizado para guardar telefono
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_despacho_id uuid;
  v_nombre text;
BEGIN
  INSERT INTO public.profiles (id, email, full_name, despacho_nombre, telefono)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    COALESCE(new.raw_user_meta_data->>'despacho_nombre', ''),
    NULLIF(new.raw_user_meta_data->>'telefono', '')
  )
  ON CONFLICT (id) DO NOTHING;

  v_nombre := COALESCE(
    NULLIF(new.raw_user_meta_data->>'despacho_nombre', ''),
    NULLIF(new.raw_user_meta_data->>'full_name', ''),
    split_part(new.email, '@', 1),
    'Mi Despacho'
  );

  INSERT INTO public.despachos (nombre, owner_user_id, estado, trial_ends_at)
  VALUES (v_nombre, new.id, 'trial', now() + interval '14 days')
  RETURNING id INTO v_despacho_id;

  INSERT INTO public.user_memberships (user_id, despacho_id, estado)
  VALUES (new.id, v_despacho_id, 'activo')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_roles (user_id, despacho_id, role)
  VALUES (new.id, v_despacho_id, 'despacho')
  ON CONFLICT DO NOTHING;

  RETURN new;
END;
$$;

-- Políticas super_admin
DROP POLICY IF EXISTS "super_admin all profiles" ON public.profiles;
CREATE POLICY "super_admin all profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "super_admin all despachos" ON public.despachos;
CREATE POLICY "super_admin all despachos" ON public.despachos
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "super_admin all suscripciones" ON public.suscripciones;
CREATE POLICY "super_admin all suscripciones" ON public.suscripciones
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "super_admin all pagos" ON public.pagos;
CREATE POLICY "super_admin all pagos" ON public.pagos
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "super_admin all ia" ON public.ia_historial;
CREATE POLICY "super_admin all ia" ON public.ia_historial
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "super_admin all roles" ON public.user_roles;
CREATE POLICY "super_admin all roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "super_admin all memberships" ON public.user_memberships;
CREATE POLICY "super_admin all memberships" ON public.user_memberships
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
