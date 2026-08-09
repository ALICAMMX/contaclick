-- La unicidad previa impedía registrar una REAPARICIÓN (ocurrencia 2, 3, ...).
DROP INDEX IF EXISTS public.cierre_excepciones_unico;

-- Unicidad por ocurrencia: el historial completo cabe, sin duplicar la misma toma.
CREATE UNIQUE INDEX cierre_excepciones_unico
  ON public.cierre_excepciones (
    cliente_id, periodo, codigo,
    COALESCE(cfdi_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(ocurrencia, 1)
  );

-- Sólo una ocurrencia VIVA a la vez por documento y motivo: evita bandejas dobles.
CREATE UNIQUE INDEX cierre_excepciones_una_viva
  ON public.cierre_excepciones (
    cliente_id, periodo, codigo,
    COALESCE(cfdi_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE estado IN ('pendiente', 'aceptada', 'resuelta');