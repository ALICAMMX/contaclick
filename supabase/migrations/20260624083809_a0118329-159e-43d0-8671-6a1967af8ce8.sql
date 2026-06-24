CREATE OR REPLACE FUNCTION public.has_cliente_access(_cliente uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clientes c
    JOIN public.despachos d ON d.id = c.despacho_id
    WHERE c.id = _cliente
      AND public.is_member_of(c.despacho_id)
      AND (
        d.acceso_restringido = false
        OR d.owner_user_id = auth.uid()
        OR public.has_role('despacho'::public.app_role, c.despacho_id)
        OR EXISTS (
          SELECT 1
          FROM public.cliente_asignaciones a
          WHERE a.cliente_id = COALESCE(c.cliente_padre_id, c.id)
            AND a.user_id = auth.uid()
        )
      )
  );
$$;

DROP POLICY IF EXISTS "clientes restrict assigned select" ON public.clientes;
CREATE POLICY "clientes restrict assigned select"
ON public.clientes
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  despacho_id IS NULL
  OR public.has_cliente_access(id)
);

DROP POLICY IF EXISTS "clientes restrict assigned update" ON public.clientes;
CREATE POLICY "clientes restrict assigned update"
ON public.clientes
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  despacho_id IS NULL
  OR public.has_cliente_access(id)
)
WITH CHECK (
  despacho_id IS NULL
  OR public.has_cliente_access(id)
);

DROP POLICY IF EXISTS "clientes restrict assigned delete" ON public.clientes;
CREATE POLICY "clientes restrict assigned delete"
ON public.clientes
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
  despacho_id IS NULL
  OR public.has_cliente_access(id)
);

DROP POLICY IF EXISTS "cfdi_xml restrict assigned select" ON public.cfdi_xml;
CREATE POLICY "cfdi_xml restrict assigned select"
ON public.cfdi_xml
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  cliente_id IS NULL
  OR public.has_cliente_access(cliente_id)
);

DROP POLICY IF EXISTS "cfdi_xml restrict assigned update" ON public.cfdi_xml;
CREATE POLICY "cfdi_xml restrict assigned update"
ON public.cfdi_xml
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  cliente_id IS NULL
  OR public.has_cliente_access(cliente_id)
)
WITH CHECK (
  cliente_id IS NULL
  OR public.has_cliente_access(cliente_id)
);

DROP POLICY IF EXISTS "cfdi_xml restrict assigned delete" ON public.cfdi_xml;
CREATE POLICY "cfdi_xml restrict assigned delete"
ON public.cfdi_xml
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
  cliente_id IS NULL
  OR public.has_cliente_access(cliente_id)
);

DROP POLICY IF EXISTS "rfcs restrict assigned select" ON public.rfcs;
CREATE POLICY "rfcs restrict assigned select"
ON public.rfcs
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  cliente_id IS NULL
  OR public.has_cliente_access(cliente_id)
);

DROP POLICY IF EXISTS "rfcs restrict assigned update" ON public.rfcs;
CREATE POLICY "rfcs restrict assigned update"
ON public.rfcs
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  cliente_id IS NULL
  OR public.has_cliente_access(cliente_id)
)
WITH CHECK (
  cliente_id IS NULL
  OR public.has_cliente_access(cliente_id)
);

DROP POLICY IF EXISTS "rfcs restrict assigned delete" ON public.rfcs;
CREATE POLICY "rfcs restrict assigned delete"
ON public.rfcs
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
  cliente_id IS NULL
  OR public.has_cliente_access(cliente_id)
);

DROP POLICY IF EXISTS "obligaciones restrict assigned select" ON public.obligaciones_fiscales;
CREATE POLICY "obligaciones restrict assigned select"
ON public.obligaciones_fiscales
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.rfcs r
    WHERE r.id = obligaciones_fiscales.rfc_id
      AND (r.cliente_id IS NULL OR public.has_cliente_access(r.cliente_id))
  )
);

