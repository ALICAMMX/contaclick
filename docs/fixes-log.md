
## 2026-06-27 — Botón "Nuevo expediente" requería doble click
- Síntoma: en `/app/clientes` el primer click sobre "Nuevo expediente" no abría el formulario; sólo el segundo respondía. Regresión visible en el alta del primer cliente.
- Causa probable: el formulario se montaba/desmontaba condicionalmente bajo el botón; combinado con el `hover:-translate-y-0.5` del variant `hero` y la pérdida de foco en re-renders del provider de expediente activo, el primer pointer-up podía caer fuera del target original.
- Corrección: el toggle ahora dispara en `onPointerDown` (responde antes del focus chasing) y `NewClienteForm` queda siempre montado con `hidden={!openForm}`, evitando layout shift y remount al abrir.

## 2026-06-27 — Workflows: pasos fallidos sin detalle visible
- Causa raíz 1: `crear_alerta` insertaba la columna `origen` que no existía en `public.alertas` → "Could not find the 'origen' column".
- Causa raíz 2: `generar_tarea`, `solicitar_documento_cliente` fallaban con "Sin cliente_id" cuando el workflow era de despacho (sin cliente asociado), aunque el trigger fuera legítimo (cron, eventos sin contexto de cliente).
- Causa raíz 3: La pestaña Errores mostraba solo "X pasos fallidos" sin el mensaje real, y la entrada al detalle no era evidente.
- Correcciones:
  - Migración: `ALTER TABLE public.alertas ADD COLUMN IF NOT EXISTS origen TEXT`.
  - Engine: acciones que requieren cliente ahora se marcan como `omitido` (no `fallido`) con motivo explicado cuando no hay cliente en el contexto.
  - Engine: `workflow_runs.error_message` ahora guarda el error específico del primer paso fallido (ej. `generar_tarea: …`).
  - UI `/app/workflows` pestaña Errores: muestra el mensaje real en rojo, añade botón explícito "Ver detalle" además de "Reintentar".


## Reporte ejecutivo cortado y PDF sin descarga
- Problema: el diálogo del reporte ejecutivo podía cortar visualmente contenido largo por layout con overflow; el botón PDF no siempre descargaba por usar guardado directo del generador PDF; algunos generadores IA podían aceptar salidas incompletas/truncadas o fallar en silencio.
- Corrección: diálogo con scroll real, descarga centralizada por Blob, exportación PDF validada en navegador, límites IA ampliados, rechazo explícito de respuestas IA incompletas, sin recortes silenciosos de hallazgos/recomendaciones, captura de error al guardar recomendaciones.
- Corrección global: reportes PDF/Excel/CSV usan descarga robusta, PDF ejecutivo evita fuentes/estilos que renderizaban mal, otros generadores de reportes recibieron límites IA más seguros y guardas contra exportaciones vacías o incompletas.

## 2026-06-25 — Nuevo módulo: Contabilidad Automática
- Motor `src/lib/contabilidad-auto/engine.ts` que convierte CFDI (I/E/P/N) en asientos sugeridos usando catálogo SAT Anexo 24.
- Server fns `listarCfdiPendientes`, `generarPolizasDesdeCfdi`, `listarPolizasBorrador`, `cambiarEstadoPoliza`, `editarAsientosPoliza`.
- UI `/app/contabilidad-auto` con bandeja de CFDI sin contabilizar, pólizas borrador y confirmadas + editor de asientos.
- Migración: pólizas ahora soporta `estado` (borrador/confirmada/rechazada), `origen='auto_sat'` y `cfdi_id`. Nuevas tablas `catalogo_cuentas` y `reglas_contables` (para fase configurable).

## $(date +%Y-%m-%d) — Contabilidad automática fases 4-6
- **Catálogo editable por cliente**: `catalogo_cuentas` con UI CRUD y sembrado SAT base (19 cuentas Anexo 24).
- **Reglas configurables**: `reglas_contables` con UI CRUD y matching por tipo CFDI, RFC emisor/receptor, palabra clave en concepto y rangos de monto. El motor ahora aplica overrides según prioridad.
- **Exportadores**: Anexo 24 XML Pólizas v1.3 (con CompNal por UUID) y TXT importable a CONTPAQi i Contabilidad.
- Archivos: `src/lib/contabilidad-auto/catalogo.functions.ts`, `export.functions.ts`, `engine.ts` (overrides), `src/components/contabilidad-auto/ConfigTabs.tsx`.

## PDF de reportes no se abría
- `downloadReportePDF` ahora abre el blob en nueva pestaña además de descargarlo, y retorna `{ url, opened }`.
- El toast de "Reporte generado" incluye acción **Ver ahora →** / **Abrir de nuevo** como fallback si el navegador bloquea el popup.

## KPIs fantasma del catálogo de herramientas
- El mini-dashboard de `/app/contable` mostraba "CFDI este mes: 128 · 98 emitidos · 30 recibidos" hardcoded, sin relación con el expediente activo.
- Nueva `getCfdiMonthStats(cliente_id)` cuenta CFDIs del mes actual filtrados por `cliente_id` y distingue emitidos/recibidos comparando contra el RFC del cliente.
- El tile ahora se llama "CFDI este mes (expediente)" y refleja datos reales. Se eliminaron también los placeholders "17 días" y "Hoy" (ahora muestran "—").

## Unificación de /app/clientes y /app/expedientes
- `/app/expedientes` ahora redirige a `/app/clientes` (vista canónica).
- `/app/clientes` incorpora toggle Tabla/Tarjetas, KPIs de cartera (riesgo, alertas, ingresos) y filtros por semáforo, reutilizando `listExpedientes` para los datos enriquecidos.
- Se elimina la doble experiencia paralela sobre la misma entidad.

## Workflows: "Ver detalle" mostraba "Sin pasos registrados"
- Síntoma: en `/app/workflows`, el botón **Ver detalle** existía pero el modal podía mostrar "Sin pasos registrados" y ocultar el error real de ejecuciones parciales/fallidas.
- Causa: `getRunDetalle` ignoraba errores de lectura y devolvía arreglo vacío si la bitácora de pasos no llegaba a la UI; además el modal no mostraba estado de carga/error ni resumen de la ejecución.
- Corrección: los listados y el detalle ahora reconstruyen el resumen real desde los pasos fallidos (`kind: error`), validan el despacho activo, fallan explícitamente si no pueden leer la bitácora y el modal muestra un bloque **Error detectado** aunque no existan pasos visibles.

