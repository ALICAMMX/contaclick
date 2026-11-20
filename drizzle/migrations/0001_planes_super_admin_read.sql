DROP POLICY IF EXISTS "planes lectura plan del despacho" ON public.planes;
CREATE POLICY "planes lectura plan del despacho"
  ON public.planes FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.despachos d
       WHERE d.plan_id = planes.id
         AND (d.owner_user_id = auth.uid() OR public.is_member_of(d.id))
    )
  );