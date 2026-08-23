create or replace function public.cliente_eliminar(p_cliente_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.clientes%rowtype;
  v_permitido boolean := false;
begin
  if v_uid is null then
    raise exception 'Sesión no válida. Vuelve a iniciar sesión.' using errcode = '42501';
  end if;

  select * into v_row from public.clientes where id = p_cliente_id;
  if not found then
    return jsonb_build_object('ok', true, 'eliminado', false, 'motivo', 'El expediente ya no existe.');
  end if;

  if exists (select 1 from public.user_roles ur where ur.user_id = v_uid and ur.role = 'super_admin') then
    v_permitido := true;
  elsif v_row.despacho_id is null then
    v_permitido := v_row.user_id = v_uid;
  elsif exists (select 1 from public.despachos d where d.id = v_row.despacho_id and d.owner_user_id = v_uid) then
    v_permitido := true;
  elsif exists (
    select 1 from public.user_roles ur
    where ur.user_id = v_uid and ur.despacho_id = v_row.despacho_id and ur.role = 'despacho'
  ) then
    v_permitido := true;
  end if;

  if not v_permitido then
    raise exception 'Tu rol no permite eliminar este expediente. Pide al administrador del despacho que lo haga.'
      using errcode = '42501';
  end if;

  delete from public.clientes where cliente_padre_id = p_cliente_id;
  delete from public.clientes where id = p_cliente_id;

  return jsonb_build_object('ok', true, 'eliminado', true, 'cliente_id', p_cliente_id, 'rfc', v_row.rfc);
end;
$$;

revoke all on function public.cliente_eliminar(uuid) from public, anon;
grant execute on function public.cliente_eliminar(uuid) to authenticated, service_role;