## 2026-06-29 — Login rebota al home antes de entrar al panel
**Síntoma:** Al iniciar sesión con correo/contraseña, la pantalla cambia brevemente pero termina en `/` (landing). Hace falta hacer clic otra vez en "Iniciar sesión" para entrar a `/app`.
**Causa raíz:** Carrera entre el evento `SIGNED_IN` (que disparaba `qc.clear() + router.invalidate()` en `AuthCacheSync`) y la navegación client-side de `finishAuthenticatedEntry`. El `router.invalidate()` ocurría mientras `bootstrapWorkspace` (server fn) seguía pendiente, interrumpiendo la transición.
**Fix:**
1. `src/routes/auth.tsx`: tras autenticar, hacer hard navigation con `window.location.assign(dest)` para no competir con el ciclo del router.
2. `src/routes/__root.tsx` (`AuthCacheSync`): ignorar el primer evento (hidratación), y en sign-in fresco usar solo `invalidateQueries()` (no `clear()` ni `router.invalidate()`). El `clear+invalidate` queda reservado para sign-out o cambio de identidad.

## 2026-06-29 · Sprint 1 — Contabilidad Electrónica SAT + Buzón IA + Nómina Auditor

- **Contabilidad Electrónica SAT (Anexo 24 v1.3)**: nuevos exportadores `exportarAnexo24Catalogo` (CT.xml) y `exportarAnexo24Balanza` (BN.xml) en `src/lib/contabilidad-auto/export.functions.ts`. Cierra la objeción "no exporta XML SAT" del veredicto del contador.
- **Plantilla IMCP PM Régimen General**: `src/lib/contabilidad-auto/imcp-catalog.ts` + `sembrarCatalogoIMCP` con códigos agrupadores oficiales.
- **Exportador Aspel COI** (`.txt POL`): `exportarAspelCoi` complementa al CONTPAQi existente.
- **Buzón Tributario IA real**: nueva tabla `buzon_notificaciones`, server fns `registrarNotificacion` + Gemini 2.5 Flash analiza PDF (plazo, fundamento, riesgo, borrador de respuesta). UI `/app/admin/buzon` reescrita.
- **Nómina · Auditor + Simulador**: server fns `auditarNomina` (revisa CFDI tipo "N" emitidos) y `simularCostoPatronal` (IMSS patrón, INFONAVIT, ISN, provisiones aguinaldo/vac/PTU). Nueva tabla `nomina_simulaciones`. UI `/app/admin/nomina` reescrita con pestañas Auditor/Simulador.

## 2026-06-29 · Sprint 2 #3 — Expediente ZIP completo

- Nuevo server fn `exportarExpedienteZip` (`src/lib/expedientes/zip-export.functions.ts`) que empaqueta en un único ZIP por cliente+periodo: XML Anexo 24 (CT/BN/PL), importadores CONTPAQi y Aspel COI, CFDI emitidos/recibidos/todos en CSV, detalle de pólizas y resumen ejecutivo TXT.
- Botón "Descargar Expediente ZIP" en `/app/contabilidad-auto → Configuración → Exportar`.
- Usa JSZip; respuesta como base64 para mantener el contrato JSON de createServerFn.
- 2026-06-29: Sprint 3 #5 — Plantillas IMCP PF Actividad Empresarial y PF RESICO añadidas a imcp-catalog.ts. sembrarCatalogoIMCP ahora acepta {plantilla: pm_general|pf_act_emp|pf_resico}. UI en ConfigTabs muestra Select para elegir régimen antes de sembrar.

## 2026-07-21 — CFDI: IVA trasladado mostrando $0 y "DIF_MATEMATICA" falsa
**Síntoma:** Detalle de CFDI mostraba `IVA traslado $0.00` aunque el XML lo trajera; el analizador marcaba "Riesgo alto — Inconsistencia aritmética".
**Causa:** `parseCfdi` usaba `findOpenTag("Impuestos")` que devuelve la PRIMERA coincidencia — el `<cfdi:Impuestos>` anidado dentro de `<cfdi:Concepto>`, que no lleva `TotalImpuestosTrasladados`. El resumen a nivel Comprobante quedaba fuera.
**Fix:**
- `src/lib/tools/cfdi-parser.ts`: se buscan TODOS los `<Impuestos>` y se toma el que sí trae `TotalImpuestosTrasladados|Retenidos` (o el último como fallback).
- Migración de backfill: 15,009 filas históricas con `iva_trasladado = 0` recalculadas desde la identidad aritmética `trasladados = total - subtotal + descuento + retenidos - ieps`.
**Impacto:** Reportes de IVA, Salud Fiscal, Conciliación, Contabilidad Auto y Reporte Ejecutivo quedan consistentes sin cambios de código adicionales.

## 2026-07-22 — Conciliación bancaria: PDF bancario no se cargaba ni se leía
**Síntoma:** al subir estados de cuenta PDF de banco, la herramienta rechazaba el archivo antes de cargar movimientos o permitía quedarse sin respuesta visible al reintentar el mismo PDF.
**Causa:** la validación de titularidad leía texto por separado antes del parseo; si el PDF no exponía RFC/razón social aunque sí tuviera tabla bancaria, se bloqueaba antes de aprovechar los movimientos detectados. Además, el input de archivo no se limpiaba tras errores, por lo que seleccionar el mismo PDF no siempre disparaba otra lectura.
**Fix:**
- El conciliador ahora parsea el PDF una sola vez y usa el mismo texto para validar titularidad.
- Si un PDF sí contiene movimientos pero no permite confirmar RFC/razón social, ya no se bloquea automáticamente; muestra advertencia para revisión humana y permite continuar.
- El parser PDF agrupa movimientos multilínea, soporta fechas con mes en texto y detecta columnas cargo/abono/saldo más comunes en estados de cuenta mexicanos.
- El input se resetea al finalizar y muestra estado "Leyendo estado de cuenta…" para evitar la sensación de que no hace nada.

