DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conc_imp_estado_chk'
      AND conrelid = 'public.conciliacion_importaciones'::regclass
  ) THEN
    ALTER TABLE public.conciliacion_importaciones DROP CONSTRAINT conc_imp_estado_chk;
  END IF;

  ALTER TABLE public.conciliacion_importaciones
    ADD CONSTRAINT conc_imp_estado_chk
    CHECK (estado = ANY (ARRAY['procesando'::text, 'completada'::text, 'fallida'::text]));
END $$;