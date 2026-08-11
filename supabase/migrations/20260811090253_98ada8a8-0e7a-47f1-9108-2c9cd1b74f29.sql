-- 1) Las entradas fiscales ahora informan cuántos comprobantes reconoce el
--    periodo y NO son evaluables cuando no hay ninguno. Se conserva el motor
--    existente y se envuelve para no duplicar su lógica.
ALTER FUNCTION public.cierre_entradas_fiscales(uuid, text)
  RENAME TO cierre_entradas_fiscales_base;

CREATE OR REPLACE FUNCTION public.cierre_entradas_fiscales(_cliente_id uuid, _periodo text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_e jsonb; v_docs bigint; v_emit bigint; v_recib bigint;
BEGIN
  v_e := public.cierre_entradas_fiscales_base(_cliente_id, _periodo) - 'input_hash';

  SELECT count(*),
         count(*) FILTER (WHERE c.direccion = 'emitido'),
         count(*) FILTER (WHERE c.direccion = 'recibido')
    INTO v_docs, v_emit, v_recib
  FROM public.cfdi_xml c
  WHERE c.cliente_id = _cliente_id AND c.periodo = _periodo;

  v_e := v_e || jsonb_build_object(
    'entradas_version','entradas@3',
    'documentos_periodo', v_docs,
    'documentos_emitidos', v_emit,
    'documentos_recibidos', v_recib,
    -- Falla cerrada: sin comprobantes reconocidos no hay nada que calcular.
    'evaluable', (coalesce((v_e->>'evaluable')::boolean, false) AND v_docs > 0));

  RETURN v_e || jsonb_build_object('input_hash', public.cierre_hash_jsonb(v_e));
END;
$function$;

-- 2) Vigencia de los resultados fiscales: un cálculo hecho con evidencia vacía
--    se conserva como historial inmutable, pero deja de presentarse como vigente.
ALTER TABLE public.cierre_resultado_fiscal
  ADD COLUMN IF NOT EXISTS vigente boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS obsoleto_motivo text,
  ADD COLUMN IF NOT EXISTS obsoleto_at timestamptz;

-- 3) El servidor rechaza registrar un resultado de un periodo sin documentos.
CREATE OR REPLACE FUNCTION public.cierre_rf_exige_documentos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce((NEW.entradas->>'documentos_periodo')::bigint, 0) <= 0 THEN
    RAISE EXCEPTION 'El periodo no tiene comprobantes reconocidos: no puede registrarse un resultado fiscal.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cierre_rf_exige_documentos ON public.cierre_resultado_fiscal;
CREATE TRIGGER cierre_rf_exige_documentos
  BEFORE INSERT ON public.cierre_resultado_fiscal
  FOR EACH ROW EXECUTE FUNCTION public.cierre_rf_exige_documentos();