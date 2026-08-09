-- ─────────────────────────────────────────────────────────────────────────────
-- PRUEBA REAL DE PERSISTENCIA — Centro de cierre mensual.
--
-- Corre contra la base de datos dentro de UNA transacción que SIEMPRE se
-- revierte. No deja datos. Verifica lo que las pruebas en memoria no pueden:
--   1. La cadena completa XML -> cfdi_xml -> conceptos -> impuestos -> pagos ->
--      documentos relacionados -> impuestos del pago, en una sola transacción.
--   2. Atomicidad: si una inserción falla, no queda NADA del detalle nuevo.
--   3. El estatus SAT sobrevive al reproceso.
--   4. Un periodo declarado listo se reabre al llegar un comprobante nuevo,
--      y NO se reabre cuando sólo se reprocesa uno ya conocido.
--
-- Requiere un rol con permiso de ejecución sobre
-- public.cfdi_normalizacion_reemplazar (service_role / postgres).
--
-- Uso:  psql -v ON_ERROR_STOP=1 -f supabase/tests/cierre_normalizacion.sql
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $prueba$
DECLARE
  v_desp   uuid := '00000000-0000-4000-8000-0000000c1e00';
  v_cli    uuid := '00000000-0000-4000-8000-0000000c1e01';
  v_rfc    uuid := '00000000-0000-4000-8000-0000000c1e02';
  v_pago   uuid := '00000000-0000-4000-8000-0000000c1e03';
  v_fact   uuid := '00000000-0000-4000-8000-0000000c1e04';
  v_owner  uuid;
  v_uuid_f text := 'AAAAAAAA-1111-4111-8111-AAAAAAAAAAAA';
  n int; v text; fallo boolean := false;