## 2026-07-24 — Auditoría de clasificación fiscal CFDI (cascada)
Bug raíz: se clasificaba por `tipo_cfdi` (I/E del SAT) sin comparar contra el RFC del cliente activo. Un CFDI recibido de un proveedor también es tipo "I" desde su emisor, por lo que se contaba como ingreso propio.

Impacto detectado y corregido:
1. `getCfdiStats` (KPIs del módulo Comprobantes fiscales): "Ingresos" incluía gastos; "Egresos" solo notas de crédito. Fix: separar por `rfc_emisor === cliente.rfc` (emitidos) vs `rfc_receptor === cliente.rfc` (recibidos). IVA acreditable ahora solo de recibidos.
2. `reportes-ejecutivos.recolectarDatos`: mismo bug — utilidad, margen, ISR estimado, IVA neto y saldo a favor/cargo estaban inflados. Ahora resta notas de crédito emitidas/recibidas y descarta cancelados.
3. `app.cfdi.index.tsx` — columna Contraparte: mostraba emisor cuando tipo=I sin importar dirección. Ahora muestra la contraparte real (receptor si es emitido, emisor si es recibido) con marca de dirección.
4. `nomina.functions.ts` — Auditor ahora filtra `rfc_emisor = cliente.rfc` para no auditar recibos donde el cliente es empleado.

Módulos verificados sanos: `salud/salud.functions.ts`, `reportes/reportes.functions.ts`, `riesgo/riesgo.functions.ts`, `auditor/auditor.functions.ts`, `contabilidad-auto/engine.ts`, `isr-iva-calculator` — ya comparaban contra el RFC del cliente.

## 2026-07-24 · Conciliación · PDF BBVA rechazado por RFC con guión
- **Reporte:** usuario cpdafico@gmail.com (cliente TOGL790615PW3, Lizette) no podía subir el estado de cuenta BBVA enero 2022.
- **Causa:** `bankFileMatchesContribuyente` normalizaba el texto reemplazando símbolos por espacios. El PDF imprime el RFC como `TOGL790615-PW3`, con guión, que quedaba como `togl790615 pw3` y nunca hacía match con `togl790615pw3`.
- **Fix:** en `src/lib/conciliacion/parsers.ts` la validación ahora también compara contra una versión compacta (sin espacios) del texto y limpia el RFC del cliente. Cualquier banco que imprima el RFC separado por guión, puntos o espacios queda cubierto.

## 2026-07-25 · Conciliación bancaria · Error Zod `descripcion` mayor a 500
- **Reporte:** al cargar estado de cuenta, varios movimientos fallaban con `too_big` porque el concepto/descripción venía pegado y excedía el límite anterior de 500 caracteres.
- **Causa:** algunos PDFs bancarios unen varias líneas del estado de cuenta en una sola descripción; aunque el servidor ya aceptaba recorte, el payload podía llegar con conceptos largos desde el navegador o desde bundles publicados anteriores.
- **Fix:** normalización defensiva en tres puntos: parser bancario, payload de `/app/conciliacion` y validador del servidor. La descripción se limpia y recorta a 480 caracteres; referencia a 120. Así evita el límite histórico y mantiene la carga estable.
- **Refuerzo:** el validador de servidor ahora normaliza el payload completo antes de ejecutar Zod y el cliente recorta a 450 caracteres para quedar por debajo de cualquier bundle antiguo que aún aplique máximo 500.

## 2026-07-25 · Pólizas automáticas escondidas en otro módulo
- **Reporte:** el guion hablaba de pólizas automáticas, pero en la pantalla visible de `/app/polizas` sólo aparecían carga CSV, alta manual e historial; eso hacía parecer que la funcionalidad no existía.
- **Causa:** la generación automática sí existía en `/app/contabilidad-auto`, pero estaba separada del módulo de “Pólizas contables”, por lo que el flujo comercial y operativo no coincidía con lo mostrado al usuario.
- **Fix:** `/app/polizas` ahora abre con la pestaña **Automáticas**, permite generar pólizas desde CFDI pendientes y movimientos bancarios sin póliza, y permite aprobar borradores automáticos desde la misma pantalla.
- **Resultado:** el módulo de pólizas ya no depende sólo de importación manual/CSV; integra el flujo automático que se había descrito y mantiene manual/CSV como alternativas.

## Descarga masiva SAT sin PAC (e.firma directa)
- Se conectó `runSyncNow` y el cron `/api/public/hooks/sat-sync` al Servicio de Descarga Masiva del SAT usando la e.firma del contribuyente (costo $0 por solicitud); el PAC (SW Sapien) queda como respaldo.
- Nuevo `src/lib/sat/sat-directo-runner.server.ts`: solicita, verifica, descarga los ZIP y los ingesta como CFDI con dedup por UUID/hash.
- Las corridas con solicitud en proceso quedan en `en_curso` y el cron las cosecha automáticamente cuando el SAT libera los paquetes.
- El candado de saldo PAC ya no aplica en modo directo; se conserva la cuota de solicitudes por plan.

## Aislamiento por expediente activo (tenant + rol + cliente)

**Problema:** varias pantallas mostraban datos de un RFC distinto al expediente
seleccionado (Reporte Ejecutivo, y las pestañas Dashboard/Actividad/Novedades de
Sincronización SAT), y algunas conservaban información del expediente anterior
tras cambiar de selección.

**Causa raíz:**
- `listarReportes`, `obtenerKpisReportes`, `listarRecomendaciones`,
  `listarSimulaciones` y `obtenerReporte` aceptaban `cliente_id` opcional; el
  frontend nunca lo enviaba, así que devolvían todo el despacho.
- `dashboardSatSync`, `listSyncRuns` y `listSyncEventos` filtraban solo por
  despacho, nunca por expediente.
- Al cambiar de expediente no se descartaba la caché de React Query.

**Solución:**
- Nueva fuente única de verdad server-side: `src/lib/despacho/scope.ts`
  (`assertClienteScope`). Valida existencia del expediente, resuelve el
  expediente padre si se recibe un tercero, exige membresía activa u
  ownership del despacho y consulta `has_cliente_access` para permisos finos.
  Si no hay expediente activo o no hay acceso, **falla cerrado** (throw).