DROP POLICY IF EXISTS "obligaciones restrict assigned update" ON public.obligaciones_fiscales;
CREATE POLICY "obligaciones restrict assigned update"
ON public.obligaciones_fiscales
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.rfcs r
    WHERE r.id = obligaciones_fiscales.rfc_id
      AND (r.cliente_id IS NULL OR public.has_cliente_access(r.cliente_id))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.rfcs r
    WHERE r.id = obligaciones_fiscales.rfc_id
      AND (r.cliente_id IS NULL OR public.has_cliente_access(r.cliente_id))
  )
);

DROP POLICY IF EXISTS "obligaciones restrict assigned delete" ON public.obligaciones_fiscales;
CREATE POLICY "obligaciones restrict assigned delete"
ON public.obligaciones_fiscales
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.rfcs r
    WHERE r.id = obligaciones_fiscales.rfc_id
      AND (r.cliente_id IS NULL OR public.has_cliente_access(r.cliente_id))
  )
);

DROP POLICY IF EXISTS "semaforo restrict assigned select" ON public.semaforo_fiscal;
CREATE POLICY "semaforo restrict assigned select"
ON public.semaforo_fiscal
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.rfcs r
    WHERE r.id = semaforo_fiscal.rfc_id
      AND (r.cliente_id IS NULL OR public.has_cliente_access(r.cliente_id))
  )
);

DROP POLICY IF EXISTS "semaforo restrict assigned update" ON public.semaforo_fiscal;
CREATE POLICY "semaforo restrict assigned update"
ON public.semaforo_fiscal
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.rfcs r
    WHERE r.id = semaforo_fiscal.rfc_id
      AND (r.cliente_id IS NULL OR public.has_cliente_access(r.cliente_id))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.rfcs r
    WHERE r.id = semaforo_fiscal.rfc_id
      AND (r.cliente_id IS NULL OR public.has_cliente_access(r.cliente_id))
  )
);

DROP POLICY IF EXISTS "semaforo restrict assigned delete" ON public.semaforo_fiscal;
CREATE POLICY "semaforo restrict assigned delete"
ON public.semaforo_fiscal
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
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
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || ' restrict assigned select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (cliente_id IS NULL OR public.has_cliente_access(cliente_id))', t || ' restrict assigned select', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || ' restrict assigned update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (cliente_id IS NULL OR public.has_cliente_access(cliente_id)) WITH CHECK (cliente_id IS NULL OR public.has_cliente_access(cliente_id))', t || ' restrict assigned update', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || ' restrict assigned delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (cliente_id IS NULL OR public.has_cliente_access(cliente_id))', t || ' restrict assigned delete', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "cfdi_conceptos restrict assigned select" ON public.cfdi_conceptos;
CREATE POLICY "cfdi_conceptos restrict assigned select"
ON public.cfdi_conceptos
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.cfdi_xml c
    WHERE c.id = cfdi_conceptos.cfdi_id
      AND (c.cliente_id IS NULL OR public.has_cliente_access(c.cliente_id))
  )
);

DROP POLICY IF EXISTS "cfdi_conceptos restrict assigned delete" ON public.cfdi_conceptos;
CREATE POLICY "cfdi_conceptos restrict assigned delete"
ON public.cfdi_conceptos
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.cfdi_xml c
    WHERE c.id = cfdi_conceptos.cfdi_id
      AND (c.cliente_id IS NULL OR public.has_cliente_access(c.cliente_id))
  )
);

DROP POLICY IF EXISTS "cfdi_relaciones restrict assigned select" ON public.cfdi_relaciones;
CREATE POLICY "cfdi_relaciones restrict assigned select"
ON public.cfdi_relaciones
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.cfdi_xml c
    WHERE c.id = cfdi_relaciones.cfdi_id
      AND (c.cliente_id IS NULL OR public.has_cliente_access(c.cliente_id))
  )
);

DROP POLICY IF EXISTS "cfdi_relaciones restrict assigned delete" ON public.cfdi_relaciones;
CREATE POLICY "cfdi_relaciones restrict assigned delete"
ON public.cfdi_relaciones
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.cfdi_xml c
    WHERE c.id = cfdi_relaciones.cfdi_id
      AND (c.cliente_id IS NULL OR public.has_cliente_access(c.cliente_id))
  )
);