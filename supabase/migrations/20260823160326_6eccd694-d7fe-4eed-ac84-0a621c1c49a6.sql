-- Marca transaccional de purga autorizada de expediente
CREATE OR REPLACE FUNCTION public.purga_expediente_en_curso()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(current_setting('app.purga_expediente', true), '') = 'on'
$$;

REVOKE ALL ON FUNCTION public.purga_expediente_en_curso() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purga_expediente_en_curso() TO service_role;

CREATE OR REPLACE FUNCTION public.sat_programacion_bitacora_inmutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' AND (public.es_despacho_sandbox(OLD.despacho_id) OR public.purga_expediente_en_curso()) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'La bitácora de programaciones SAT es inmutable.';
END; $$;

CREATE OR REPLACE FUNCTION public.cfdi_decisiones_historial_inmutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' AND (public.es_despacho_sandbox(OLD.despacho_id) OR public.purga_expediente_en_curso()) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'El historial de decisiones fiscales es inmutable (% rechazado).', TG_OP;
END; $$;

CREATE OR REPLACE FUNCTION public.cierre_eventos_inmutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' AND (public.es_despacho_sandbox(OLD.despacho_id) OR public.purga_expediente_en_curso()) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'cierre_eventos es una bitácora inmutable: % no permitido', TG_OP;
END; $$;

CREATE OR REPLACE FUNCTION public.cierre_reaperturas_inmutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' AND (public.es_despacho_sandbox(OLD.despacho_id) OR public.purga_expediente_en_curso()) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'La bitácora de reaperturas es inmutable: % no permitido', TG_OP;
END; $$;

CREATE OR REPLACE FUNCTION public.cierre_snapshots_inmutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' AND (public.es_despacho_sandbox(OLD.despacho_id) OR public.purga_expediente_en_curso()) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Los sellos de cierre son inmutables: % no permitido', TG_OP;
END; $$;

CREATE OR REPLACE FUNCTION public.conciliacion_bitacora_inmutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' AND public.purga_expediente_en_curso() THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'La bitácora de conciliación es inmutable.';
END; $$;

CREATE OR REPLACE FUNCTION public.reglas_concepto_historial_inmutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' AND public.purga_expediente_en_curso() THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'El historial de reglas por concepto es inmutable.';
END; $$;

CREATE OR REPLACE FUNCTION public.cfdi_sat_evidencias_inmutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' AND public.purga_expediente_en_curso() THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'La bitácora de evidencia SAT es inmutable: no admite %', TG_OP;
END; $$;

-- cliente_eliminar: activa la marca de purga sólo tras validar permisos
CREATE OR REPLACE FUNCTION public.cliente_eliminar(p_cliente_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Marca transaccional: permite que las bitácoras históricas del expediente
  -- se eliminen en cascada dentro de esta operación autorizada únicamente.
  perform set_config('app.purga_expediente', 'on', true);

  delete from public.clientes where cliente_padre_id = p_cliente_id;
  delete from public.clientes where id = p_cliente_id;

  perform set_config('app.purga_expediente', 'off', true);

  return jsonb_build_object('ok', true, 'eliminado', true, 'cliente_id', p_cliente_id, 'rfc', v_row.rfc);
end;
$$;