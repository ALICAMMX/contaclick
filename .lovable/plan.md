# Plan: Candados de costo PAC (SW Sapien) — reutilizando el patrón de límites de IA

## Objetivo

Evitar que el costo del PAC se desborde a mitad de año. Antes de cada solicitud al PAC debemos saber: (1) cuánto lleva consumido el despacho en el periodo, (2) cuál es su cuota según su plan, (3) cuánto saldo global tenemos en la cuenta maestra SW. Si algo está fuera de rango, se bloquea con un mensaje claro — exactamente como ya hacemos con `ia_requests` / `ia_tokens`.

No movemos lógica de descarga ni el flujo de conexión SAT. Sólo añadimos las barreras y la telemetría.

---

## 1. Modelo de datos (migración)

### 1.1 Ampliar `uso_periodo`
- Agregar columnas `sat_solicitudes integer NOT NULL DEFAULT 0` y `sat_costo_centavos bigint NOT NULL DEFAULT 0` (centavos MXN).
- Una sola fila por (`despacho_id`, `periodo`) — sigue el patrón existente.

### 1.2 Ampliar `planes.limites` (datos, no esquema)
Agregar dos llaves nuevas al JSON `limites` de cada plan:

| Plan | `sat_solicitudes_mes` | `sat_frecuencia_max` |
|---|---|---|
| Starter (5 RFC) | 600 | `semanal` |
| Profesional (25 RFC) | 3,500 | `diaria` |
| Despacho (100 RFC) | 15,000 | `diaria` |
| Enterprise | -1 (ilimitado) | `diaria` |

Cálculo: ~RFCs × 120 sol/mes (frecuencia diaria, 4 tipos × 30 días) × factor de optimización 0.5 + colchón 20%. Starter queda forzado a frecuencia semanal para mantener margen sano.

### 1.3 Nueva tabla `sat_pac_saldo` (singleton global, solo super-admin)
Columnas: `id` (uuid PK), `proveedor` (text default `sw_sapien`), `saldo_solicitudes integer`, `costo_unitario_centavos integer`, `umbral_aviso integer` (default 1000), `actualizado_at`, `actualizado_por`.
Una sola fila. RLS: SELECT/UPDATE solo para `is_super_admin()`. GRANT sólo a `authenticated` + `service_role`.

### 1.4 Nuevo tipo de alerta
Reutilizamos `alertas.tipo='uso_limite'` con `evidencia.recurso='sat_solicitudes'`. No requiere migración.

---

## 2. Capa de límites (código)

### 2.1 `src/lib/usage/limits.ts`
- Añadir `"sat_solicitudes"` al union `Recurso`.
- `labelRecurso` → "Descargas SAT".
- Extender `getUsoPeriodo` para devolver `sat_solicitudes`.
- `assertWithinLimit('sat_solicitudes', n)` valida contra `limites.sat_solicitudes_mes` y dispara avisos 80% / 100% igual que IA.

### 2.2 Nuevo helper `src/lib/usage/sat-quota.ts`
- `contarSolicitudesPrevistas(config)` → calcula cuántas solicitudes va a generar una corrida según `emitidos/recibidos/nomina/pagos/retenciones` activos × meses en `[fecha_desde, fecha_hasta]`.
- `assertFrecuenciaPermitida(plan, frecuencia)` → bloquea si el plan no permite la frecuencia elegida (ej. Starter pidiendo "diaria").
- `assertSaldoPacDisponible(supabaseAdmin, previstas)` → lee `sat_pac_saldo`, bloquea si `saldo - previstas < umbral_aviso` y emite alerta global.
- `registrarConsumoSat(supabase, despacho, n)` → INCREMENT atómico vía RPC (nueva función `incrementar_uso_sat` espejo de `incrementar_uso_ia`); también descuenta de `sat_pac_saldo` con `supabaseAdmin`.

### 2.3 Integración en `sat-sync.functions.ts` (`runSyncNow`)
Orden estricto antes de tocar el PAC:
1. `assertFrecuenciaPermitida` con la config del expediente.
2. `previstas = contarSolicitudesPrevistas(config)`.
3. `assertWithinLimit('sat_solicitudes', previstas)` (cuota del despacho).
4. `assertSaldoPacDisponible(previstas)` (cuenta maestra SW).
5. Ejecutar corrida.
6. En `finally` exitoso: `registrarConsumoSat(real_descargadas)` con el número real, no el previsto.
7. En error con créditos ya consumidos por SW: registrar igual (el PAC ya cobró).

