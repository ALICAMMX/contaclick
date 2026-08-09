DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.cfdi_registrar_evidencia_sat(uuid, uuid, text, text) TO sandbox_exec';
  END IF;
END $$;