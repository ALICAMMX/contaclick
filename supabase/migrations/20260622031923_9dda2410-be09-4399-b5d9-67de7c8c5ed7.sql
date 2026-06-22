
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS curp text,
  ADD COLUMN IF NOT EXISTS domicilio_fiscal text,
  ADD COLUMN IF NOT EXISTS codigo_postal text,
  ADD COLUMN IF NOT EXISTS tipo_persona text,
  ADD COLUMN IF NOT EXISTS tipo_relacion text NOT NULL DEFAULT 'cliente',
  ADD COLUMN IF NOT EXISTS cliente_padre_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS csf_ultima_emision date;

ALTER TABLE public.clientes
  DROP CONSTRAINT IF EXISTS clientes_tipo_relacion_check;
ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_tipo_relacion_check
  CHECK (tipo_relacion IN ('cliente','proveedor','acreedor'));

ALTER TABLE public.clientes
  DROP CONSTRAINT IF EXISTS clientes_tipo_persona_check;
ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_tipo_persona_check
  CHECK (tipo_persona IS NULL OR tipo_persona IN ('fisica','moral'));

CREATE INDEX IF NOT EXISTS idx_clientes_despacho_rfc ON public.clientes (despacho_id, rfc);
CREATE INDEX IF NOT EXISTS idx_clientes_padre ON public.clientes (cliente_padre_id);