- `cliente_id` pasó a ser **obligatorio** en las funciones de Reporte Ejecutivo
  y Sincronización SAT; todas filtran por `cliente_id` **y** `despacho_id`.
- Se añadió `assertClienteScope` a calendario (`listObligacionesCliente`),
  conciliación (`listMovimientos`, `getReconciliationStats`), precios de
  importación (`runImportPriceCheck`) y `runSyncNow`/`getSatSyncConfig`.
- `ActiveClienteProvider` ahora limpia toda la caché de React Query al cambiar
  de expediente, estabiliza la revalidación (una sola llamada por id) y expone
  `hydrating` para evitar el falso "no hay expediente" durante la carga.
- Reporte Ejecutivo ya no tiene selector de cliente propio: usa siempre el
  expediente activo de la barra superior.

---

## Candado por registro y pruebas de regresión de aislamiento
**Fecha:** validación exhaustiva del aislamiento entre expedientes

**Problema detectado en la auditoría:**
- Varias mutaciones actualizaban/eliminaban por `id` sin comprobar a qué
  expediente pertenecía el registro. Un `id` manipulado desde el cliente podía
  modificar datos de OTRO expediente del mismo despacho.
  Afectaba: `marcarReporteEnviado`, `actualizarRecomendacion`,
  `crearTareaDesdeRecomendacion`, `setEstatusObligacion`, `posponerObligacion`,
  `eliminarObligacion`, `upsertObligacion`, `setSyncActivo`,
  `updateConciliacion`, `getAlertConfig` / `updateAlertConfig`.
- `analyzeReconciliationAI` y `procesarEstadoDeCuenta` resolvían el despacho por
  el usuario y no por el expediente.
- Consultas de calendario, conciliación, SAT sync e import-prices podían
  dispararse mientras el expediente activo aún se rehidrataba.

**Solución:**
- Nuevo candado `assertRecordScope` en `src/lib/despacho/scope.ts`: resuelve el
  expediente dueño del registro, valida el alcance del usuario y exige que
  coincida con el expediente activo. Devuelve un error genérico (sin filtrar
  datos parciales del registro).
- Todas las mutaciones anteriores exigen ahora `cliente_id` y filtran por
  `id` + `cliente_id` + `despacho_id`.
- Las pantallas (`app.calendario`, `app.sat-sync`, `app.conciliacion.index`,
  `app.tools.import-prices`, `app.reporte-ejecutivo`) envían el expediente
  activo en cada mutación y esperan a `!hydrating` antes de consultar.

**Pruebas ejecutadas:** `src/lib/despacho/scope.test.ts` (11 casos, en verde)
- Sin expediente activo → falla cerrado.
- Expediente propio → resuelve tenant y RFC correctos.
- Expediente de otro despacho → bloqueado.
- Usuario sin membresía activa → bloqueado.
- `has_cliente_access = false` → bloqueado.
- Tercero (proveedor) → resuelve al expediente padre.
- Registro de OTRO expediente del MISMO despacho → bloqueado.
- Registro de otro despacho, id inexistente e id vacío → bloqueados sin fuga.

---

## 2026-08-04 — Auditoría transaccional del saldo de descargas SAT (PAC)

**Bug crítico encontrado y corregido:** `pac_recargar` y `pac_confirmar_consumo`
fallaban SIEMPRE con `column reference "saldo_solicitudes" is ambiguous`
(el nombre de la columna de salida chocaba con la columna de la tabla).
Es decir: no era posible recargar saldo ni confirmar el consumo de una corrida
SAT. Se corrigió calificando las columnas con alias de tabla (`s.saldo_solicitudes`).

**Cómo se validó:** se creó temporalmente `public.pac_selftest()`
(SECURITY DEFINER), se ejecutó dentro de `BEGIN ... ROLLBACK` sobre saldo
sintético y se eliminó al terminar. Datos reales verificados intactos
(saldo 0/0, 0 movimientos, ningún registro `selftest:%`).

**Resultado: 23/23 casos en verde**
- Recarga suma correcto; misma llave de idempotencia no cobra dos veces.
- Reserva acepta, respeta disponible y no duplica al repetir la llave.
- Sobre-reserva rechazada: el saldo nunca queda negativo.
- Confirmar 25 de 40 consume 25 y devuelve 15; doble confirmación no duplica.
- Devolución de corrida fallida se registra exactamente una vez.
- Confirmar sin reserva lanza excepción; devolver sin reserva regresa `false`.
- Libro mayor inmutable: UPDATE y DELETE bloqueados por trigger.
- Conciliación saldo vs libro mayor: descuadre = 0 (antes y después de ajustes).
- Reservas colgadas: no se marcan si son recientes, se detectan y se liberan
  devolviendo el reservado a 0.
- Ajustes: exigen motivo ≥ 5 caracteres y son idempotentes por llave.
- Permisos: recarga, ajuste y conciliación rechazados sin rol super-admin.
- Sin columnas de punto flotante en `sat_pac_saldo` / `sat_pac_movimientos`
  (todo en unidades enteras y centavos).

**Concurrencia:** con dos sesiones simultáneas, la sesión B recibió
`BLOQUEADO: otra transaccion tiene el saldo` mientras A mantenía el
`SELECT ... FOR UPDATE`, y obtuvo el lock al liberarse. El saldo se serializa
correctamente: dos corridas SAT simultáneas no pueden gastar el mismo saldo.

---

## Validación final de entitlements (evidencia del segundo bloque)

### 1. Regresiones permanentes en control de versiones

| Suite | Archivo | Casos |
|---|---|---|
| Entitlements (matriz completa) | `src/lib/entitlements/entitlements.test.ts` | 24 |
| Saldo PAC (choque de nombres, ledger) | `src/lib/sat/pac-regression.test.ts` | 10 + 1 SQL opcional |
| Aislamiento multi-tenant | `src/lib/despacho/scope.test.ts` | 11 |

Ejecución: `npm test` (alias `predeploy`) → **45 pasados, 1 omitido** (el omitido
es la suite SQL contra base real). La suite SQL vive en
`supabase/tests/pac_regression.sql`, corre dentro de `BEGIN … ROLLBACK` y se
lanza con `npm run test:pac-sql` (requiere `PGHOST` y rol con permiso de
ejecución). Cubre exactamente el incidente original: `pac_recargar()` y
`pac_confirmar_consumo()` debían devolver el saldo **posterior** sin
ambigüedad entre la columna `sat_pac_saldo.saldo_solicitudes` y la columna de
salida homónima.

