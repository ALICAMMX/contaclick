-- Candado #7: prevenir duplicados accidentales en tareas, obligaciones_fiscales y tramites
-- Se usan índices únicos parciales (case-insensitive en el título/clave) para que pegar la misma
-- lista dos veces no genere registros duplicados. NULLs se normalizan con COALESCE para que
-- Postgres los trate como iguales.

CREATE UNIQUE INDEX IF NOT EXISTS tareas_unique_titulo_idx
  ON public.tareas (
    despacho_id,
    COALESCE(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(titulo)),
    COALESCE(due_date, '1900-01-01'::date)
  );

CREATE UNIQUE INDEX IF NOT EXISTS obligaciones_unique_idx
  ON public.obligaciones_fiscales (
    rfc_id,
    lower(btrim(clave)),
    lower(btrim(periodicidad)),
    COALESCE(proximo_vencimiento, '1900-01-01'::date)
  );

CREATE UNIQUE INDEX IF NOT EXISTS tramites_unique_titulo_idx
  ON public.tramites (
    despacho_id,
    COALESCE(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(titulo)),
    COALESCE(fecha_vencimiento, '1900-01-01'::date)
  );