
# Análisis: Chat RAG de Leyes Fiscales Mexicanas

## Resumen
**Es 100% viable e integrable a ContaClick.** El documento propone un chat con IA que responde preguntas fiscales citando el artículo exacto de ley (LISR, LIVA, CFF, IEPS, RMF, etc.) usando RAG + pgvector. Lovable Cloud + Lovable AI Gateway ya nos dan todo lo necesario — no requiere Claude Code ni infraestructura externa.

## Qué ya tenemos en ContaClick (no reinventar)

| Componente del proyecto | Estado en ContaClick |
|---|---|
| Backend (Lovable Cloud = Supabase) | ✅ Ya instalado y operando |
| Autenticación con niveles (equipo vs clientes) | ✅ `user_roles`, `has_role`, portal cliente ya existen |
| Frontend chat con IA | ✅ `HelpBot.tsx`, `bot-ayuda.functions.ts`, `chat.functions.ts` |
| Redactor legal con citas de ley | ✅ `src/lib/legal/redactor.*` (LISR, CFF, LFPCA, RMF 2026) |
| Catálogo de referencias legales | ✅ `src/lib/legal/referencias.ts` |
| Modelos LLM sin API key propia | ✅ Lovable AI Gateway (Gemini, GPT) |

**Lo único que NO tenemos:** la base vectorial (`pgvector`) con el corpus legal indexado por artículo y el pipeline de embeddings + búsqueda semántica.

## Qué falta construir (el delta real)

### Fase A — Infraestructura vectorial (1 migración)
- Habilitar extensión `pgvector` en Lovable Cloud
- Tabla `leyes` (ley, versión vigente, fecha_publicacion_dof, url_fuente)
- Tabla `ley_articulos` (ley_id, numero_articulo, fraccion, texto, capitulo, titulo)
- Tabla `ley_embeddings` (articulo_id, embedding vector(1536), chunk_text, tokens)
- Índice IVFFlat / HNSW sobre embedding
- RLS: lectura pública para artículos "públicos" (RMF, leyes), lectura autenticada para notas internas
- Función SQL `match_articulos(query_embedding, threshold, count)` para búsqueda por similitud

### Fase B — Pipeline de indexación
- Server function `indexarLey` (admin-only): recibe texto limpio de una ley + metadatos, la parte por artículo con regex fiscal mexicana estándar (`Artículo N.-` / `Art. N`), genera embeddings vía Lovable AI Gateway (`text-embedding-3-small` u `openai/text-embedding-3-small`), guarda en lote
- UI en `/app/admin` (solo owner) para subir/actualizar leyes y ver estado del corpus
- Reindexación por ley cuando cambia versión

### Fase C — Chat legal con citas
- Nueva ruta `/app/legal/consulta-ia` (o integrar dentro de `app.legal.index.tsx`)
- Server function `consultarLey`: embedding de la pregunta → `match_articulos` → top-K artículos → prompt al LLM con instrucción estricta de citar textualmente + `[LISR art. 27 fracc. V]`
- Componente de chat reusando patrón de `HelpBot` + `RichMarkdown`
- Panel lateral: artículos citados (colapsables, con link a fuente DOF)

### Fase D — Control de acceso por rol
- `admin/despacho`: acceso total, ve prompts internos, puede indexar
- `contador`: consulta libre, ve citas y notas del despacho
- `cliente_final` (portal): consulta limitada — solo leyes públicas, sin criterios internos, con disclaimer "no constituye asesoría"
- Rate limit por rol usando `rate_limits` que ya existe
- Contabilizar en `uso_eventos` para métricas y límites de plan

### Fase E — Fuentes y mantenimiento
- Job semanal (`workflow-cron`) que verifica DOF por reformas fiscales publicadas
- Marcar artículos como "derogado" / "reformado" con `vigente_desde` / `vigente_hasta` para respuestas históricas
- Registro de auditoría en `audit_logs` de cada consulta con las citas devueltas (defendibilidad)

## Corpus mínimo recomendado para arrancar
CFF, LISR, RLISR, LIVA, RLIVA, LIEPS, LFD, LFPCA, LA (Ley Aduanera), RMF 2026 + Anexos 1-A y 20, criterios normativos SAT, jurisprudencias 2a./J. y 1a./J. clave. ~15,000-25,000 artículos/fragmentos = ~50-100 MB de embeddings.

## Costos y límites técnicos
- Embeddings: ~$0.02 USD por millón de tokens (indexación única) → corpus completo <$5 USD
- Consultas: ~$0.001 USD por pregunta (Lovable AI Gateway con Gemini Flash)
- pgvector en Lovable Cloud: sin costo extra, escala hasta millones de vectores en el plan actual
- Latencia esperada: 800-1500 ms por consulta

## Riesgos y mitigaciones
1. **Alucinaciones legales** → prompt con instrucción "solo cita literal de los fragmentos recuperados; si no hay match, di 'no encontré fundamento'"
2. **Versiones desactualizadas** → columna `vigente_desde/hasta` obligatoria + badge en la UI
3. **Responsabilidad profesional** → disclaimer visible + `audit_logs` de cada respuesta
4. **RMF cambia cada año** → workflow de reindexación anual documentado

## Diferencia vs propuesta original
La propuesta original planteaba construir todo desde cero en Claude Code + Supabase Pro por separado. **En ContaClick ya tienes 70% construido** (auth, roles, portal, chat UI, IA gateway, patrón de server functions, redactor con citas). El trabajo real son ~4-6 días: la migración vectorial, el indexador y la ruta de consulta.

## Recomendación
**Sí, hacerlo — como módulo nativo dentro de `app.legal`**, no como app separada. Se convierte en un diferenciador enorme frente a COI/CONTPAQi (ninguno tiene esto) y complementa directamente el Redactor Legal, el Auditor y el módulo de Defensa que ya existen.

## Siguiente paso propuesto
Si apruebas, arranco por Fase A + B: migración con `pgvector`, tablas, función `match_articulos` y el indexador admin — para poder cargar CFF y LISR primero y probar la calidad de las respuestas antes de invertir en la UI final.
