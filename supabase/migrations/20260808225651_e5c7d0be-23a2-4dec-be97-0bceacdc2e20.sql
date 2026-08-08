CREATE UNIQUE INDEX IF NOT EXISTS cfdi_xml_despacho_uuid_norm_uidx
  ON public.cfdi_xml (despacho_id, upper(btrim(uuid)));