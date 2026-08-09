-- ============================================================
-- Bloque: Centro de cierre mensual y normalización fiscal CFDI
-- Reversión: ver docs/fixes-log.md (sección REVERSIÓN 2026-08-09)
-- ============================================================

-- 1. cfdi_xml: XML original + clasificación documental
ALTER TABLE public.cfdi_xml
  ADD COLUMN IF NOT EXISTS xml_raw TEXT,
  ADD COLUMN IF NOT EXISTS detalle_reconstruible BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS normalizado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS normalizacion_version TEXT,
  ADD COLUMN IF NOT EXISTS direccion TEXT,
  ADD COLUMN IF NOT EXISTS clase_documental TEXT,
  ADD COLUMN IF NOT EXISTS estado_relacion TEXT,
  ADD COLUMN IF NOT EXISTS estado_procesamiento TEXT,
  ADD COLUMN IF NOT EXISTS motivos JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS periodo TEXT;

CREATE INDEX IF NOT EXISTS cfdi_xml_periodo_idx ON public.cfdi_xml (cliente_id, periodo);
CREATE INDEX IF NOT EXISTS cfdi_xml_estado_proc_idx ON public.cfdi_xml (cliente_id, estado_procesamiento);

-- 2. Idempotencia en tablas hijas existentes
ALTER TABLE public.cfdi_conceptos ADD COLUMN IF NOT EXISTS numero INTEGER;
WITH n AS (
  SELECT id, row_number() OVER (PARTITION BY cfdi_id ORDER BY id) AS rn
  FROM public.cfdi_conceptos WHERE numero IS NULL
)
UPDATE public.cfdi_conceptos c SET numero = n.rn FROM n WHERE n.id = c.id;
DELETE FROM public.cfdi_conceptos a
 USING public.cfdi_conceptos b
 WHERE a.cfdi_id = b.cfdi_id AND a.numero = b.numero AND a.id > b.id;
CREATE UNIQUE INDEX IF NOT EXISTS cfdi_conceptos_unico ON public.cfdi_conceptos (cfdi_id, numero);

DELETE FROM public.cfdi_relaciones a
 USING public.cfdi_relaciones b
 WHERE a.cfdi_id = b.cfdi_id AND upper(a.uuid_relacionado) = upper(b.uuid_relacionado)
   AND coalesce(a.tipo_relacion,'') = coalesce(b.tipo_relacion,'') AND a.id > b.id;
CREATE UNIQUE INDEX IF NOT EXISTS cfdi_relaciones_unico
  ON public.cfdi_relaciones (cfdi_id, upper(uuid_relacionado), coalesce(tipo_relacion,''));

-- 3. Impuestos detallados (concepto y comprobante)
CREATE TABLE IF NOT EXISTS public.cfdi_impuestos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cfdi_id UUID NOT NULL REFERENCES public.cfdi_xml(id) ON DELETE CASCADE,
  nivel TEXT NOT NULL CHECK (nivel IN ('concepto','comprobante')),
  concepto_numero INTEGER,
  tipo TEXT NOT NULL CHECK (tipo IN ('traslado','retencion')),
  impuesto TEXT NOT NULL,
  impuesto_nombre TEXT,
  base NUMERIC,
  tipo_factor TEXT,
  tasa_cuota NUMERIC,
  importe NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cfdi_impuestos_unico ON public.cfdi_impuestos
  (cfdi_id, nivel, coalesce(concepto_numero,0), tipo, impuesto, coalesce(tipo_factor,''), coalesce(tasa_cuota,-1), coalesce(base,-1));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cfdi_impuestos TO authenticated;
GRANT ALL ON public.cfdi_impuestos TO service_role;
ALTER TABLE public.cfdi_impuestos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cfdi_impuestos scope" ON public.cfdi_impuestos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cfdi_xml c WHERE c.id = cfdi_id AND public.is_member_of(c.despacho_id) AND (c.cliente_id IS NULL OR public.has_cliente_access(c.cliente_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.cfdi_xml c WHERE c.id = cfdi_id AND public.is_member_of(c.despacho_id) AND (c.cliente_id IS NULL OR public.has_cliente_access(c.cliente_id))));

