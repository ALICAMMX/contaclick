-- ── 1. Metadatos canónicos del archivo original ──────────────────────────────
ALTER TABLE public.cfdi_xml
  ADD COLUMN IF NOT EXISTS original_bucket text,
  ADD COLUMN IF NOT EXISTS original_path text,
  ADD COLUMN IF NOT EXISTS original_sha256 text,
  ADD COLUMN IF NOT EXISTS original_bytes bigint,
  ADD COLUMN IF NOT EXISTS original_almacenado_at timestamptz,
  ADD COLUMN IF NOT EXISTS original_estado text NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS original_error text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cfdi_xml_original_estado_chk') THEN
    ALTER TABLE public.cfdi_xml
      ADD CONSTRAINT cfdi_xml_original_estado_chk
      CHECK (original_estado IN ('pendiente','almacenado','verificado','fallido','conflicto_integridad','historico_no_disponible'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS cfdi_xml_original_estado_idx ON public.cfdi_xml (cliente_id, original_estado);
CREATE UNIQUE INDEX IF NOT EXISTS cfdi_xml_original_path_uidx ON public.cfdi_xml (original_path) WHERE original_path IS NOT NULL;

COMMENT ON COLUMN public.cfdi_xml.original_estado IS
  'Estado del XML original: pendiente | almacenado | verificado | fallido | conflicto_integridad | historico_no_disponible. Sólo "verificado" cuenta como cobertura documental completa.';

-- ── 2. Histórico marcado con honestidad: sin objeto real, sin original ───────
UPDATE public.cfdi_xml
   SET original_estado = 'historico_no_disponible'
 WHERE original_path IS NULL
   AND original_estado = 'pendiente';

-- ── 3. Archivero privado: ninguna política para anon ni authenticated ───────
-- Sin políticas de SELECT/INSERT/UPDATE/DELETE sobre storage.objects para este
-- bucket, ni anon ni un usuario autenticado pueden leer, listar, subir,
-- modificar o borrar, ni inferir la existencia de un objeto. El único acceso
-- es el proceso interno del servidor (service_role, que no pasa por RLS) tras
-- validar sesión, despacho y pertenencia del comprobante al expediente.
DROP POLICY IF EXISTS "cfdi_originales_sin_acceso_publico" ON storage.objects;
CREATE POLICY "cfdi_originales_sin_acceso_publico"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id <> 'cfdi-originales' AND false);