DROP POLICY IF EXISTS "sat select" ON public.sat_credenciales;
DROP POLICY IF EXISTS "sat insert" ON public.sat_credenciales;
DROP POLICY IF EXISTS "sat update" ON public.sat_credenciales;

CREATE POLICY "sat select admin" ON public.sat_credenciales
  FOR SELECT USING (has_role('despacho'::app_role, despacho_id));

CREATE POLICY "sat insert admin" ON public.sat_credenciales
  FOR INSERT WITH CHECK (has_role('despacho'::app_role, despacho_id));

CREATE POLICY "sat update admin" ON public.sat_credenciales
  FOR UPDATE USING (has_role('despacho'::app_role, despacho_id))
  WITH CHECK (has_role('despacho'::app_role, despacho_id));