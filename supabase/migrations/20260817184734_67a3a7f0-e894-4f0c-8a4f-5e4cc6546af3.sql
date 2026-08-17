CREATE OR REPLACE FUNCTION public.poliza_exigir_cuadre()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE v_c bigint; v_a bigint; v_n int; v_malas bigint;
BEGIN
  IF coalesce(NEW.estado,'borrador') <> 'aprobada' THEN RETURN NEW; END IF;

  -- Toda la validación se limita a la póliza objetivo (NEW.id) y a sus renglones
  -- canónicos. Nunca se evalúan otras pólizas del mismo periodo.
  SELECT count(*), coalesce(sum(cargo_centavos),0), coalesce(sum(abono_centavos),0)
    INTO v_n, v_c, v_a FROM public.poliza_renglones WHERE poliza_id = NEW.id;

  IF v_n < 2 THEN
    RAISE EXCEPTION 'La póliza % no puede aprobarse sin renglones suficientes.', NEW.id;
  END IF;
  IF v_c <> v_a OR v_c = 0 THEN
    RAISE EXCEPTION 'La póliza % no cuadra: cargos % vs abonos % (centavos).', NEW.id, v_c, v_a;
  END IF;

  SELECT count(*) INTO v_malas
    FROM public.poliza_renglones r
   WHERE r.poliza_id = NEW.id
     AND (
       btrim(coalesce(r.cuenta,'')) = ''
       OR r.cuenta ILIKE '%por identificar%'
       OR NOT EXISTS (
         SELECT 1 FROM public.catalogo_cuentas cc
          WHERE cc.cliente_id = NEW.cliente_id AND cc.codigo = r.cuenta AND cc.activa)
     );
  IF v_malas > 0 THEN
    RAISE EXCEPTION 'La póliza % no puede aprobarse: % renglones con cuenta por identificar o ausente del catálogo.', NEW.id, v_malas;
  END IF;

  RETURN NEW;
END; $function$;