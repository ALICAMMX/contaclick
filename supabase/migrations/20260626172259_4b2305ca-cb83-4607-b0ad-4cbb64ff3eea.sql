
CREATE TABLE public.bot_ayuda_threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Nueva conversación',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bot_ayuda_threads_user_idx ON public.bot_ayuda_threads(user_id, updated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_ayuda_threads TO authenticated;
GRANT ALL ON public.bot_ayuda_threads TO service_role;
ALTER TABLE public.bot_ayuda_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own threads select" ON public.bot_ayuda_threads FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own threads insert" ON public.bot_ayuda_threads FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own threads update" ON public.bot_ayuda_threads FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own threads delete" ON public.bot_ayuda_threads FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER bot_ayuda_threads_updated BEFORE UPDATE ON public.bot_ayuda_threads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.bot_ayuda_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.bot_ayuda_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bot_ayuda_messages_thread_idx ON public.bot_ayuda_messages(thread_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_ayuda_messages TO authenticated;
GRANT ALL ON public.bot_ayuda_messages TO service_role;
ALTER TABLE public.bot_ayuda_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bot msgs select" ON public.bot_ayuda_messages FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own bot msgs insert" ON public.bot_ayuda_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own bot msgs delete" ON public.bot_ayuda_messages FOR DELETE TO authenticated USING (auth.uid() = user_id);
