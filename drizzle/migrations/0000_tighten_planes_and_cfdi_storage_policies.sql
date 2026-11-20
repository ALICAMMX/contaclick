DROP POLICY IF EXISTS "planes lectura todos" ON public.planes;
CREATE POLICY "planes lectura plan del despacho"
  ON public.planes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.despachos d
       WHERE d.plan_id = planes.id
         AND (d.owner_user_id = auth.uid() OR public.is_member_of(d.id))
    )
  );

DROP POLICY IF EXISTS "cfdi_originales_sin_acceso_publico" ON storage.objects;