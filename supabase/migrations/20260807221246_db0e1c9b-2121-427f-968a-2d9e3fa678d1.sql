-- =====================================================================
-- Descarga Masiva SAT — arquitectura de proveedores (sat_directo | pac)
-- Migración ADITIVA y REVERSIBLE: no borra ni reescribe datos existentes.
-- Reversión: ver docs/fixes-log.md (sección "Reversión SAT directo").
-- =====================================================================

-- 1) Proveedor activo por expediente + clasificación posterior a la descarga.
ALTER TABLE public.sat_sync_config
  ADD COLUMN IF NOT EXISTS proveedor text NOT NULL DEFAULT 'sat_directo',
  ADD COLUMN IF NOT EXISTS clasificar_nomina boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS clasificar_pagos boolean NOT NULL DEFAULT true;

ALTER TABLE public.sat_sync_config
  DROP CONSTRAINT IF EXISTS sat_sync_config_proveedor_chk;
ALTER TABLE public.sat_sync_config
  ADD CONSTRAINT sat_sync_config_proveedor_chk CHECK (proveedor IN ('sat_directo', 'pac'));

-- Traducción de la configuración anterior (sin borrar las columnas viejas):
--   nomina  -> clasificar_nomina  (ya no es una solicitud SAT independiente)
--   pagos   -> clasificar_pagos   (ya no es una solicitud SAT independiente)
--   retenciones -> queda tal cual, pero el motor la ignora: "Pendiente de implementación"
UPDATE public.sat_sync_config
   SET clasificar_nomina = COALESCE(nomina, true),
       clasificar_pagos  = COALESCE(pagos, true)
 WHERE clasificar_nomina IS DISTINCT FROM COALESCE(nomina, true)
    OR clasificar_pagos  IS DISTINCT FROM COALESCE(pagos, true);

-- 2) Máquina de estados explícita + idempotencia por corrida.
ALTER TABLE public.sat_sync_runs
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'preparando',
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS cobertura text NOT NULL DEFAULT 'total',
  ADD COLUMN IF NOT EXISTS advertencia text,
  ADD COLUMN IF NOT EXISTS rechazados integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paquetes_procesados integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultima_consulta_at timestamptz;

ALTER TABLE public.sat_sync_runs
  DROP CONSTRAINT IF EXISTS sat_sync_runs_estado_chk;
ALTER TABLE public.sat_sync_runs
  ADD CONSTRAINT sat_sync_runs_estado_chk CHECK (estado IN (
    'preparando','solicitando','esperando_sat','descargando','ingiriendo',
    'recalculando','completada','parcial','error','vencida'
  ));

ALTER TABLE public.sat_sync_runs
  DROP CONSTRAINT IF EXISTS sat_sync_runs_cobertura_chk;
ALTER TABLE public.sat_sync_runs
  ADD CONSTRAINT sat_sync_runs_cobertura_chk CHECK (cobertura IN ('total','parcial','nula'));

-- Backfill del estado nuevo desde el estatus histórico (no destructivo).
UPDATE public.sat_sync_runs
   SET estado = CASE
         WHEN estatus = 'exitoso'  THEN 'completada'
         WHEN estatus = 'parcial'  THEN 'parcial'
         WHEN estatus = 'error'    THEN 'error'
         WHEN estatus = 'en_curso' THEN 'esperando_sat'
         ELSE 'preparando'
       END
 WHERE estado = 'preparando' AND estatus IS NOT NULL;

-- Una sola corrida ACTIVA por llave de idempotencia
-- (proveedor + expediente + dirección + tipo + rango).
CREATE UNIQUE INDEX IF NOT EXISTS sat_sync_runs_idem_activa_uidx
  ON public.sat_sync_runs (idempotency_key)
  WHERE idempotency_key IS NOT NULL
    AND estado IN ('preparando','solicitando','esperando_sat','descargando','ingiriendo','recalculando');

CREATE INDEX IF NOT EXISTS sat_sync_runs_estado_idx
  ON public.sat_sync_runs (estado, iniciado_at DESC);

-- 3) Consentimiento explícito de uso de la e.firma + versión de bóveda.
ALTER TABLE public.sat_credenciales
  ADD COLUMN IF NOT EXISTS consentimiento_at timestamptz,
  ADD COLUMN IF NOT EXISTS consentimiento_user_id uuid,
  ADD COLUMN IF NOT EXISTS consentimiento_version text,
  ADD COLUMN IF NOT EXISTS vault_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS vault_key_id text;