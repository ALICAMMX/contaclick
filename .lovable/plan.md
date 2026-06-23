# Control de uso: RFC e IA por plan

Objetivo: medir, limitar y notificar el consumo de **RFC activos** y **solicitudes/tokens de IA** según el plan del despacho (Starter, Profesional, Despacho, Enterprise), con avisos visibles en el dashboard del usuario.

---

## 1. Modelo de datos (Lovable Cloud)

Una migración con GRANTs + RLS:

**`planes`** (catálogo, ya existe — lo extendemos):
- `id`, `code` (`starter|pro|despacho|enterprise`), `nombre`
- `limite_rfc` int
- `limite_ia_requests` int (mensual)
- `limite_ia_tokens` bigint (mensual)
- `limite_storage_mb` int

**`suscripciones`** (ya existe): añadimos `plan_code`, `periodo_inicio`, `periodo_fin`.

**`uso_periodo`** (nueva, una fila por despacho × periodo mensual):
- `despacho_id`, `periodo` (`YYYY-MM`)
- `ia_requests`, `ia_tokens`, `ia_costo_credits`
- `rfc_activos` (snapshot calculado)
- `updated_at`

**`uso_eventos`** (auditoría fina, append-only):
- `despacho_id`, `tipo` (`ia_request|rfc_add|tool_run`), `tool`, `tokens_in`, `tokens_out`, `model`, `created_at`, `metadata jsonb`

**`notificaciones_uso`** (para el bell del dashboard):
- `despacho_id`, `tipo` (`warn_80|warn_100|rfc_limit`), `recurso` (`rfc|ia_requests|ia_tokens`), `periodo`, `leida_at`, `created_at`
- Único por `(despacho_id, tipo, recurso, periodo)` para no duplicar avisos.

RLS: todo scoped por `is_member_of(despacho_id)`. `uso_eventos` solo `INSERT` desde server functions.

---

## 2. Enforcement (server-side)

Helper `assertWithinLimits(despachoId, recurso)` en `src/lib/usage/limits.functions.ts`:
1. Lee plan vigente de `suscripciones`.
2. Lee `uso_periodo` del mes actual (lo crea si no existe).
3. Compara contra el límite del plan.
4. Si está al 80% → inserta `notificaciones_uso` tipo `warn_80` (idempotente).
5. Si está al 100% → inserta `warn_100` y **lanza error 402-like** (`LIMIT_EXCEEDED`).

Se llama:
- **IA**: dentro de `sendChat` y de cada herramienta IA antes del `fetch` al gateway. Tras la respuesta, `recordIaUsage(despachoId, {requests:1, tokens_in, tokens_out, model})` actualiza `uso_periodo` + `uso_eventos`.
- **RFC**: en `clientes.functions.ts` (crear/activar RFC) → cuenta `rfcs` activos; si supera `limite_rfc`, devuelve error legible.

Errores se traducen a toast: *"Alcanzaste el límite de tu plan Starter (200 IA / mes). Mejora tu plan o espera al ciclo siguiente."*

---

## 3. UI — Dashboard

**`src/components/UsageMeters.tsx`** (card en `/app` y `/app/configuracion`):
- 3 barras: RFC activos, Solicitudes IA, Tokens IA.
- Color: verde <70%, ámbar 70-95%, rojo ≥95%.
- Texto: `12 / 25 RFC`, `840 / 1,500 solicitudes IA`, reset en `30 de jun`.
- CTA "Mejorar plan" → `/precios`.

**`NotificationsBell`** (ya existe): añadimos fuente `notificaciones_uso` con icono ⚠ y link a `/app/configuracion#uso`.

**`/app/configuracion` → tab "Plan y uso"**:
- Plan actual + tarjeta de uso del periodo.
- Histórico últimos 6 meses (tabla `uso_periodo`).
- Botón "Comprar paquete adicional" (placeholder hasta integrar Stripe).

---

## 4. Notificaciones

Dos canales:
- **In-app (siempre)**: `NotificationsBell` lee `notificaciones_uso` no leídas.
- **Email (opcional, fase 2)**: trigger SQL → server fn que envía email via Lovable AI / Brevo connector cuando se inserta un `warn_80` o `warn_100`.

Reglas:
- Un aviso por umbral por mes (idempotente vía índice único).
- Al iniciar nuevo periodo (cron diario `/api/public/cron/usage-rollover`), se resetea el `uso_periodo` y se limpian flags.

---

## 5. Cron de cierre/rollover

Server route `src/routes/api/public/cron/usage-rollover.ts` (verifica header `x-cron-secret`):
- Cada 1 del mes a las 00:05 (configurable en `pg_cron` o llamado desde un scheduler externo).
- Cierra periodo anterior, crea fila nueva con contadores en 0.
- Recalcula `rfc_activos` por despacho.

---

## 6. Aspectos técnicos

- Todo el conteo de IA se hace **server-side** dentro de los `createServerFn` que llaman al gateway, leyendo `usage` del response (`json.usage.prompt_tokens`, `completion_tokens`).
- Para evitar race conditions: `UPDATE uso_periodo SET ia_requests = ia_requests + 1 RETURNING ia_requests` (incremento atómico).
- Cliente NUNCA decide si tiene crédito — solo muestra los medidores.
- Compatible con la futura versión desktop: el ejecutable también consultará `uso_periodo` vía la misma server fn (la IA sigue siendo en la nube según definimos).

---

## Entregables por fase

**Fase A (1 sesión):** migración + helpers `assertWithinLimits` / `recordIaUsage` + integración en `sendChat` y en creación de RFC.

**Fase B (1 sesión):** `UsageMeters`, tab "Plan y uso", notificaciones en bell.

**Fase C (futuro):** emails, cron de rollover, paquetes adicionales con Stripe.

---

¿Procedo con **Fase A** ahora?
