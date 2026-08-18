CREATE OR REPLACE FUNCTION public.sat_programacion_bitacora_qa_fallo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.detalle ? 'qa_forzar_fallo' AND public.es_despacho_sandbox(NEW.despacho_id) THEN
    RAISE EXCEPTION 'Fallo de bitácora inducido para prueba de reversión.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sat_prog_bitacora_qa_fallo ON public.sat_programacion_bitacora;
CREATE TRIGGER trg_sat_prog_bitacora_qa_fallo
BEFORE INSERT ON public.sat_programacion_bitacora
FOR EACH ROW EXECUTE FUNCTION public.sat_programacion_bitacora_qa_fallo();