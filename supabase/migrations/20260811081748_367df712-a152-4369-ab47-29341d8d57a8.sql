CREATE OR REPLACE FUNCTION public.es_despacho_sandbox(_despacho uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT d.es_sandbox FROM public.despachos d WHERE d.id = _despacho), false);
$$;

REVOKE ALL ON FUNCTION public.es_despacho_sandbox(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.es_despacho_sandbox(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.cierre_eventos_inmutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND public.es_despacho_sandbox(OLD.despacho_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'cierre_eventos es una bitácora inmutable: % no permitido', TG_OP;
END;
$$;

CREATE OR REPLACE FUNCTION public.cierre_snapshots_inmutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND public.es_despacho_sandbox(OLD.despacho_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Los sellos de cierre son inmutables: % no permitido', TG_OP;
END;
$$;

CREATE OR REPLACE FUNCTION public.cierre_reaperturas_inmutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND public.es_despacho_sandbox(OLD.despacho_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'La bitácora de reaperturas es inmutable: % no permitido', TG_OP;
END;
$$;

CREATE OR REPLACE FUNCTION public.cfdi_decisiones_historial_inmutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND public.es_despacho_sandbox(OLD.despacho_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'El historial de decisiones fiscales es inmutable (% rechazado).', TG_OP;
END;
$$;