### 2. Trials vencidos y estados contradictorios (anonimizado)

Registro de la corrida: `audit_logs #1845`, `entitlements.expirar_trials`,
2026-08-04 08:15:31 UTC, payload `{"normalizadas": 11, "vencidas": 13}`.

**Regla (a) — normalización de estado contradictorio (11 cuentas).**
`plan_id IS NOT NULL AND (trial_ends_at IS NOT NULL OR estado='trial')`
→ `estado='activa'`, `trial_ends_at=NULL`.
Antes: cuenta con plan de pago que además arrastraba fecha de trial (mostraba
"Plan Profesional · Trial 0 días"). Después: 12 cuentas en `activa` con plan y
`trial_ends_at = NULL` (11 normalizadas + 1 que ya estaba correcta).

**Regla (b) — expiración de trial (13 cuentas).**
`plan_id IS NULL AND estado='trial' AND trial_ends_at <= now() AND es_sandbox=false`
y sin excepción vigente de tipo `trial_extension` / `acceso_cortesia`
→ `estado='vencida'`.

Estado posterior verificado (hash corto del id, sin datos personales):

| Hash | Estado | Plan | Fin de trial |
|---|---|---|---|
| 49414516, f76dfe92, f4f3a2b3, b8b6f276, c61034d0, cedbdd12, a46ceb6e | vencida | — | 2026-07-03/04 |
| 9b9400c4, deab7ba9 | vencida | — | 2026-07-08 |
| a48d6a3f, 635c9af2, 1cb3a1c5 | vencida | — | 2026-07-13/14 |
| 6f2374e8 | vencida | — | 2026-07-18 |
| 52650331, f46b7503 | trial | — | 2026-08-05/06 (vigentes) |
| 12 cuentas | activa | sí | NULL |

Total 27 cuentas; ninguna en estado contradictorio. Sin cuentas `suspendida`
ni `es_sandbox`.

**Procedimiento de reversión** (solo super-admin, por cuenta, con motivo):
1. Reversión comercial recomendada: crear una excepción
   `entitlement_excepciones` tipo `trial_extension` o `acceso_cortesia` con
   `motivo` (≥10 caracteres), `creado_por` y `expira_at` futuro. El acceso se
   restablece de inmediato y caduca solo.
2. Reversión de datos (excepcional): `UPDATE despachos SET estado='trial',
   trial_ends_at=<fecha original>` ejecutado con rol privilegiado; el trigger
   `tg_despachos_guard` lo impide desde cualquier sesión de usuario. Las fechas
   originales quedan en la tabla (`trial_ends_at` no se borró en la regla (b)),
   por lo que la reversión es exacta.

### 3. Matriz de entitlements ejecutada

| Escenario | Resultado esperado | Estado |
|---|---|---|
| Trial vigente | acceso, días restantes, límites default | ✅ |
| Trial vencido | `acceso=false`, estado persistido `vencida` | ✅ |
| Plan activo | límites del plan (incl. `-1` ilimitado) | ✅ |
| Plan cancelado / sin plan y trial vencido | bloqueo con motivo | ✅ |
| Dentro de cuota | permite consumir | ✅ |
| 80% de cuota | avisa y permite | ✅ |
| Exactamente en el límite | permite el último consumo | ✅ |
| Por encima del límite | `UsageLimitError` + aviso 100% | ✅ |
| Excepción vigente | amplía el límite, nunca lo reduce | ✅ |
| Excepción vencida | deja de aplicar automáticamente | ✅ |
| Excepción revocada | deja de aplicar de inmediato | ✅ |
| Cambio de plan | recalcula límites, no reinicia el uso del periodo | ✅ |
| Renovación / periodo | `periodo` = mes UTC vigente | ✅ |
| Usuario sin membresía | RLS no devuelve la cuenta → error, sin fuga | ✅ |
| Evasión desde el frontend | el servidor recalcula; entitlement fabricado no sirve | ✅ |
| Cuenta sandbox | nunca se bloquea por cuota | ✅ |
| Expedientes demo | no consumen cuota de RFCs | ✅ |
| Frecuencia SAT | rechaza frecuencia superior al plan; excepción la amplía | ✅ |

### 4. Permisos de `clientes.es_demo` y `despachos.es_sandbox`

- `tg_clientes_demo_guard` (BEFORE INSERT/UPDATE): un usuario normal **no puede**
  convertir un expediente existente en demo; al alta solo se permiten demos
  hasta un tope de 25 por cuenta. Solo super-admin (o contexto sin sesión:
  cron/servicio) queda exento.
- `tg_despachos_guard` (BEFORE UPDATE): bloquea desde sesión de usuario los
  cambios de `es_sandbox`, `plan_id`, `limites_override`, la reactivación sin
  plan y cualquier extensión de `trial_ends_at`.
- Verificado en base: 17 expedientes demo, 0 despachos sandbox.

### 5. Excepciones comerciales

- `motivo` obligatorio (CHECK ≥ 10 caracteres útiles), `creado_por` y
  `expira_at` obligatorios.
- No pueden quedar permanentes: `tg_excepcion_guard` exige expiración futura y
  máximo 365 días, tanto al crear como al ampliar.
- Trazabilidad completa en `audit_logs`: `entitlements.excepcion.creada`,
  `.modificada` y `.revocada`, con valores antes/después.
- Caducidad automática: `excepcion_vigente()` y `getEntitlements()` filtran por
  `revocada_at IS NULL AND expira_at > now()`; no hay proceso que "limpiar".

### 6. Alertas y no duplicación

- Uso (80%/100%): índice único parcial `idx_alertas_uso_unique`
  (despacho, tipo, recurso, periodo, umbral).
- Trial y excepción por vencer: `emitir_avisos_vencimiento()` +
  `idx_alertas_vencimiento_unique` (despacho, tipo, ref, umbral) con
  `ON CONFLICT DO NOTHING` — umbrales 7d/3d y 15d/7d.
