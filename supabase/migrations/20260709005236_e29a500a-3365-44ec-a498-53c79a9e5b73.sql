
CREATE EXTENSION IF NOT EXISTS vector;

-- Catálogo de ordenamientos
CREATE TABLE public.leyes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clave TEXT NOT NULL UNIQUE, -- ej. 'CFF', 'LISR', 'RMF-2026'
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'ley', -- ley | reglamento | rmf | anexo | criterio | jurisprudencia
  version TEXT,
  fecha_publicacion_dof DATE,
  vigente_desde DATE,
  vigente_hasta DATE,
  url_fuente TEXT,
  publicado BOOLEAN NOT NULL DEFAULT false,
  total_articulos INTEGER NOT NULL DEFAULT 0,
  total_embeddings INTEGER NOT NULL DEFAULT 0,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.leyes TO authenticated;
GRANT ALL ON public.leyes TO service_role;
ALTER TABLE public.leyes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leyes_select_auth" ON public.leyes
  FOR SELECT TO authenticated
  USING (publicado = true OR public.is_super_admin());

CREATE POLICY "leyes_admin_all" ON public.leyes
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE TRIGGER trg_leyes_updated
  BEFORE UPDATE ON public.leyes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Artículos individuales
CREATE TABLE public.ley_articulos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ley_id UUID NOT NULL REFERENCES public.leyes(id) ON DELETE CASCADE,
  numero TEXT NOT NULL, -- '27', '27-A', '2o.', 'Segundo Transitorio'
  fraccion TEXT,        -- 'V', 'V, inciso a)'
  titulo TEXT,          -- capítulo/sección/título
  texto TEXT NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0,
  vigente_desde DATE,
  vigente_hasta DATE,
  derogado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ley_articulos_ley_idx ON public.ley_articulos(ley_id, orden);
CREATE INDEX ley_articulos_numero_idx ON public.ley_articulos(ley_id, numero);

GRANT SELECT ON public.ley_articulos TO authenticated;
GRANT ALL ON public.ley_articulos TO service_role;
ALTER TABLE public.ley_articulos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ley_articulos_select_auth" ON public.ley_articulos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leyes l
      WHERE l.id = ley_articulos.ley_id
        AND (l.publicado = true OR public.is_super_admin())
    )
  );

CREATE POLICY "ley_articulos_admin_all" ON public.ley_articulos
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE TRIGGER trg_ley_articulos_updated
  BEFORE UPDATE ON public.ley_articulos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Embeddings (Gemini embedding-001 = 3072 dims)
CREATE TABLE public.ley_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  articulo_id UUID NOT NULL REFERENCES public.ley_articulos(id) ON DELETE CASCADE,
  ley_id UUID NOT NULL REFERENCES public.leyes(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  chunk_text TEXT NOT NULL,
  embedding vector(3072) NOT NULL,
  model TEXT NOT NULL DEFAULT 'google/gemini-embedding-001',
  tokens INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ley_embeddings_articulo_idx ON public.ley_embeddings(articulo_id);
CREATE INDEX ley_embeddings_ley_idx ON public.ley_embeddings(ley_id);
CREATE INDEX ley_embeddings_hnsw_idx
  ON public.ley_embeddings USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);

GRANT SELECT ON public.ley_embeddings TO authenticated;
GRANT ALL ON public.ley_embeddings TO service_role;
ALTER TABLE public.ley_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ley_embeddings_select_auth" ON public.ley_embeddings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leyes l
      WHERE l.id = ley_embeddings.ley_id
        AND (l.publicado = true OR public.is_super_admin())
    )
  );

CREATE POLICY "ley_embeddings_admin_all" ON public.ley_embeddings
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Función de búsqueda semántica
CREATE OR REPLACE FUNCTION public.match_ley_articulos(
  query_embedding vector(3072),
  match_count INT DEFAULT 8,
  min_similarity FLOAT DEFAULT 0.35,
  filter_ley_claves TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  articulo_id UUID,
  ley_id UUID,
  ley_clave TEXT,
  ley_nombre TEXT,
  numero TEXT,
  fraccion TEXT,
  titulo TEXT,
  texto TEXT,
  chunk_text TEXT,
  similarity FLOAT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id AS articulo_id,
    l.id AS ley_id,
    l.clave AS ley_clave,
    l.nombre AS ley_nombre,
    a.numero,
    a.fraccion,
    a.titulo,
    a.texto,
    e.chunk_text,
    1 - (e.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)) AS similarity
  FROM public.ley_embeddings e
  JOIN public.ley_articulos a ON a.id = e.articulo_id
  JOIN public.leyes l ON l.id = e.ley_id
  WHERE l.publicado = true
    AND a.derogado = false
    AND (filter_ley_claves IS NULL OR l.clave = ANY(filter_ley_claves))
    AND (1 - (e.embedding::halfvec(3072) <=> query_embedding::halfvec(3072))) >= min_similarity
  ORDER BY e.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)
  LIMIT match_count;
$$;
