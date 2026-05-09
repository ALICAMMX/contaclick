-- tool_runs: historial de ejecuciones por herramienta y cliente
CREATE TABLE public.tool_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  tool_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  input JSONB,
  output JSONB,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_tool_runs_user ON public.tool_runs(user_id, created_at DESC);
CREATE INDEX idx_tool_runs_cliente ON public.tool_runs(cliente_id, created_at DESC);
CREATE INDEX idx_tool_runs_tool ON public.tool_runs(tool_key);

ALTER TABLE public.tool_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own tool_runs" ON public.tool_runs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own tool_runs" ON public.tool_runs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own tool_runs" ON public.tool_runs
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own tool_runs" ON public.tool_runs
  FOR DELETE USING (auth.uid() = user_id);

-- Add helpful columns to clientes if missing
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS telefono TEXT,
  ADD COLUMN IF NOT EXISTS notas TEXT;