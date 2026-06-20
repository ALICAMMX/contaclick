CREATE TABLE public.defensas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  conflicto TEXT,
  potencial TEXT,
  estrategia TEXT,
  exito INTEGER DEFAULT 0,
  estatus TEXT NOT NULL DEFAULT 'activa' CHECK (estatus IN ('activa', 'en_proceso', 'resuelta_favorable', 'resuelta_desfavorable', 'archivada')),
  notas TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.defensas TO authenticated;
GRANT ALL ON public.defensas TO service_role;

ALTER TABLE public.defensas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own defensas" ON public.defensas
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_defensas_updated_at
  BEFORE UPDATE ON public.defensas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();