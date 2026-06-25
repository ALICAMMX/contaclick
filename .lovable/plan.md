# Conciliación SAT vs Contabilidad

Módulo nuevo que cruza **CFDI SAT ↔ Contabilidad (pólizas) ↔ Banco** para detectar inconsistencias fiscales y operativas. Se integra con todo lo que ya existe (SAT Sync, Conciliación Bancaria, Tareas, Salud Fiscal, Workflows, Riesgo SAT).

---

## 1. Modelo de datos (migración)

Hoy tenemos `cfdi_xml`, `movimientos_bancarios`, `conciliaciones` (banco↔CFDI). **No existe capa contable**, así que la creamos mínima y suficiente:

- **`polizas`** — registro contable por cliente: `tipo` (ingreso/egreso/diario), `fecha`, `concepto`, `monto`, `cuenta`, `referencia`, `uuid_cfdi` (opcional), `movimiento_bancario_id` (opcional), `origen` (manual/import/workflow).
- **`conciliacion_integral_runs`** — corridas del motor por cliente+periodo, con KPIs cacheados y `score_consistencia`.
- **`conciliacion_incidencias`** — una fila por hallazgo:
  - `tipo`: `ingreso_sat_sin_poliza`, `gasto_sat_sin_poliza`, `pago_banco_sin_cfdi`, `cfdi_sin_movimiento`, `diferencia_monto`, `cfdi_duplicado`, `cfdi_cancelado_no_ajustado`
  - `gravedad`: `critica|media|baja`
  - `monto`, `fecha`, refs a `cfdi_id`, `poliza_id`, `movimiento_id`
  - `estatus`: `abierta|revisada|escalada|resuelta|falso_positivo`
  - `explicacion_ia` (text), `impacto_isr`, `impacto_iva`, `recomendacion`
  - hash único `(cliente_id, tipo, ref_hash)` para no duplicar
- **`conciliacion_score_historico`** — snapshots para timeline.

RLS por `cliente_id` reusando `has_cliente_access`. GRANTs estándar.

## 2. Motor de conciliación (`src/lib/conciliacion-integral/engine.functions.ts`)

`runConciliacionIntegral({ cliente_id, desde, hasta })` — server fn protegida:

1. Carga CFDI emitidos/recibidos del periodo (ya existe en `cfdi_xml`).
2. Carga pólizas y movimientos bancarios.
3. Pasadas de matching (en este orden, marcando lo usado):
   - **UUID exacto** CFDI↔póliza
   - **Monto + fecha (±3d) + RFC** CFDI↔póliza
   - **Monto + referencia** póliza↔movimiento
   - **Conciliaciones banco↔CFDI ya existentes** se respetan
4. Genera incidencias por residuos + reglas de duplicado/cancelado.
5. Calcula **impacto fiscal**: ISR estimado = ingreso omitido × tasa efectiva del cliente; IVA = monto × 0.16 según tipo.
6. Calcula **score 0-100**: `100 − pesos(criticas*8 + medias*3 + bajas*1) − %diferencia_montos`.
7. Upsert idempotente (hash) → no duplica entre corridas.
8. Inserta snapshot en `conciliacion_score_historico` y registra `uso_eventos`.

Hooks de recálculo:
- al terminar `runSyncNow` (SAT)
- al guardar conciliación bancaria
- al crear/editar póliza
Implementados como llamadas async no bloqueantes desde esas server fns existentes.

## 3. UI — `src/routes/app.conciliacion-integral.tsx`

Layout con tabs:

- **Dashboard**: KPIs (movs conciliados, diferencias, ingresos omitidos, gastos sin registrar, CFDI sin pago, pagos sin CFDI, monto observado, score), gráfica de tendencia del score, top clientes con diferencias.
- **Incidencias**: tabla con filtros (cliente, periodo, tipo, gravedad, estatus), semáforo 🔴🟠🟡, acciones rápidas (crear tarea → reusa `tareas.functions`, marcar revisado, escalar, solicitar documento → reusa `mensajes`, generar observación).
- **Comparador detallado** (drawer al click): 3 columnas SAT | Contabilidad | Banco lado a lado con diffs resaltados + panel IA con explicación en lenguaje simple (Lovable AI `google/gemini-3-flash-preview`, server-side, gated por `check_rate_limit` y `incrementar_uso_ia`).
- **Timeline**: histórico de corridas e incidencias del cliente.

## 4. Integración con Expediente

Nueva pestaña **"Conciliación Integral"** en `src/routes/app.clientes.$id.tsx`: resumen, score con tendencia, lista compacta de incidencias abiertas, botón "Correr ahora".

## 5. Pólizas — carga mínima

Para que el motor tenga insumo contable sin pedir un ERP completo:
- Importador CSV/XLSX de pólizas en la pestaña del expediente (columnas: fecha, tipo, concepto, monto, cuenta, referencia, uuid opcional).
- Captura manual rápida.
- Endpoint para que workflows generen pólizas automáticamente desde CFDI conciliados (opcional, fase 2).

## 6. Navegación, cuotas, seguridad

- Item de menú en `AppLayout` → `/app/conciliacion-integral`.
- Cuota: cuenta como 1 evento IA por explicación generada; el motor mismo no consume IA (solo SQL/JS).
- RLS estricta; server fns con `requireSupabaseAuth`; nada de service role en client-reachable code.

---

## Detalles técnicos

- Server fns en `src/lib/conciliacion-integral/*.functions.ts` (client-safe path).
- IA en `*.server.ts` helper, llamada solo desde handler.
- React Query con `ensureQueryData` en loader del `_authenticated`.
- Reuso de tokens de diseño existentes (semáforo, tablas, cards) — sin colores hardcoded.
- Migración única con CREATE TABLE + GRANT + RLS + POLICY por tabla nueva.
- Bitácora en `mem://fixes/log.md` al cierre.

¿Avanzo con la migración y el motor en esta primera entrega, dejando el importador de pólizas y la pestaña del expediente para una segunda iteración del mismo plan?