-- 4. Complemento de pagos 2.0
CREATE TABLE IF NOT EXISTS public.cfdi_pagos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cfdi_id UUID NOT NULL REFERENCES public.cfdi_xml(id) ON DELETE CASCADE,
  despacho_id UUID NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  numero_pago INTEGER NOT NULL,
  fecha_pago TIMESTAMPTZ,
  forma_pago_p TEXT,
  moneda_p TEXT,
  tipo_cambio_p NUMERIC,
  monto NUMERIC,
  num_operacion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cfdi_pagos_unico ON public.cfdi_pagos (cfdi_id, numero_pago);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cfdi_pagos TO authenticated;
GRANT ALL ON public.cfdi_pagos TO service_role;
ALTER TABLE public.cfdi_pagos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cfdi_pagos scope" ON public.cfdi_pagos FOR ALL TO authenticated
  USING (public.is_member_of(despacho_id) AND public.has_cliente_access(cliente_id))
  WITH CHECK (public.is_member_of(despacho_id) AND public.has_cliente_access(cliente_id));

CREATE TABLE IF NOT EXISTS public.cfdi_pago_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pago_id UUID NOT NULL REFERENCES public.cfdi_pagos(id) ON DELETE CASCADE,
  cfdi_id UUID NOT NULL REFERENCES public.cfdi_xml(id) ON DELETE CASCADE,
  id_documento TEXT NOT NULL,
  serie TEXT,
  folio TEXT,
  moneda_dr TEXT,
  equivalencia_dr NUMERIC,
  num_parcialidad INTEGER,
  imp_saldo_ant NUMERIC,
  imp_pagado NUMERIC,
  imp_saldo_insoluto NUMERIC,
  objeto_imp_dr TEXT,
  cfdi_padre_id UUID REFERENCES public.cfdi_xml(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cfdi_pago_documentos_unico
  ON public.cfdi_pago_documentos (pago_id, upper(id_documento), coalesce(num_parcialidad,0));
CREATE INDEX IF NOT EXISTS cfdi_pago_documentos_uuid_idx ON public.cfdi_pago_documentos (upper(id_documento));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cfdi_pago_documentos TO authenticated;
GRANT ALL ON public.cfdi_pago_documentos TO service_role;
ALTER TABLE public.cfdi_pago_documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cfdi_pago_documentos scope" ON public.cfdi_pago_documentos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cfdi_pagos p WHERE p.id = pago_id AND public.is_member_of(p.despacho_id) AND public.has_cliente_access(p.cliente_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.cfdi_pagos p WHERE p.id = pago_id AND public.is_member_of(p.despacho_id) AND public.has_cliente_access(p.cliente_id)));

CREATE TABLE IF NOT EXISTS public.cfdi_pago_impuestos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pago_id UUID NOT NULL REFERENCES public.cfdi_pagos(id) ON DELETE CASCADE,
  documento_id UUID REFERENCES public.cfdi_pago_documentos(id) ON DELETE CASCADE,
  ambito TEXT NOT NULL CHECK (ambito IN ('P','DR')),
  tipo TEXT NOT NULL CHECK (tipo IN ('traslado','retencion')),
  impuesto TEXT NOT NULL,
  base NUMERIC,
  tipo_factor TEXT,
  tasa_cuota NUMERIC,
  importe NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cfdi_pago_impuestos_unico ON public.cfdi_pago_impuestos
  (pago_id, coalesce(documento_id,'00000000-0000-0000-0000-000000000000'::uuid), ambito, tipo, impuesto, coalesce(tipo_factor,''), coalesce(tasa_cuota,-1), coalesce(base,-1));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cfdi_pago_impuestos TO authenticated;
GRANT ALL ON public.cfdi_pago_impuestos TO service_role;
ALTER TABLE public.cfdi_pago_impuestos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cfdi_pago_impuestos scope" ON public.cfdi_pago_impuestos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cfdi_pagos p WHERE p.id = pago_id AND public.is_member_of(p.despacho_id) AND public.has_cliente_access(p.cliente_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.cfdi_pagos p WHERE p.id = pago_id AND public.is_member_of(p.despacho_id) AND public.has_cliente_access(p.cliente_id)));

-- 5. Estado de la etapa documental por periodo
CREATE TABLE IF NOT EXISTS public.cierre_periodos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id UUID NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  periodo TEXT NOT NULL,
  etapa_documental TEXT NOT NULL DEFAULT 'en_proceso' CHECK (etapa_documental IN ('en_proceso','lista')),
  corte_at TIMESTAMPTZ,
  direcciones JSONB NOT NULL DEFAULT '[]'::jsonb,
  ultima_revision_at TIMESTAMPTZ,
  declarada_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  declarada_at TIMESTAMPTZ,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cierre_periodos_unico ON public.cierre_periodos (cliente_id, periodo);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cierre_periodos TO authenticated;
GRANT ALL ON public.cierre_periodos TO service_role;
ALTER TABLE public.cierre_periodos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cierre_periodos scope" ON public.cierre_periodos FOR ALL TO authenticated
  USING (public.is_member_of(despacho_id) AND public.has_cliente_access(cliente_id))
  WITH CHECK (public.is_member_of(despacho_id) AND public.has_cliente_access(cliente_id));

-- 6. Bandeja de excepciones documentales
CREATE TABLE IF NOT EXISTS public.cierre_excepciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id UUID NOT NULL REFERENCES public.despachos(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  periodo TEXT NOT NULL,
  cfdi_id UUID REFERENCES public.cfdi_xml(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  severidad TEXT NOT NULL DEFAULT 'bloqueante' CHECK (severidad IN ('bloqueante','advertencia','informativa')),
  titulo TEXT NOT NULL,
  detalle JSONB NOT NULL DEFAULT '{}'::jsonb,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','resuelta','aceptada')),
  motivo TEXT,
  resuelta_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resuelta_at TIMESTAMPTZ,
  tarea_id UUID REFERENCES public.tareas(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cierre_excepciones_unico
  ON public.cierre_excepciones (cliente_id, periodo, codigo, coalesce(cfdi_id,'00000000-0000-0000-0000-000000000000'::uuid));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cierre_excepciones TO authenticated;
GRANT ALL ON public.cierre_excepciones TO service_role;
ALTER TABLE public.cierre_excepciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cierre_excepciones scope" ON public.cierre_excepciones FOR ALL TO authenticated
  USING (public.is_member_of(despacho_id) AND public.has_cliente_access(cliente_id))
  WITH CHECK (public.is_member_of(despacho_id) AND public.has_cliente_access(cliente_id));

CREATE TABLE IF NOT EXISTS public.cierre_excepcion_bitacora (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  excepcion_id UUID NOT NULL REFERENCES public.cierre_excepciones(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accion TEXT NOT NULL,
  motivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.cierre_excepcion_bitacora TO authenticated;
GRANT ALL ON public.cierre_excepcion_bitacora TO service_role;
ALTER TABLE public.cierre_excepcion_bitacora ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cierre_bitacora scope" ON public.cierre_excepcion_bitacora FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cierre_excepciones e WHERE e.id = excepcion_id AND public.is_member_of(e.despacho_id) AND public.has_cliente_access(e.cliente_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.cierre_excepciones e WHERE e.id = excepcion_id AND public.is_member_of(e.despacho_id) AND public.has_cliente_access(e.cliente_id)));

-- 7. updated_at triggers
CREATE TRIGGER cfdi_pagos_updated_at BEFORE UPDATE ON public.cfdi_pagos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER cierre_periodos_updated_at BEFORE UPDATE ON public.cierre_periodos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER cierre_excepciones_updated_at BEFORE UPDATE ON public.cierre_excepciones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Documentos históricos: sin XML almacenado no puede reconstruirse el detalle
UPDATE public.cfdi_xml SET detalle_reconstruible = false WHERE xml_raw IS NULL;