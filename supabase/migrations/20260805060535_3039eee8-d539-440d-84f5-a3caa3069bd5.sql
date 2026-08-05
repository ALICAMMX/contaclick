CREATE TABLE public.conti_telemetria (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  despacho_id UUID,
  thread_id UUID,
  modo TEXT NOT NULL CHECK (modo IN ('guia','consulta','expediente')),
  con_expediente BOOLEAN NOT NULL DEFAULT false,
  evidencia TEXT NOT NULL,
  saneada BOOLEAN NOT NULL DEFAULT false,
  derivo_calculo BOOLEAN NOT NULL DEFAULT false,
  modelo TEXT,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  latencia_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.conti_telemetria TO authenticated;
GRANT ALL ON public.conti_telemetria TO service_role;
ALTER TABLE public.conti_telemetria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conti_telemetria_select_own" ON public.conti_telemetria
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "conti_telemetria_insert_own" ON public.conti_telemetria
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE INDEX conti_telemetria_user_created_idx ON public.conti_telemetria (user_id, created_at DESC);

CREATE TABLE public.conti_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  thread_id UUID,
  modo TEXT NOT NULL CHECK (modo IN ('guia','consulta','expediente')),
  util BOOLEAN NOT NULL,
  motivo TEXT,
  comentario TEXT,
  respuesta TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.conti_feedback TO authenticated;
GRANT ALL ON public.conti_feedback TO service_role;
ALTER TABLE public.conti_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conti_feedback_select_own" ON public.conti_feedback
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "conti_feedback_insert_own" ON public.conti_feedback
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE INDEX conti_feedback_user_created_idx ON public.conti_feedback (user_id, created_at DESC);