### 2.4 Integración en `conectarSat`
Al conectar un RFC nuevo, la carga histórica de 12 meses son ~48 solicitudes. Validar con `assertWithinLimit('sat_solicitudes', 48)` y `assertFrecuenciaPermitida` antes de crear el `sat_sync_config`.

---

## 3. UI

### 3.1 Medidor en el panel del despacho (junto a IA y RFCs)
- `src/components/UsageMeters.tsx`: añadir tarjeta "Descargas SAT" con barra (usado / cuota), color verde/ámbar/rojo según 0-79 / 80-99 / 100%.
- Texto secundario: "Frecuencia permitida por tu plan: diaria/semanal".

### 3.2 En `/app/sat-sync` (panel principal)
- Banner superior cuando el despacho está al 80% o más con CTA "Ver planes".
- En la pestaña de configuración del expediente: si el plan no permite "diaria", deshabilitar el radio y mostrar tooltip "Disponible en plan Profesional o superior".

### 3.3 Panel super-admin nuevo: `/app/admin/sat-saldo`
Ruta bajo `_authenticated/`, gateada por `is_super_admin()`. Muestra:
- Saldo actual SW, costo unitario, umbral de aviso.
- Tabla de top-10 despachos por consumo del mes.
- Botón "Registrar recarga" (form: solicitudes compradas + costo total) que actualiza `sat_pac_saldo` y deja registro en `audit_logs`.
- Estimación de días restantes al ritmo actual de consumo.

---

## 4. Alertas y observabilidad

- Reutilizar `alertas` con `tipo='uso_limite'`, `evidencia.recurso='sat_solicitudes'` para 80% y 100% del despacho (índice único parcial existente evita duplicados por periodo+umbral).
- Alerta global nueva `tipo='sat_saldo_bajo'` cuando la cuenta maestra cruza `umbral_aviso`. Visible sólo para super-admin.
- Registrar en `audit_logs` cada `rate_limit_exceeded` SAT y cada recarga manual del saldo.

---

## 5. Detalles técnicos

```text
runSyncNow(expediente)
        │
        ├── assertFrecuenciaPermitida(plan, config.frecuencia)
        ├── previstas = contarSolicitudesPrevistas(config)
        ├── assertWithinLimit('sat_solicitudes', previstas)  ← cuota despacho
        ├── assertSaldoPacDisponible(previstas)              ← cuenta SW global
        │
        ├── llamada al PAC (SW Sapien)
        │
        └── registrarConsumoSat(reales)
                │
                ├── RPC incrementar_uso_sat → uso_periodo
                └── UPDATE sat_pac_saldo (admin)
```

- `incrementar_uso_sat(_despacho, _periodo, _solicitudes, _costo_centavos)` security-definer, valida `is_member_of`, hace UPSERT atómico — copia exacta de `incrementar_uso_ia`.
- El descuento de `sat_pac_saldo` corre con `supabaseAdmin` cargado dinámicamente dentro del handler (regla del import-graph).
- Si SW devuelve "saldo insuficiente" antes que nosotros lo detectemos, capturarlo, marcar `sat_pac_saldo.saldo_solicitudes = 0` y emitir alerta global inmediata.
- El cron horario que ya existe respeta los mismos candados porque entra por `runSyncNow`.
- Modo demo (`SW_USER`/`SW_PASSWORD` ausentes) sigue funcionando: cuenta las solicitudes "simuladas" para que puedas ver el medidor llenarse, pero NO descuenta de `sat_pac_saldo`.

---

## 6. Qué NO incluye este plan

- Auto-recarga del saldo SW (manual por ahora; se evalúa cuando haya más volumen).
- Cobro al cliente final por solicitudes extra (add-on); requiere Stripe/Paddle y lo veremos cuando el módulo de suscripciones esté listo.
- Cambio de PAC / failover a Facturama: queda en backlog.

---

## 7. Orden de implementación

1. Migración: columnas en `uso_periodo`, tabla `sat_pac_saldo`, RPC `incrementar_uso_sat`, UPDATE de `planes.limites`.
2. `src/lib/usage/limits.ts` y nuevo `sat-quota.ts`.
3. Integrar en `runSyncNow` y `conectarSat`.
4. UI: medidor + banner + bloqueo de frecuencia.
5. Panel super-admin `/app/admin/sat-saldo`.
6. Probar end-to-end en modo demo (sin SW real) con un despacho Starter forzando el 100%.
