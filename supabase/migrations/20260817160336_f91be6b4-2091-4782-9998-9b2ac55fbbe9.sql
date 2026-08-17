-- ═══════════════════════════════════════════════════════════════════════════
-- BLOQUE 2 · Pólizas canónicas: catálogo del contador y reglas por concepto
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── Normalización de código contable (conserva ceros: sólo quita separadores)
CREATE OR REPLACE FUNCTION public.cc_normalizar_codigo(_c text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT upper(regexp_replace(coalesce(_c,''), '[[:space:]._-]', '', 'g'))
$$;

-- ── A. Catálogo de cuentas: campos canónicos
ALTER TABLE public.catalogo_cuentas
  ADD COLUMN IF NOT EXISTS codigo_padre    text,
  ADD COLUMN IF NOT EXISTS nivel           integer,
  ADD COLUMN IF NOT EXISTS moneda          text NOT NULL DEFAULT 'MXN',
  ADD COLUMN IF NOT EXISTS fuente          text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS external_id     text,
  ADD COLUMN IF NOT EXISTS import_hash     text,
  ADD COLUMN IF NOT EXISTS actualizada_por uuid,
  ADD COLUMN IF NOT EXISTS actualizada_at  timestamptz;

ALTER TABLE public.catalogo_cuentas
  ADD COLUMN IF NOT EXISTS codigo_normalizado text
  GENERATED ALWAYS AS (public.cc_normalizar_codigo(codigo)) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS catalogo_cuentas_cliente_codnorm_uk
  ON public.catalogo_cuentas (cliente_id, codigo_normalizado);

CREATE INDEX IF NOT EXISTS catalogo_cuentas_padre_ix
  ON public.catalogo_cuentas (cliente_id, codigo_padre);

-- ── Bitácora de importaciones de catálogo
CREATE TABLE IF NOT EXISTS public.catalogo_importaciones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id   uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  despacho_id  uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  modo         text NOT NULL CHECK (modo IN ('agregar','agregar_actualizar')),
  huella       text NOT NULL,
  filas        integer NOT NULL DEFAULT 0,
  altas        integer NOT NULL DEFAULT 0,
  actualizadas integer NOT NULL DEFAULT 0,
  omitidas     integer NOT NULL DEFAULT 0,
  errores      integer NOT NULL DEFAULT 0,
  reporte      jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor        uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.catalogo_importaciones TO authenticated;
GRANT ALL    ON public.catalogo_importaciones TO service_role;
ALTER TABLE public.catalogo_importaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS catalogo_importaciones_select ON public.catalogo_importaciones;
CREATE POLICY catalogo_importaciones_select ON public.catalogo_importaciones
  FOR SELECT TO authenticated USING (public.has_cliente_access(cliente_id));

-- ── C. Reglas contables por concepto (fuente única)
CREATE TABLE IF NOT EXISTS public.reglas_concepto (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id          uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  despacho_id         uuid NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  clave_prod_serv     text NOT NULL,
  rfc_contraparte     text,
  patron_descripcion  text,
  cuenta              text NOT NULL,
  tratamiento_iva     text NOT NULL CHECK (tratamiento_iva IN
                        ('trasladado','acreditable','exento','tasa_cero','no_objeto','sin_iva')),
  tipo_operacion      text NOT NULL CHECK (tipo_operacion IN ('ingreso','gasto','activo','otro')),
  vigencia_desde      date NOT NULL,
  vigencia_hasta      date,
  origen              text NOT NULL CHECK (origen IN ('contador','regla','sugerencia')),
  version             integer NOT NULL DEFAULT 1,
  actor               uuid,
  motivo              text,
  activa              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (vigencia_hasta IS NULL OR vigencia_hasta >= vigencia_desde)
);

ALTER TABLE public.reglas_concepto
  DROP CONSTRAINT IF EXISTS reglas_concepto_sin_traslape;
ALTER TABLE public.reglas_concepto
  ADD CONSTRAINT reglas_concepto_sin_traslape EXCLUDE USING gist (
    cliente_id WITH =,
    clave_prod_serv WITH =,
    (coalesce(rfc_contraparte,'*')) WITH =,
    (coalesce(patron_descripcion,'*')) WITH =,
    daterange(vigencia_desde, coalesce(vigencia_hasta, 'infinity'::date), '[]') WITH &&
  ) WHERE (activa AND origen <> 'sugerencia');

CREATE INDEX IF NOT EXISTS reglas_concepto_lookup_ix
  ON public.reglas_concepto (cliente_id, clave_prod_serv, activa);

GRANT SELECT ON public.reglas_concepto TO authenticated;
GRANT ALL    ON public.reglas_concepto TO service_role;
ALTER TABLE public.reglas_concepto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reglas_concepto_select ON public.reglas_concepto;
CREATE POLICY reglas_concepto_select ON public.reglas_concepto
  FOR SELECT TO authenticated USING (public.has_cliente_access(cliente_id));

-- Historial versionado de reglas (append-only)
CREATE TABLE IF NOT EXISTS public.reglas_concepto_historial (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regla_id    uuid NOT NULL,
  cliente_id  uuid NOT NULL,
  version     integer NOT NULL,
  accion      text NOT NULL CHECK (accion IN ('creada','actualizada','desactivada')),
  snapshot    jsonb NOT NULL,
  motivo      text,
  actor       uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.reglas_concepto_historial TO authenticated;
GRANT ALL    ON public.reglas_concepto_historial TO service_role;
ALTER TABLE public.reglas_concepto_historial ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reglas_concepto_historial_select ON public.reglas_concepto_historial;
CREATE POLICY reglas_concepto_historial_select ON public.reglas_concepto_historial
  FOR SELECT TO authenticated USING (public.has_cliente_access(cliente_id));

CREATE OR REPLACE FUNCTION public.reglas_concepto_historial_inmutable()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'El historial de reglas por concepto es inmutable.';
END; $$;
DROP TRIGGER IF EXISTS reglas_concepto_historial_inmutable_trg ON public.reglas_concepto_historial;
CREATE TRIGGER reglas_concepto_historial_inmutable_trg
  BEFORE UPDATE OR DELETE ON public.reglas_concepto_historial
  FOR EACH ROW EXECUTE FUNCTION public.reglas_concepto_historial_inmutable();

-- ── Sin escritura directa: catálogo y reglas
DROP POLICY IF EXISTS catalogo_cuentas_insert ON public.catalogo_cuentas;
DROP POLICY IF EXISTS catalogo_cuentas_update ON public.catalogo_cuentas;
DROP POLICY IF EXISTS catalogo_cuentas_delete ON public.catalogo_cuentas;
REVOKE INSERT, UPDATE, DELETE ON public.catalogo_cuentas FROM authenticated;
GRANT SELECT ON public.catalogo_cuentas TO authenticated;
GRANT ALL ON public.catalogo_cuentas TO service_role;

DROP POLICY IF EXISTS reglas_contables_insert ON public.reglas_contables;
DROP POLICY IF EXISTS reglas_contables_update ON public.reglas_contables;
DROP POLICY IF EXISTS reglas_contables_delete ON public.reglas_contables;
REVOKE INSERT, UPDATE, DELETE ON public.reglas_contables FROM authenticated;
GRANT SELECT ON public.reglas_contables TO authenticated;
GRANT ALL ON public.reglas_contables TO service_role;

-- ── metadata.asientos: sólo lectura histórica, prohibida su escritura
CREATE OR REPLACE FUNCTION public.polizas_bloquear_asientos_legado()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.metadata ? 'asientos' THEN
      RAISE EXCEPTION 'metadata.asientos es un formato legado de sólo lectura: use poliza_renglones.';
    END IF;
  ELSIF (NEW.metadata -> 'asientos') IS DISTINCT FROM (OLD.metadata -> 'asientos') THEN
    RAISE EXCEPTION 'metadata.asientos es un formato legado de sólo lectura: use poliza_renglones.';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS polizas_bloquear_asientos_legado_trg ON public.polizas;
CREATE TRIGGER polizas_bloquear_asientos_legado_trg
  BEFORE INSERT OR UPDATE ON public.polizas
  FOR EACH ROW EXECUTE FUNCTION public.polizas_bloquear_asientos_legado();

-- ═══════════════════════════════════════════════════════════════════════════
-- RPC: importación atómica del catálogo
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.catalogo_importar_lote(
  _cliente_id uuid, _modo text, _cuentas jsonb, _huella text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_desp uuid; v_errores jsonb := '[]'::jsonb; v_r jsonb; v_i int := 0;
  v_cod text; v_norm text; v_nom text; v_nat text; v_padre text; v_padre_norm text;
  v_altas int := 0; v_act int := 0; v_omit int := 0; v_filas int;
  v_vistos text[] := ARRAY[]::text[]; v_todos text[]; v_cur text; v_depth int;
  v_map jsonb := '{}'::jsonb; v_existente public.catalogo_cuentas; v_hash text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.'; END IF;
  v_desp := public.cierre_autorizar_expediente(_cliente_id);
  IF _modo NOT IN ('agregar','agregar_actualizar') THEN
    RAISE EXCEPTION 'Modo de importación inválido: %', _modo;
  END IF;
  IF jsonb_typeof(_cuentas) <> 'array' OR jsonb_array_length(_cuentas) = 0 THEN
    RAISE EXCEPTION 'No hay filas que importar.';
  END IF;
  v_filas := jsonb_array_length(_cuentas);
  IF v_filas > 5000 THEN RAISE EXCEPTION 'El archivo excede 5000 filas.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_cliente_id::text||':catalogo', 0));

  -- ── Fase 1: validación completa (nada se escribe todavía)
  FOR v_r IN SELECT * FROM jsonb_array_elements(_cuentas) LOOP
    v_i := v_i + 1;
    v_cod   := btrim(coalesce(v_r->>'codigo',''));
    v_nom   := btrim(coalesce(v_r->>'nombre',''));
    v_nat   := lower(btrim(coalesce(v_r->>'naturaleza','')));
    v_padre := nullif(btrim(coalesce(v_r->>'codigo_padre','')),'');
    v_norm  := public.cc_normalizar_codigo(v_cod);

    IF v_cod = '' THEN
      v_errores := v_errores || jsonb_build_object('fila',v_i,'codigo',v_cod,'error','Código de cuenta vacío.');
    ELSIF v_norm = ANY(v_vistos) THEN
      v_errores := v_errores || jsonb_build_object('fila',v_i,'codigo',v_cod,'error','Código duplicado dentro del archivo.');
    END IF;
    IF v_nom = '' THEN
      v_errores := v_errores || jsonb_build_object('fila',v_i,'codigo',v_cod,'error','Nombre vacío.');
    END IF;
    IF v_nat NOT IN ('deudora','acreedora') THEN
      v_errores := v_errores || jsonb_build_object('fila',v_i,'codigo',v_cod,'error','Naturaleza inválida (use deudora o acreedora).');
    END IF;
    IF v_cod ~ '^[=+@]' OR v_nom ~ '^[=+@]' OR coalesce(v_padre,'') ~ '^[=+@]' THEN
      v_errores := v_errores || jsonb_build_object('fila',v_i,'codigo',v_cod,'error','Contenido peligroso: la celda comienza con = + o @.');
    END IF;
    IF v_padre IS NOT NULL AND public.cc_normalizar_codigo(v_padre) = v_norm THEN
      v_errores := v_errores || jsonb_build_object('fila',v_i,'codigo',v_cod,'error','La cuenta no puede ser su propia cuenta padre.');
    END IF;

    IF v_cod <> '' THEN
      v_vistos := v_vistos || v_norm;
      v_map := v_map || jsonb_build_object(v_norm,
        CASE WHEN v_padre IS NULL THEN '' ELSE public.cc_normalizar_codigo(v_padre) END);
    END IF;
  END LOOP;

  -- padres inexistentes (archivo + base)
  v_i := 0;
  FOR v_r IN SELECT * FROM jsonb_array_elements(_cuentas) LOOP
    v_i := v_i + 1;
    v_padre := nullif(btrim(coalesce(v_r->>'codigo_padre','')),'');
    CONTINUE WHEN v_padre IS NULL;
    v_padre_norm := public.cc_normalizar_codigo(v_padre);
    IF NOT (v_map ? v_padre_norm) AND NOT EXISTS (
      SELECT 1 FROM public.catalogo_cuentas cc
       WHERE cc.cliente_id = _cliente_id AND cc.codigo_normalizado = v_padre_norm) THEN
      v_errores := v_errores || jsonb_build_object('fila',v_i,'codigo',v_r->>'codigo',
        'error','La cuenta padre '||v_padre||' no existe en el archivo ni en el catálogo.');
    END IF;
  END LOOP;

  -- ciclos jerárquicos dentro del archivo
  v_todos := ARRAY(SELECT jsonb_object_keys(v_map));
  FOREACH v_cur IN ARRAY v_todos LOOP
    DECLARE v_walk text := v_cur;
    BEGIN
      v_depth := 0;
      LOOP
        v_walk := coalesce(v_map->>v_walk, '');
        EXIT WHEN v_walk = '' OR NOT (v_map ? v_walk);
        v_depth := v_depth + 1;
        IF v_walk = v_cur OR v_depth > 50 THEN
          v_errores := v_errores || jsonb_build_object('codigo',v_cur,'error','Ciclo jerárquico entre cuentas padre.');
          EXIT;
        END IF;
      END LOOP;
    END;
  END LOOP;

  IF jsonb_array_length(v_errores) > 0 THEN
    RETURN jsonb_build_object('guardado', false, 'filas', v_filas, 'altas', 0,
      'actualizadas', 0, 'omitidas', 0, 'errores', v_errores,
      'mensaje','No se guardó ninguna cuenta: corrija los errores señalados.');
  END IF;

  -- ── Fase 2: escritura atómica
  v_i := 0;
  FOR v_r IN SELECT * FROM jsonb_array_elements(_cuentas) LOOP
    v_i := v_i + 1;
    v_cod   := btrim(v_r->>'codigo');
    v_norm  := public.cc_normalizar_codigo(v_cod);
    v_nom   := btrim(v_r->>'nombre');
    v_nat   := lower(btrim(v_r->>'naturaleza'));
    v_padre := nullif(btrim(coalesce(v_r->>'codigo_padre','')),'');
    v_hash  := encode(digest(coalesce(_huella,'')||'|'||v_norm||'|'||v_nom||'|'||v_nat||
                 '|'||coalesce(v_padre,'')||'|'||coalesce(v_r->>'agrupador_sat','')||
                 '|'||coalesce(v_r->>'moneda','MXN'), 'sha256'), 'hex');

    SELECT * INTO v_existente FROM public.catalogo_cuentas
      WHERE cliente_id = _cliente_id AND codigo_normalizado = v_norm;

    IF NOT FOUND THEN
      INSERT INTO public.catalogo_cuentas (id, cliente_id, despacho_id, codigo, nombre, naturaleza,
        tipo_sat, codigo_padre, nivel, moneda, fuente, external_id, import_hash, activa,
        created_by, actualizada_por, actualizada_at)
      VALUES (gen_random_uuid(), _cliente_id, v_desp, v_cod, v_nom, v_nat,
        nullif(btrim(coalesce(v_r->>'agrupador_sat','')),''), v_padre,
        nullif(v_r->>'nivel','')::int, coalesce(nullif(btrim(coalesce(v_r->>'moneda','')),''),'MXN'),
        'importacion', nullif(btrim(coalesce(v_r->>'external_id','')),''), v_hash,
        coalesce((v_r->>'activa')::boolean, true), auth.uid(), auth.uid(), now());
      v_altas := v_altas + 1;
    ELSIF _modo = 'agregar' THEN
      v_omit := v_omit + 1;
    ELSIF v_existente.import_hash IS NOT DISTINCT FROM v_hash
       AND v_existente.nombre = v_nom AND v_existente.naturaleza = v_nat THEN
      v_omit := v_omit + 1;  -- reimportación idéntica: idempotente
    ELSE
      IF (v_existente.naturaleza <> v_nat OR coalesce(v_existente.codigo_padre,'') <> coalesce(v_padre,''))
         AND EXISTS (SELECT 1 FROM public.poliza_renglones pr
                     JOIN public.polizas p ON p.id = pr.poliza_id
                     WHERE pr.cliente_id = _cliente_id AND p.estado = 'aprobada'
                       AND public.cc_normalizar_codigo(pr.cuenta) = v_norm) THEN
        RAISE EXCEPTION 'La cuenta % se usa en pólizas aprobadas: no puede cambiar su naturaleza ni su jerarquía.', v_cod;
      END IF;
      UPDATE public.catalogo_cuentas SET
        codigo = v_cod, nombre = v_nom, naturaleza = v_nat,
        tipo_sat = coalesce(nullif(btrim(coalesce(v_r->>'agrupador_sat','')),''), tipo_sat),
        codigo_padre = v_padre, nivel = coalesce(nullif(v_r->>'nivel','')::int, nivel),
        moneda = coalesce(nullif(btrim(coalesce(v_r->>'moneda','')),''), moneda),
        external_id = coalesce(nullif(btrim(coalesce(v_r->>'external_id','')),''), external_id),
        fuente = 'importacion', import_hash = v_hash,
        activa = coalesce((v_r->>'activa')::boolean, activa),
        actualizada_por = auth.uid(), actualizada_at = now(), updated_at = now()
      WHERE id = v_existente.id;
      v_act := v_act + 1;
    END IF;
  END LOOP;

  INSERT INTO public.catalogo_importaciones (cliente_id, despacho_id, modo, huella, filas,
    altas, actualizadas, omitidas, errores, reporte, actor)
  VALUES (_cliente_id, v_desp, _modo, coalesce(_huella,''), v_filas, v_altas, v_act, v_omit, 0,
    jsonb_build_object('altas',v_altas,'actualizadas',v_act,'omitidas',v_omit), auth.uid());

  RETURN jsonb_build_object('guardado', true, 'filas', v_filas, 'altas', v_altas,
    'actualizadas', v_act, 'omitidas', v_omit, 'errores', '[]'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.catalogo_importar_lote(uuid,text,jsonb,text) FROM public;
GRANT EXECUTE ON FUNCTION public.catalogo_importar_lote(uuid,text,jsonb,text) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- RPC: alta/edición unitaria y baja lógica de una cuenta
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.catalogo_cuenta_guardar(
  _cliente_id uuid, _codigo text, _nombre text, _naturaleza text,
  _agrupador_sat text DEFAULT NULL, _codigo_padre text DEFAULT NULL,
  _moneda text DEFAULT 'MXN', _activa boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_desp uuid; v_norm text; v_id uuid; v_ex public.catalogo_cuentas;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.'; END IF;
  v_desp := public.cierre_autorizar_expediente(_cliente_id);
  IF btrim(coalesce(_codigo,'')) = '' THEN RAISE EXCEPTION 'El código de cuenta es obligatorio.'; END IF;
  IF btrim(coalesce(_nombre,'')) = '' THEN RAISE EXCEPTION 'El nombre de cuenta es obligatorio.'; END IF;
  IF lower(coalesce(_naturaleza,'')) NOT IN ('deudora','acreedora') THEN
    RAISE EXCEPTION 'Naturaleza inválida: %', _naturaleza; END IF;
  v_norm := public.cc_normalizar_codigo(_codigo);

  SELECT * INTO v_ex FROM public.catalogo_cuentas
   WHERE cliente_id = _cliente_id AND codigo_normalizado = v_norm;
  IF FOUND THEN
    IF (v_ex.naturaleza <> lower(_naturaleza) OR coalesce(v_ex.codigo_padre,'') <> coalesce(_codigo_padre,''))
       AND EXISTS (SELECT 1 FROM public.poliza_renglones pr JOIN public.polizas p ON p.id = pr.poliza_id
                   WHERE pr.cliente_id = _cliente_id AND p.estado='aprobada'
                     AND public.cc_normalizar_codigo(pr.cuenta) = v_norm) THEN
      RAISE EXCEPTION 'La cuenta % se usa en pólizas aprobadas: no puede cambiar su naturaleza ni su jerarquía.', _codigo;
    END IF;
    UPDATE public.catalogo_cuentas SET codigo = btrim(_codigo), nombre = btrim(_nombre),
      naturaleza = lower(_naturaleza), tipo_sat = nullif(btrim(coalesce(_agrupador_sat,'')),''),
      codigo_padre = nullif(btrim(coalesce(_codigo_padre,'')),''),
      moneda = coalesce(nullif(btrim(coalesce(_moneda,'')),''),'MXN'),
      activa = coalesce(_activa,true), actualizada_por = auth.uid(), actualizada_at = now(),
      updated_at = now()
     WHERE id = v_ex.id RETURNING id INTO v_id;
    RETURN jsonb_build_object('id', v_id, 'accion','actualizada');
  END IF;

  INSERT INTO public.catalogo_cuentas (cliente_id, despacho_id, codigo, nombre, naturaleza,
    tipo_sat, codigo_padre, moneda, fuente, activa, created_by, actualizada_por, actualizada_at)
  VALUES (_cliente_id, v_desp, btrim(_codigo), btrim(_nombre), lower(_naturaleza),
    nullif(btrim(coalesce(_agrupador_sat,'')),''), nullif(btrim(coalesce(_codigo_padre,'')),''),
    coalesce(nullif(btrim(coalesce(_moneda,'')),''),'MXN'), 'manual', coalesce(_activa,true),
    auth.uid(), auth.uid(), now())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'accion','creada');
END; $$;
REVOKE ALL ON FUNCTION public.catalogo_cuenta_guardar(uuid,text,text,text,text,text,text,boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.catalogo_cuenta_guardar(uuid,text,text,text,text,text,text,boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.catalogo_cuenta_desactivar(_cliente_id uuid, _codigo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_norm text; v_n int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.'; END IF;
  PERFORM public.cierre_autorizar_expediente(_cliente_id);
  v_norm := public.cc_normalizar_codigo(_codigo);
  UPDATE public.catalogo_cuentas SET activa = false, actualizada_por = auth.uid(),
    actualizada_at = now(), updated_at = now()
   WHERE cliente_id = _cliente_id AND codigo_normalizado = v_norm;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'La cuenta % no existe en el catálogo.', _codigo; END IF;
  RETURN jsonb_build_object('desactivadas', v_n);
END; $$;
REVOKE ALL ON FUNCTION public.catalogo_cuenta_desactivar(uuid,text) FROM public;
GRANT EXECUTE ON FUNCTION public.catalogo_cuenta_desactivar(uuid,text) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- RPC: reglas por concepto — guardar (versionado) y desactivar
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.regla_concepto_guardar(
  _cliente_id uuid, _clave_prod_serv text, _cuenta text, _tratamiento_iva text,
  _tipo_operacion text, _vigencia_desde date, _motivo text,
  _rfc_contraparte text DEFAULT NULL, _patron_descripcion text DEFAULT NULL,
  _vigencia_hasta date DEFAULT NULL, _origen text DEFAULT 'contador')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_desp uuid; v_id uuid; v_prev public.reglas_concepto; v_ver int := 1; v_rfc text; v_pat text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.'; END IF;
  v_desp := public.cierre_autorizar_expediente(_cliente_id);
  IF length(btrim(coalesce(_motivo,''))) < 10 THEN
    RAISE EXCEPTION 'Toda regla exige un motivo humano de al menos 10 caracteres.'; END IF;
  IF btrim(coalesce(_clave_prod_serv,'')) = '' THEN RAISE EXCEPTION 'ClaveProdServ obligatoria.'; END IF;
  IF _origen NOT IN ('contador','regla','sugerencia') THEN RAISE EXCEPTION 'Origen inválido.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.catalogo_cuentas cc WHERE cc.cliente_id = _cliente_id
                  AND cc.codigo_normalizado = public.cc_normalizar_codigo(_cuenta) AND cc.activa) THEN
    RAISE EXCEPTION 'La cuenta % no existe o está inactiva en el catálogo del expediente.', _cuenta;
  END IF;

  v_rfc := nullif(upper(btrim(coalesce(_rfc_contraparte,''))),'');
  v_pat := nullif(lower(btrim(coalesce(_patron_descripcion,''))),'');

  PERFORM pg_advisory_xact_lock(hashtextextended(_cliente_id::text||':regla:'||btrim(_clave_prod_serv), 0));

  SELECT * INTO v_prev FROM public.reglas_concepto
   WHERE cliente_id = _cliente_id AND clave_prod_serv = btrim(_clave_prod_serv)
     AND coalesce(rfc_contraparte,'*') = coalesce(v_rfc,'*')
     AND coalesce(patron_descripcion,'*') = coalesce(v_pat,'*')
     AND activa AND origen <> 'sugerencia'
   ORDER BY vigencia_desde DESC LIMIT 1;

  IF FOUND THEN
    -- cierra la vigencia anterior el día previo y versiona
    IF v_prev.vigencia_desde >= _vigencia_desde THEN
      UPDATE public.reglas_concepto SET activa = false, updated_at = now() WHERE id = v_prev.id;
    ELSE
      UPDATE public.reglas_concepto SET vigencia_hasta = _vigencia_desde - 1, updated_at = now()
       WHERE id = v_prev.id;
    END IF;
    v_ver := v_prev.version + 1;
    INSERT INTO public.reglas_concepto_historial (regla_id, cliente_id, version, accion, snapshot, motivo, actor)
    VALUES (v_prev.id, _cliente_id, v_prev.version, 'actualizada', to_jsonb(v_prev), btrim(_motivo), auth.uid());
  END IF;

  INSERT INTO public.reglas_concepto (cliente_id, despacho_id, clave_prod_serv, rfc_contraparte,
    patron_descripcion, cuenta, tratamiento_iva, tipo_operacion, vigencia_desde, vigencia_hasta,
    origen, version, actor, motivo, activa)
  VALUES (_cliente_id, v_desp, btrim(_clave_prod_serv), v_rfc, v_pat, btrim(_cuenta),
    _tratamiento_iva, _tipo_operacion, _vigencia_desde, _vigencia_hasta, _origen, v_ver,
    auth.uid(), btrim(_motivo), true)
  RETURNING id INTO v_id;

  INSERT INTO public.reglas_concepto_historial (regla_id, cliente_id, version, accion, snapshot, motivo, actor)
  SELECT v_id, _cliente_id, v_ver, 'creada', to_jsonb(r), btrim(_motivo), auth.uid()
    FROM public.reglas_concepto r WHERE r.id = v_id;

  RETURN jsonb_build_object('id', v_id, 'version', v_ver, 'accion', CASE WHEN v_ver = 1 THEN 'creada' ELSE 'versionada' END);
END; $$;
REVOKE ALL ON FUNCTION public.regla_concepto_guardar(uuid,text,text,text,text,date,text,text,text,date,text) FROM public;
GRANT EXECUTE ON FUNCTION public.regla_concepto_guardar(uuid,text,text,text,text,date,text,text,text,date,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.regla_concepto_desactivar(_regla_id uuid, _motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_r public.reglas_concepto;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.'; END IF;
  SELECT * INTO v_r FROM public.reglas_concepto WHERE id = _regla_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Regla inexistente.'; END IF;
  PERFORM public.cierre_autorizar_expediente(v_r.cliente_id);
  IF length(btrim(coalesce(_motivo,''))) < 10 THEN
    RAISE EXCEPTION 'La baja de una regla exige un motivo de al menos 10 caracteres.'; END IF;
  UPDATE public.reglas_concepto SET activa = false, updated_at = now() WHERE id = _regla_id;
  INSERT INTO public.reglas_concepto_historial (regla_id, cliente_id, version, accion, snapshot, motivo, actor)
  VALUES (_regla_id, v_r.cliente_id, v_r.version, 'desactivada', to_jsonb(v_r), btrim(_motivo), auth.uid());
  RETURN jsonb_build_object('id', _regla_id, 'activa', false);
END; $$;
REVOKE ALL ON FUNCTION public.regla_concepto_desactivar(uuid,text) FROM public;
GRANT EXECUTE ON FUNCTION public.regla_concepto_desactivar(uuid,text) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Resolver: cada concepto → exactamente una asignación vigente
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.regla_concepto_resolver(
  _cliente_id uuid, _clave_prod_serv text, _rfc_contraparte text,
  _descripcion text, _fecha date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rfc text; v_desc text; v_n int; v_r public.reglas_concepto; v_nivel int;
BEGIN
  PERFORM public.cierre_autorizar_expediente(_cliente_id);
  v_rfc  := nullif(upper(btrim(coalesce(_rfc_contraparte,''))),'');
  v_desc := lower(btrim(coalesce(_descripcion,'')));

  -- nivel 3: contraparte + patrón · nivel 2: contraparte · nivel 1: general
  FOR v_nivel IN REVERSE 3..1 LOOP
    SELECT count(*) INTO v_n FROM public.reglas_concepto r
     WHERE r.cliente_id = _cliente_id AND r.activa AND r.origen <> 'sugerencia'
       AND r.clave_prod_serv = btrim(_clave_prod_serv)
       AND _fecha >= r.vigencia_desde AND (r.vigencia_hasta IS NULL OR _fecha <= r.vigencia_hasta)
       AND CASE v_nivel
             WHEN 3 THEN r.rfc_contraparte IS NOT DISTINCT FROM v_rfc AND r.patron_descripcion IS NOT NULL AND v_desc LIKE '%'||r.patron_descripcion||'%'
             WHEN 2 THEN r.rfc_contraparte IS NOT DISTINCT FROM v_rfc AND v_rfc IS NOT NULL AND r.patron_descripcion IS NULL
             ELSE r.rfc_contraparte IS NULL AND r.patron_descripcion IS NULL
           END;
    IF v_n = 1 THEN
      SELECT * INTO v_r FROM public.reglas_concepto r
       WHERE r.cliente_id = _cliente_id AND r.activa AND r.origen <> 'sugerencia'
         AND r.clave_prod_serv = btrim(_clave_prod_serv)
         AND _fecha >= r.vigencia_desde AND (r.vigencia_hasta IS NULL OR _fecha <= r.vigencia_hasta)
         AND CASE v_nivel
               WHEN 3 THEN r.rfc_contraparte IS NOT DISTINCT FROM v_rfc AND r.patron_descripcion IS NOT NULL AND v_desc LIKE '%'||r.patron_descripcion||'%'
               WHEN 2 THEN r.rfc_contraparte IS NOT DISTINCT FROM v_rfc AND v_rfc IS NOT NULL AND r.patron_descripcion IS NULL
               ELSE r.rfc_contraparte IS NULL AND r.patron_descripcion IS NULL
             END
       LIMIT 1;
      RETURN jsonb_build_object('estado','resuelta','cuenta',v_r.cuenta,'regla_id',v_r.id,
        'version',v_r.version,'nivel',v_nivel,'tratamiento_iva',v_r.tratamiento_iva,
        'tipo_operacion',v_r.tipo_operacion);
    ELSIF v_n > 1 THEN
      RETURN jsonb_build_object('estado','ambigua','coincidencias',v_n,'nivel',v_nivel,
        'motivo','Hay '||v_n||' reglas vigentes con la misma prioridad para esta clave.');
    END IF;
  END LOOP;

  RETURN jsonb_build_object('estado','sin_regla',
    'motivo','No hay ninguna regla contable vigente para la clave '||btrim(_clave_prod_serv)||'.');
END; $$;
REVOKE ALL ON FUNCTION public.regla_concepto_resolver(uuid,text,text,text,date) FROM public;
GRANT EXECUTE ON FUNCTION public.regla_concepto_resolver(uuid,text,text,text,date) TO authenticated, service_role;