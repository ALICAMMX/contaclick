-- 1. Update handle_new_user trigger to bootstrap despacho + membership + role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_despacho_id uuid;
  v_nombre text;
begin
  -- Profile
  insert into public.profiles (id, email, full_name, despacho_nombre)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'despacho_nombre', '')
  )
  on conflict (id) do nothing;

  v_nombre := coalesce(
    nullif(new.raw_user_meta_data->>'despacho_nombre', ''),
    nullif(new.raw_user_meta_data->>'full_name', ''),
    split_part(new.email, '@', 1),
    'Mi Despacho'
  );

  -- Create despacho
  insert into public.despachos (nombre, owner_user_id, estado, trial_ends_at)
  values (v_nombre, new.id, 'trial', now() + interval '14 days')
  returning id into v_despacho_id;

  -- Membership
  insert into public.user_memberships (user_id, despacho_id, estado)
  values (new.id, v_despacho_id, 'activo')
  on conflict do nothing;

  -- Role
  insert into public.user_roles (user_id, despacho_id, role)
  values (new.id, v_despacho_id, 'despacho')
  on conflict do nothing;

  return new;
end;
$$;

-- Ensure trigger is attached
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Backfill: create despachos for existing users who don't have one
DO $$
declare
  u record;
  v_despacho_id uuid;
  v_nombre text;
begin
  for u in
    select au.id as user_id, au.email, p.full_name, p.despacho_nombre
    from auth.users au
    left join public.profiles p on p.id = au.id
    where not exists (
      select 1 from public.despachos d where d.owner_user_id = au.id
    )
  loop
    v_nombre := coalesce(
      nullif(u.despacho_nombre, ''),
      nullif(u.full_name, ''),
      split_part(u.email, '@', 1),
      'Mi Despacho'
    );

    insert into public.despachos (nombre, owner_user_id, estado, trial_ends_at)
    values (v_nombre, u.user_id, 'trial', now() + interval '14 days')
    returning id into v_despacho_id;

    insert into public.user_memberships (user_id, despacho_id, estado)
    values (u.user_id, v_despacho_id, 'activo')
    on conflict do nothing;

    insert into public.user_roles (user_id, despacho_id, role)
    values (u.user_id, v_despacho_id, 'despacho')
    on conflict do nothing;
  end loop;
end$$;

-- 3. Backfill clientes.despacho_id from owner's despacho
UPDATE public.clientes c
SET despacho_id = d.id
FROM public.despachos d
WHERE c.despacho_id IS NULL
  AND d.owner_user_id = c.user_id;

-- 4. Update clientes RLS to be despacho-based (keep user_id legacy fallback)
DROP POLICY IF EXISTS "Users view own clientes" ON public.clientes;
DROP POLICY IF EXISTS "Users insert own clientes" ON public.clientes;
DROP POLICY IF EXISTS "Users update own clientes" ON public.clientes;
DROP POLICY IF EXISTS "Users delete own clientes" ON public.clientes;

CREATE POLICY "clientes select"
  ON public.clientes FOR SELECT
  USING (
    (despacho_id IS NOT NULL AND public.is_member_of(despacho_id))
    OR (despacho_id IS NULL AND user_id = auth.uid())
  );

CREATE POLICY "clientes insert"
  ON public.clientes FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (despacho_id IS NULL OR public.is_member_of(despacho_id))
  );

CREATE POLICY "clientes update"
  ON public.clientes FOR UPDATE
  USING (
    (despacho_id IS NOT NULL AND public.is_member_of(despacho_id))
    OR (despacho_id IS NULL AND user_id = auth.uid())
  );

CREATE POLICY "clientes delete"
  ON public.clientes FOR DELETE
  USING (
    (despacho_id IS NOT NULL AND public.has_role('despacho'::app_role, despacho_id))
    OR (despacho_id IS NULL AND user_id = auth.uid())
  );
