CREATE OR REPLACE FUNCTION public.sat_programacion_bitacora_inmutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Inmutable en producción. Única excepción, igual que en las demás
  -- bitácoras: los despachos sandbox pueden purgar sus rastros sintéticos.
  IF TG_OP = 'DELETE' AND public.es_despacho_sandbox(OLD.despacho_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'La bitácora de programaciones SAT es inmutable.';
END;
$$;