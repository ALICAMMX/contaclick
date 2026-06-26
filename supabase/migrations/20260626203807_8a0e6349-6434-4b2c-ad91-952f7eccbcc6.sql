ALTER TABLE public.obligaciones_fiscales
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE;

UPDATE public.obligaciones_fiscales o
   SET cliente_id = r.cliente_id
  FROM public.rfcs r
 WHERE o.rfc_id = r.id AND o.cliente_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_oblig_cliente ON public.obligaciones_fiscales(cliente_id);