BEGIN
  SELECT owner_user_id INTO v_owner FROM public.despachos
   WHERE owner_user_id IS NOT NULL ORDER BY created_at LIMIT 1;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'No hay usuarios para anclar el despacho de prueba'; END IF;

  INSERT INTO public.despachos (id, nombre, owner_user_id, estado)
  VALUES (v_desp, '__test_cierre__', v_owner, 'trial');
  INSERT INTO public.clientes (id, despacho_id, user_id, razon_social, rfc)
  VALUES (v_cli, v_desp, v_owner, '__test_cliente__', 'AAA010101AAA');
  INSERT INTO public.rfcs (id, despacho_id, cliente_id, rfc, tipo_persona)
  VALUES (v_rfc, v_desp, v_cli, 'AAA010101AAA', 'moral');

  INSERT INTO public.cfdi_xml (id, despacho_id, cliente_id, rfc_id, uuid, tipo_cfdi, rfc_emisor, rfc_receptor,
                               fecha, total, archivo_hash, estatus_sat, estatus_sat_check_at)
  VALUES (v_fact, v_desp, v_cli, v_rfc, v_uuid_f, 'I', 'AAA010101AAA', 'BBB020202BBB',
          '2026-07-31T23:59:59-06:00', 1160, 'hash-factura-test', 'vigente', now()),
         (v_pago, v_desp, v_cli, v_rfc, 'BBBBBBBB-2222-4222-8222-BBBBBBBBBBBB', 'P', 'AAA010101AAA', 'BBB020202BBB',
          '2026-07-31T23:59:59-06:00', 0, 'hash-pago-test', 'vigente', now());

  -- ── 1. Normalización completa ──────────────────────────────────────────────
  PERFORM public.cfdi_normalizacion_reemplazar(v_pago, jsonb_build_object(
    'conceptos', jsonb_build_array(jsonb_build_object('numero',1,'clave_prod_serv','84111506','descripcion','Pago','cantidad',1,'valor_unitario',0,'importe',0)),
    'impuestos', jsonb_build_array(jsonb_build_object('nivel','concepto','concepto_numero',1,'tipo','traslado','impuesto','002','impuesto_nombre','IVA','base',1000,'tipo_factor','Tasa','tasa_cuota',0.16,'importe',160)),
    'relaciones', jsonb_build_array(jsonb_build_object('uuid_relacionado',v_uuid_f,'tipo_relacion','pago')),
    'pagos', jsonb_build_array(jsonb_build_object(
      'numero_pago',1,'fecha_pago','2026-07-31T12:00:00-06:00','forma_pago_p','03','moneda_p','MXN','tipo_cambio_p',1,'monto',1160,'num_operacion','OP-1',
      'documentos', jsonb_build_array(jsonb_build_object('id_documento',v_uuid_f,'num_parcialidad',1,'imp_saldo_ant',1160,'imp_pagado',1160,'imp_saldo_insoluto',0,'objeto_imp_dr','02')),
      'impuestos', jsonb_build_array(
        jsonb_build_object('documento_indice',0,'ambito','DR','tipo','traslado','impuesto','002','base',1000,'tipo_factor','Tasa','tasa_cuota',0.16,'importe',160),
        jsonb_build_object('documento_indice',null,'ambito','P','tipo','traslado','impuesto','002','base',1000,'tipo_factor','Tasa','tasa_cuota',0.16,'importe',160))
    )),
    'cabecera', jsonb_build_object('guardar_xml',true,'xml_raw','<cfdi/>','detalle_reconstruible',true,
      'normalizacion_version','test','periodo','2026-07','direccion','emitido','clase_documental','pago',
      'estado_relacion','completo','estado_procesamiento','listo','motivos','[]'::jsonb),
    'reabrir_periodo', false));

  SELECT count(*) INTO n FROM public.cfdi_conceptos WHERE cfdi_id = v_pago;
  IF n <> 1 THEN RAISE EXCEPTION 'FALLA 1: conceptos esperados 1, obtenidos %', n; END IF;
  SELECT count(*) INTO n FROM public.cfdi_impuestos WHERE cfdi_id = v_pago;
  IF n <> 1 THEN RAISE EXCEPTION 'FALLA 1: impuestos esperados 1, obtenidos %', n; END IF;
  SELECT count(*) INTO n FROM public.cfdi_relaciones WHERE cfdi_id = v_pago;
  IF n <> 1 THEN RAISE EXCEPTION 'FALLA 1: relaciones esperadas 1, obtenidas %', n; END IF;
  SELECT count(*) INTO n FROM public.cfdi_pagos WHERE cfdi_id = v_pago;
  IF n <> 1 THEN RAISE EXCEPTION 'FALLA 1: pagos esperados 1, obtenidos %', n; END IF;
  SELECT count(*) INTO n FROM public.cfdi_pago_documentos WHERE cfdi_id = v_pago AND cfdi_padre_id = v_fact;
  IF n <> 1 THEN RAISE EXCEPTION 'FALLA 1: el documento relacionado no quedó ligado a su factura padre'; END IF;
  SELECT count(*) INTO n FROM public.cfdi_pago_impuestos pi JOIN public.cfdi_pagos p ON p.id = pi.pago_id
   WHERE p.cfdi_id = v_pago;
  IF n <> 2 THEN RAISE EXCEPTION 'FALLA 1: impuestos del pago esperados 2, obtenidos %', n; END IF;
  SELECT count(*) INTO n FROM public.cfdi_pago_impuestos pi JOIN public.cfdi_pagos p ON p.id = pi.pago_id
   WHERE p.cfdi_id = v_pago AND pi.ambito = 'DR' AND pi.documento_id IS NOT NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'FALLA 1: el impuesto de ámbito DR no quedó ligado a su documento'; END IF;
  RAISE NOTICE 'OK 1 · cadena completa persistida en una sola transacción';

  -- ── 2. Estatus SAT preservado al renormalizar ──────────────────────────────
  PERFORM public.cfdi_normalizacion_reemplazar(v_pago, jsonb_build_object(
    'cabecera', jsonb_build_object('guardar_xml',true,'xml_raw','<cfdi/>','detalle_reconstruible',true,
      'normalizacion_version','test-2','periodo','2026-07','direccion','emitido','clase_documental','pago',
      'estado_relacion','completo','estado_procesamiento','listo','motivos','[]'::jsonb)));
  SELECT estatus_sat INTO v FROM public.cfdi_xml WHERE id = v_pago;
  IF v IS DISTINCT FROM 'vigente' THEN RAISE EXCEPTION 'FALLA 2: el reproceso borró el estatus SAT (%)', v; END IF;
  SELECT count(*) INTO n FROM public.cfdi_xml WHERE id = v_pago AND estatus_sat_check_at IS NOT NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'FALLA 2: se perdió la evidencia de consulta al SAT'; END IF;
  RAISE NOTICE 'OK 2 · estatus SAT y su evidencia conservados tras renormalizar';

  -- ── 3. Atomicidad: una inserción inválida revierte TODO el detalle nuevo ───
  BEGIN
    PERFORM public.cfdi_normalizacion_reemplazar(v_pago, jsonb_build_object(
      'conceptos', jsonb_build_array(jsonb_build_object('numero',1,'descripcion','__concepto_de_transaccion_fallida__','importe',1)),
      'pagos', jsonb_build_array(jsonb_build_object('numero_pago','no-es-un-numero')),
      'cabecera', jsonb_build_object('guardar_xml',true,'xml_raw','<cfdi/>','detalle_reconstruible',true,
        'normalizacion_version','test-3','periodo','2026-07','direccion','emitido','clase_documental','pago',
        'estado_relacion','completo','estado_procesamiento','listo','motivos','[]'::jsonb)));
  EXCEPTION WHEN OTHERS THEN
    fallo := true;
  END;
  IF NOT fallo THEN RAISE EXCEPTION 'FALLA 3: la carga inválida no produjo error'; END IF;
  SELECT count(*) INTO n FROM public.cfdi_conceptos
   WHERE cfdi_id = v_pago AND descripcion = '__concepto_de_transaccion_fallida__';
  IF n <> 0 THEN RAISE EXCEPTION 'FALLA 3: quedaron % concepto(s) de una transacción fallida', n; END IF;
  SELECT normalizacion_version INTO v FROM public.cfdi_xml WHERE id = v_pago;
  IF v <> 'test-2' THEN RAISE EXCEPTION 'FALLA 3: la cabecera avanzó pese al error (%)', v; END IF;
  RAISE NOTICE 'OK 3 · transacción fallida revertida por completo (rollback verificado)';

  -- ── 4. Reapertura automática del periodo ───────────────────────────────────
  INSERT INTO public.cierre_periodos (despacho_id, cliente_id, periodo, etapa_documental, declarada_at, corte_at, direcciones)
  VALUES (v_desp, v_cli, '2026-07', 'lista', now(), now(), '["emitidos","recibidos"]'::jsonb);

  PERFORM public.cfdi_normalizacion_reemplazar(v_pago, jsonb_build_object(
    'cabecera', jsonb_build_object('guardar_xml',true,'xml_raw','<cfdi/>','detalle_reconstruible',true,
      'normalizacion_version','test-4','periodo','2026-07','direccion','emitido','clase_documental','pago',
      'estado_relacion','completo','estado_procesamiento','listo','motivos','[]'::jsonb),
    'reabrir_periodo', false));
  SELECT etapa_documental INTO v FROM public.cierre_periodos WHERE cliente_id = v_cli AND periodo = '2026-07';
  IF v <> 'lista' THEN RAISE EXCEPTION 'FALLA 4: un reproceso reabrió el periodo'; END IF;

  PERFORM public.cfdi_normalizacion_reemplazar(v_fact, jsonb_build_object(
    'cabecera', jsonb_build_object('guardar_xml',true,'xml_raw','<cfdi/>','detalle_reconstruible',true,
      'normalizacion_version','test-4','periodo','2026-07','direccion','emitido','clase_documental','ingreso',
      'estado_relacion','no_aplica','estado_procesamiento','listo','motivos','[]'::jsonb),
    'reabrir_periodo', true));
  SELECT etapa_documental INTO v FROM public.cierre_periodos WHERE cliente_id = v_cli AND periodo = '2026-07';
  IF v <> 'en_proceso' THEN RAISE EXCEPTION 'FALLA 4: el periodo no se reabrió con el comprobante nuevo (%)', v; END IF;
  SELECT count(*) INTO n FROM public.cierre_periodos
   WHERE cliente_id = v_cli AND periodo = '2026-07' AND declarada_at IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'FALLA 4: la reapertura no limpió la declaración previa'; END IF;
  RAISE NOTICE 'OK 4 · reapertura automática correcta y sin reapertura en reproceso';

  RAISE NOTICE 'TODAS LAS PRUEBAS DE PERSISTENCIA PASARON';
END
$prueba$;

ROLLBACK;