- Saldo PAC: `idx_alertas_pac_unique` (tipo, umbral, periodo) para avisos
  globales; `pac_recargar()` cierra las alertas abiertas al reponer saldo.
- Reejecutar los emisores no genera duplicados (probado en la suite y
  garantizado por los índices). A la fecha no hay filas de estos tipos en
  `alertas`: ninguna cuenta cruzó umbral desde la corrección.

### 7. Inventario de rutas que dependen del servicio central

Consumidores de `src/lib/entitlements/service.ts` (directo o vía
`entitlements.functions.ts` / `usage/limits.ts`):

- `src/lib/clientes.functions.ts` — alta de expedientes (cuota RFCs)
- `src/lib/chat.functions.ts`, `src/lib/bot-ayuda.functions.ts` — cuota IA
- `src/lib/sat/sat-sync.functions.ts`, `src/lib/usage/sat-quota.ts` — cuota y
  frecuencia SAT + saldo PAC
- `src/lib/usage/usage.functions.ts` — medidores de la UI
- `src/lib/admin-panel/sat-pac.functions.ts` — operación de saldo PAC
- `src/lib/equipo/equipo.functions.ts` — límite de miembros (**migrado en esta
  entrega**: antes leía `limites_override`/`planes.limites` por su cuenta)
- Frontend: `use-entitlements.ts` → `TrialGate`, `TrialBanner`,
  `UsageMeters`, `UsageProfileCard`

`src/lib/usage/limits.ts` quedó como capa de compatibilidad que delega en el
servicio; no contiene reglas propias. Revisión de código confirmada: fuera de
`src/lib/entitlements/**` ya no hay lógica que otorgue acceso, cuota o saldo por
separado (las lecturas restantes de `plan_id`/`trial_ends_at` son de
presentación en el panel de administración o del proceso de pago).

> No se modificaron datos reales para esta validación.

## 2026-07-25 — Vigencia normativa versionada + prueba operativa integral

**Problema crítico:** la calculadora ISR/IVA PF usaba tarifas 2024 escritas en el componente, operando en 2026.

**Correcciones**
- `src/lib/fiscal/normativa/catalogo.ts`: conjuntos normativos por impuesto/régimen/ejercicio/periodo con fuente oficial, URL, fecha de publicación y de entrada en vigor (ISR PF mensual y anual 2025/2026, RESICO PF, ISR PM, IVA).
- `src/lib/fiscal/normativa/motor.ts`: `resolverNormativa` exige cobertura exacta del periodo. Sin tabla vigente **bloquea el cálculo** con error explicativo; nunca cae silenciosamente a la última tabla. Todo resultado lleva sello normativo (ejercicio, versión, fuente, fecha, naturaleza determinista).
- Calculadoras refactorizadas: ISR/IVA PF, ISR PM, RESICO PF (+ retención 1.25% y control del límite anual). Muestran `NormativaBadge` con fuente y aviso de revisión profesional.
- Riesgo SAT: `src/lib/riesgo/criterios-fuentes.ts` documenta fundamento legal, dato utilizado, fuente y naturaleza de los 12 criterios; la UI los muestra por tarjeta y publica la metodología v2026.1.
- 69-B/EFOS: `EFOS_META` ahora declara versión del listado, fecha de corte, fundamento (art. 69-B CFF), URL oficial y advertencia; la UI del validador lo despliega.

**Pruebas permanentes**
- `src/lib/fiscal/normativa/normativa.test.ts` — 42 casos: límites inferior/exacto/superior de cada tramo ISR PF, deducciones, retenciones, pagos provisionales, ISR PM con coeficiente y pérdidas, RESICO por tasa, IVA a cargo/a favor/valores inválidos, redondeo a 2 decimales, cambio de ejercicio y periodo sin mezclar tablas.
- `src/lib/fiscal/e2e-sintetico.test.ts` — 20 casos: flujo operativo completo con datos sintéticos (CSF → expediente → CFDI emitidos/recibidos/nómina/pagos → validación UUID → 69-B → deducibilidad → banco → pólizas borrador → aprobación → conciliación → ISR/IVA → obligaciones/tareas/workflow → resumen y reporte ejecutivo), aislamiento entre dos expedientes y entre despachos, fallo cerrado sin expediente activo, y reversión total de los datos sintéticos.
- Suite completa: **107 pruebas verdes** (1 omitida por requerir BD). Sin IA, sin SAT, sin correo y sin tocar datos reales.

## 2026-07-25 (bis) — Corrección de dos errores conceptuales en la validación fiscal

**Error 1 — La tarifa anual se validaba como 12 × la tarifa mensual.**
La suite contenía una prueba que exigía la equivalencia `anual = 12 × mensual`.
Es incorrecto: el Anexo 8 de la RMF publica la tarifa del art. 152 LISR (anual)
como una tabla propia, y sus importes NO coinciden con el producto de la mensual.
Contraejemplo publicado 2026: el primer límite superior mensual es **844.59**,
`844.59 × 12 = 10,135.08`, pero el límite superior anual publicado es
**10,135.11** (y el siguiente límite inferior anual es 10,135.12).

- Prueba eliminada: la de equivalencia 12×.
- Prueba nueva en su lugar: *"la tarifa ANUAL no se deriva de la mensual"*, que
  demuestra el contraejemplo y verifica que para 2024, 2025 y 2026 la tabla anual
  del catálogo **no** es igual a la mensual multiplicada por 12.
- `motor.ts`: `calcularIsrPf` ahora resuelve `PF_GENERAL_ANUAL` cuando el periodo
  es `AAAA` o se pasa `anual: true`; antes cualquier periodo tomaba la mensual.
- Se conserva una prueba de lo que el Anexo 8 sí comparte: los **porcentajes**
  sobre excedente son idénticos entre mensual y anual.

**Error 2 — El subsidio al empleo 2026 se modelaba como tabla de tramos.**
Desde el Decreto DOF **31/12/2025** el subsidio dejó de ser una tabla por tramos:
es un **porcentaje de la UMA mensual**, con un tope de ingreso mensual.

