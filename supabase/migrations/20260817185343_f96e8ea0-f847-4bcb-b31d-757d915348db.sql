DROP POLICY IF EXISTS polizas_update ON public.polizas;
DROP POLICY IF EXISTS polizas_delete ON public.polizas;

CREATE POLICY polizas_update ON public.polizas
  FOR UPDATE TO authenticated
  USING (has_cliente_access(cliente_id) AND estado <> 'aprobada')
  WITH CHECK (has_cliente_access(cliente_id) AND estado <> 'aprobada');

CREATE POLICY polizas_delete ON public.polizas
  FOR DELETE TO authenticated
  USING (has_cliente_access(cliente_id) AND estado <> 'aprobada');