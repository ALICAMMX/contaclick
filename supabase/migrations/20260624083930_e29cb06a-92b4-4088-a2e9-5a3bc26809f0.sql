DROP POLICY IF EXISTS "cfdi_xml restrict assigned insert" ON public.cfdi_xml;
CREATE POLICY "cfdi_xml restrict assigned insert"
ON public.cfdi_xml
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  cliente_id IS NULL
  OR public.has_cliente_access(cliente_id)
);

DROP POLICY IF EXISTS "rfcs restrict assigned insert" ON public.rfcs;
CREATE POLICY "rfcs restrict assigned insert"
ON public.rfcs
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  cliente_id IS NULL
  OR public.has_cliente_access(cliente_id)
);

DROP POLICY IF EXISTS "obligaciones restrict assigned insert" ON public.obligaciones_fiscales;
CREATE POLICY "obligaciones restrict assigned insert"
ON public.obligaciones_fiscales
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.rfcs r
    WHERE r.id = obligaciones_fiscales.rfc_id
      AND (r.cliente_id IS NULL OR public.has_cliente_access(r.cliente_id))
  )
);

DROP POLICY IF EXISTS "semaforo restrict assigned insert" ON public.semaforo_fiscal;
CREATE POLICY "semaforo restrict assigned insert"
ON public.semaforo_fiscal
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.rfcs r
    WHERE r.id = semaforo_fiscal.rfc_id
      AND (r.cliente_id IS NULL OR public.has_cliente_access(r.cliente_id))
  )
);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'alertas',
    'conciliaciones',
    'cuentas_bancarias',
    'cxc',
    'cxp',
    'defensas',
    'ia_historial',
    'mensajes',
    'movimientos_bancarios',
    'reportes',
    'sat_credenciales',
    'tareas',
    'tool_runs',
    'tramites'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || ' restrict assigned insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (cliente_id IS NULL OR public.has_cliente_access(cliente_id))', t || ' restrict assigned insert', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "cfdi_conceptos restrict assigned insert" ON public.cfdi_conceptos;
CREATE POLICY "cfdi_conceptos restrict assigned insert"
ON public.cfdi_conceptos
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.cfdi_xml c
    WHERE c.id = cfdi_conceptos.cfdi_id
      AND (c.cliente_id IS NULL OR public.has_cliente_access(c.cliente_id))
  )
);

DROP POLICY IF EXISTS "cfdi_relaciones restrict assigned insert" ON public.cfdi_relaciones;
CREATE POLICY "cfdi_relaciones restrict assigned insert"
ON public.cfdi_relaciones
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.cfdi_xml c
    WHERE c.id = cfdi_relaciones.cfdi_id
      AND (c.cliente_id IS NULL OR public.has_cliente_access(c.cliente_id))
  )
);