| Periodo | Porcentaje | UMA aplicable | UMA mensual | Subsidio | Límite de ingreso |
|---|---|---|---|---|---|
| 2026-01 | 15.59 % | UMA 2025 | 3,439.46 | 536.21 | 11,492.66 |
| 2026-02 en adelante | 15.02 % | UMA 2026 | 3,569.97 | 536.21 | 11,492.66 |

- `catalogo.ts`: se eliminó la tabla `SUBSIDIO_MENSUAL_2026` (tramos) y se crearon
  dos conjuntos normativos **independientes** —`subsidio-empleo-2026-01-v1` y
  `subsidio-empleo-2026-02-v1`— con fuente propia `DECRETO_SUBSIDIO_2026`
  (no Anexo 8), tipo de cuerpo `subsidio_porcentaje`.
- `motor.ts`: `calcularSubsidioEmpleo` aplica porcentaje × UMA, prorratea por días
  cuando el pago cubre menos de un mes y suma mes por mes cuando cubre varios,
  resolviendo la normativa de **cada** mes por separado (un pago que cruza
  enero–febrero usa 15.59 % y 15.02 % respectivamente).
- La UMA 2026 está marcada `pendiente_cotejo`; el resultado lo expone como
  `advertencia` y `NormativaBadge` lo muestra en pantalla en lugar de callarlo.

**Independencia de los resultados esperados.**
`src/lib/fiscal/normativa/__fixtures__/oficiales.ts` transcribe literalmente las
tablas publicadas (ISR PF mensual y anual 2024/2025/2026, subsidio 2026, RESICO,
tasas ISR PM e IVA). Las pruebas comparan el catálogo **fila por fila** contra el
fixture, y los importes esperados se calculan a mano desde el fixture, no
llamando al motor ni derivando una tabla de la otra.

**Integridad normativa.**
El sello dejó de usar FNV-1a: `src/lib/fiscal/normativa/sha256.ts` implementa
SHA-256 y `hashConjunto` sella una serialización canónica del conjunto.
`sha256.test.ts` coteja la implementación contra vectores conocidos y contra
`node:crypto`. Los hashes publicados están congelados en `HASHES_PUBLICADOS`:
cualquier edición de una tabla rompe la prueba de integridad.

**Casos nuevos del subsidio**: conjunto normativo propio (no Anexo 8), cotejo
contra el decreto, enero 15.59 %/UMA 2025, febrero–diciembre 15.02 %/UMA 2026,
cambio enero→febrero con versiones distintas, límite 11,492.66 exacto/±1 centavo,
prorrateo quincenal y semanal, pago bimestral, pago que cruza enero–febrero,
límite evaluado por mes en pagos multi-mes, subsidio mayor/igual/menor que el ISR
(entrega en efectivo vs. reducción de retención), periodos sin normativa (2024,
2025, 2027) que fallan cerrado, y advertencia de UMA pendiente de cotejo.

**Resultado de la suite: 206 pruebas verdes, 1 omitida (requiere BD), 0 fallos.**
Ningún cálculo anual se obtiene multiplicando la tabla mensual, y el subsidio al
empleo tiene su propio conjunto normativo con fuente y vigencia separadas.
No se modificaron datos reales.

## 2026-08-04 — UMA 2026 oficial y corrección del subsidio al empleo

**Problema:** el conjunto normativo del subsidio de febrero-diciembre 2026 usaba una UMA mensual estimada ($3,569.97) marcada como `pendiente_cotejo`, lo que producía $536.21 tanto en enero como en febrero.

**Corrección (fuente: INEGI, DOF 09/01/2026 — https://dof.gob.mx/nota_detalle.php?codigo=5778072&fecha=09/01/2026):**
- UMA 2026: diaria $117.31, mensual $3,566.22, anual $42,794.64, vigente desde el 01/02/2026.
- Nuevos conjuntos versionados `uma-2026-v1` y `uma-2025-v1` (impuesto `UMA`, régimen `UMA_INEGI`) con fuente, vigencia y hash SHA-256 propios.
- Subsidio: `subsidio-empleo-2026-02-v1` (UMA $3,569.97) se retira y se sustituye por `subsidio-empleo-2026-02-v2` (UMA $3,566.22). Se elimina `pendiente_cotejo` del catálogo.

| Periodo | Base | % | Importe anterior | Importe nuevo |
|---|---|---|---|---|
| Enero 2026 | UMA 2025 $3,439.46 | 15.59% | $536.21 | $536.21 (sin cambio) |
| Feb–Dic 2026 | UMA 2026 $3,566.22 | 15.02% | $536.21 | **$535.65** |

**Prorrateo:** confirmado `(UMA mensual × %) ÷ 30.4 × días`, nunca entre los días naturales del mes. El acumulado de pagos parciales se topa al máximo mensual (`subsidioPrevioDelMes` + `topadoAlMaximoMensual`).

**Archivos:** `src/lib/fiscal/normativa/catalogo.ts`, `motor.ts` (`resolverUma`, tope mensual), `__fixtures__/oficiales.ts` (valores literales + `UMA_2026_VALOR_INCORRECTO` sólo para rechazarlo), `normativa.numerica.test.ts`.

**Pruebas nuevas:** 31/01 vs 01/02, enero completo $536.21, febrero completo $535.65, un día de enero y de febrero con divisor 30.4, periodos de 7/15/30 días, tope tras pagos parciales, pago que cruza enero-febrero, ingresos $11,492.66 y $11,492.67, rechazo de $3,569.97 en todo el catálogo, vigencia UMA 2025 hasta el 31/01/2026. Suite fiscal: 175 pruebas en verde. No se modificaron datos reales ni se ejecutó nada contra el SAT.

## Auditoría de la versión publicada (cierre)

- **Panel admin**: cada renglón muestra ahora el límite base del plan frente al
  límite vigente, las cortesías con su fecha de expiración y los expedientes
  demo, que existen pero no consumen cuota.
- **Expedientes**: `/app/clientes` separa "Reales" y "Demostración" en pestañas,
  etiqueta los demo con un distintivo visible y los excluye de los KPI.
- **Riesgo SAT**: el score se calcula en `src/lib/riesgo/score.ts`. Sin cobertura
  mínima (50% de criterios con información real) no se publica score: el
  semáforo queda en "sin datos" y nunca se afirma "riesgo bajo".
- **Servicio SAT**: la decisión de si se puede sincronizar se centralizó en
  `src/lib/sat/estado-servicio.ts`, con causa y motivo explícitos (cuenta
  bloqueada, sin selección, sin credencial, cuota agotada, servicio sin saldo).
- **Regresiones**: `src/lib/riesgo/score.test.ts` y
  `src/lib/sat/estado-servicio.test.ts` (12 casos) blindan estos puntos.

## Auditoría de madurez funcional y presentación de herramientas (2026-08-05)

**Fuente única de capacidades.** Se creó `src/lib/capabilities/registry.ts` con
identificador, nombre, ruta, módulo, grupo, estado de madurez, planes
autorizados, permiso, dependencias externas (IA, SAT, PAC, correo,
almacenamiento, banco), si admite datos reales o sintéticos, visibilidad en
menú, mensaje a mostrar cuando no está disponible, fecha de validación y
responsable. Incluye también el registro de los 8 agentes con su disparador,
datos que usan, acciones externas, consumo de créditos, aprobación humana,
bitácora y comportamiento ante fallo. La resolución de acceso vive en
`src/lib/capabilities/access.ts` y falla cerrado.

**Inventario resultante.** 50 capacidades registradas: 37 operativas
(31 plenas y 6 con limitaciones), 9 beta, 1 demostración (Marketplace Legal),
2 sin implementación (Inventarios y Precios de transferencia, ambas ocultas)
y 1 obsoleta (`/app/tools/sat-risk`, reemplazada por `/app/riesgo`).

**Inconsistencias corregidas.**
- *Inventarios* anunciaba "próximamente" pero mostraba KPI ("184 SKUs",
  "$418K") y un kardex con apariencia real. Se eliminó todo el dato simulado;
  la pantalla ahora declara que no tiene implementación y ofrece alternativas.
- *Marketplace Legal* mostraba despachos con nombre, calificación y botón
  "Solicitar cotización" que no hacía nada. Ahora está etiquetado como
  demostración, los nombres son genéricos y el botón está deshabilitado.
- *Mapa de Lagunas Legales* se reclasificó como operativa con limitaciones: el
  catálogo es contenido curado, pero las defensas que se activan sí se guardan.
- *Mis Agentes* anunciaba "8 agentes" y sólo enlazaba 4. Ahora el contador y el
  estado salen del registro, y cada agente declara datos, permisos, acciones
  externas, créditos, bitácora y qué ocurre si falla.
- *ModuleScaffold* mostraba simultáneamente la insignia "Vista previa" y el
  botón "Avísame cuando esté listo" incluso en módulos operativos. Ahora recibe
  el estado de madurez y los controles operativos y el "avísame" nunca coexisten.
- *Catálogos* de Módulo 1, Módulo 2 y Legal mantenían tres listas independientes
  con estados propios ("live" para herramientas beta). Los tres derivan ahora del
  registro, igual que `src/lib/tools/registry.ts`, la paleta de comandos y el
  catálogo de inicio, que además ocultan lo no implementado.
- *Buzón Tributario* se renombró a "Bandeja de Notificaciones IA" en menús: no
  se conecta al Buzón Tributario oficial.

**Pruebas.** `src/lib/capabilities/capabilities.test.ts`: 27 casos que cubren
unicidad del registro, existencia real de cada ruta anunciada, coherencia de
contadores, ausencia de listas paralelas, acceso por plan y permiso, cambio de
plan, URL directa a funciones sin implementación, herramientas beta y demo,
separación de datos sintéticos y ausencia de controles incompatibles.
Suite completa: 259 pruebas en verde (1 omitida). Typecheck limpio.

No se modificaron datos reales, ni se ejecutaron sincronizaciones SAT, ni se
consumió PAC o IA, ni se enviaron comunicaciones.

## Modelo comercial unificado (planes, precios, entitlements, fundador)

**Problema.** Existían listas de precios y de capacidades paralelas (`precios.tsx`,
`app.checkout.tsx`, tabla `planes`, registro de capacidades). Herramientas se
presentaban como exclusivas de ciertos planes, los importes usaban punto
flotante y el descuento fundador podía inducirse desde el frontend.

**Correcciones.**
1. `src/lib/payments/plans.ts` es la fuente única de verdad: planes, RFC máximos
   (Starter 5, Pro 25, Despacho 100, Enterprise a medida), precios de lista en
   centavos enteros ($499 / $1,290 / $2,490 mensual; anualidad = 10 mensualidades),
   IVA 16% sumado en checkout y capacidad operativa por plan.
2. Regla comercial aplicada: **todos los planes incluyen todas las herramientas**.
   Se eliminó el gating por plan en `capabilities/access.ts` y `registry.ts`.
   Lo único que escala es la capacidad (RFC, IA, SAT, almacenamiento, usuarios).
3. `entitlements/service.ts` deriva los límites del plan desde `plans.ts`; la
   tabla `planes` ya no puede contradecir la fuente única. Orden de precedencia:
   default < fila BD < plans.ts < override comercial < excepción vigente.
4. Programa Fundador: 40% sobre la anualidad ($2,994 / $7,740 / $14,940), sólo
   ciclo anual, sólo dentro de vigencia y sólo para cuentas registradas en
   `programa_fundador`. La elegibilidad se resuelve **en servidor**
   (`fundador.functions.ts`); el checkout sólo la refleja. No es vitalicio:
   se documenta por cuenta con `renovaciones_cubiertas`.
5. Mercado Pago (`mp.functions.ts`): importes desde `calcularImportes`, cupón y
   descuento fundador no se acumulan (gana el mayor) y se reutiliza la liga de
   pago viva del mismo plan/ciclo para evitar cobros duplicados.
6. `/precios` reconstruida: comparativa por capacidad, catálogo completo derivado
   del registro de capacidades con etiquetas honestas (beta / alcance limitado /
   en desarrollo) y bloque de Programa Fundador con condiciones explícitas.

**Verificación.** 16 pruebas nuevas en `src/lib/payments/plans.test.ts` (precios,
IVA, redondeo entero, no acumulación de descuentos, vigencia fundadora) y
actualización de las pruebas de capacidades y entitlements. Suite: 275 en verde.
No se modificaron suscripciones reales ni se generaron cobros.
