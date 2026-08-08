## 2026-08-08 — SAT rechazaba la firma XML con error de seguridad 500
- **Síntoma:** después de validar correctamente `.cer`, `.key`, contraseña, RFC y vigencia, el SAT respondía `An error occurred when verifying security for the message`.
- **Causa:** las solicitudes firmadas declaraban la transformación `enveloped-signature`, distinta a la `exc-c14n` exigida por las plantillas oficiales, y el digest manual incluía un namespace `xd` no visible que el canonicalizador del SAT elimina.
- **Corrección:** las cuatro operaciones usan canonicalización exclusiva; los digests de solicitud, verificación y descarga contienen únicamente el namespace `des` realmente utilizado. El sobre de autenticación conserva `SecurityTokenReference` al certificado embebido.

## 2026-08-08 — e.firma válida rechazada como contraseña incorrecta
- **Síntoma:** al conectar una e.firma, ciertas llaves `.key` legítimas del SAT eran rechazadas con “No se pudo abrir la llave privada”, aun usando la contraseña correcta.
- **Causa:** el lector dependía de una conversión PEM incorrecta y del soporte parcial de `node-forge` para las distintas variantes históricas de PKCS#8/PBES emitidas por el SAT.
- **Corrección:** lector centralizado con `node:crypto`/OpenSSL para PKCS#8 DER cifrado, respaldo compatible con forge y soporte de contraseñas con caracteres no ASCII. El mismo lector se usa al conectar y al ejecutar descargas; se conserva la validación criptográfica `.cer` ↔ `.key`, RFC y vigencia.


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

## Prueba operativa en vivo — defectos de confianza

- **Salud Fiscal**: ninguna dimensión suma puntos por ausencia de evidencia. Nuevo motor `src/lib/salud/cobertura.ts` con cobertura mínima 50%; por debajo de ese umbral el score es `null` y la UI muestra "Sin información suficiente" (dashboard, portal y PDF). No se persisten snapshots sin score.
- **Validador CFDI**: fixtures sintéticos completos (`src/lib/demo/cfdi-fixtures.ts`). El parser extrae sello, certificado, no. de certificado y sello SAT. `risk.ts` agrega validaciones de sellado y de campos obligatorios 4.0 (Exportacion, RegimenFiscalReceptor, DomicilioFiscalReceptor, ObjetoImp). El caso "íntegro" arroja cero hallazgos; el caso "riesgo" arroja los defectos declarados. Panel de hallazgos con código y nivel, aviso de ejemplo sintético (no se guarda en expediente) y revisión 69-B de emisor/receptor.
- **Validador 69-B / EFOS**: con cero proveedores el escaneo muestra "No evaluable" en lugar de verde; los KPIs quedan en "—" y se explica cómo cargar CFDI.
- **Conti**: el botón flotante pasa de 80px/z-60 a 56px/z-30 para no tapar controles ni modales.
- **Precios**: el conteo del encabezado y el desglose por módulo se calculan del mismo subconjunto de capacidades (se excluye el módulo `plataforma`), eliminando la discrepancia 45 vs 42.

## Reconstrucción de Conti — Fase 1 (consulta, orientación y navegación)

**Problema.** Conti afirmaba un "Nivel de confianza: Alto (95–100%)" al cierre de
cada respuesta técnica. Ese porcentaje no procedía de ninguna medición: era texto
que el propio prompt le ordenaba escribir. Además mantenía su propia lista de
herramientas y rutas, podía recomendar funciones en demostración como si fueran
operativas, y recibía el contexto del expediente desde el navegador.

**Correcciones.**

1. **Modos explícitos** (`src/lib/conti/modos.ts`). Tres modos que elige la
   persona, nunca el modelo: *Guía de ContaClick*, *Consulta fiscal general* y
   *Trabajar con expediente*. El modo activo se muestra de forma permanente en el
   encabezado del chat y el modo de expediente se bloquea sin expediente activo.
2. **Eliminación de la confianza numérica** (`src/lib/conti/evidencia.ts`). Se
   suprime cualquier porcentaje de certeza que el modelo genere y se sustituye
   por el bloque **Base de la respuesta**, que declara la fuente real
   (catálogo normativo, motor determinista, registro de plataforma, criterio
   general o información insuficiente). Los porcentajes fiscales legítimos
   (16% de IVA, 10% de retención) no se tocan.
3. **Contrato de respuesta** (`src/lib/conti/contrato.ts`). Anatomía fija:
   respuesta directa, fundamento, qué hacer en ContaClick, qué falta o se supone,
   y base de la respuesta. El saneamiento se aplica en el servidor aunque el
   prompt ya lo prohíba: el prompt instruye, el código garantiza.
4. **Capacidades como única fuente de verdad** (`src/lib/conti/capacidades.ts`).
   El prompt se construye del registro central. Cada herramienta viaja con su
   madurez y su advertencia obligatoria; las obsoletas no se exponen y las
   "próximamente" no se recomiendan.
5. **Reglas fiscales de seguridad** (`src/lib/conti/normativa.ts`). Conti no
   hace aritmética fiscal: cuando se le pide una cifra, deriva al motor
   determinista sellado correspondiente y lo dice. El inventario de vigencias
   cargadas se inyecta al prompt.
6. **Aislamiento**. El navegador ya no envía el contexto del expediente, sólo su
   id. El servidor valida con `assertClienteScope` y arma el contexto desde el
   alcance verificado.
7. **Telemetría y retroalimentación**. Tablas `conti_telemetria` (modo,
   evidencia, si hubo saneamiento, si derivó a cálculo, tokens, latencia) y
   `conti_feedback` (pulgar arriba/abajo por respuesta), ambas con RLS por
   usuario. La telemetría no guarda el contenido de la conversación.
8. **Salud Fiscal — residuo detectado en la auditoría**. La dimensión Riesgo SAT
   tomaba puntos del campo `semaforo` del expediente, que puede venir de captura
   manual: un expediente vacío con semáforo verde obtenía 90/100. Ahora sólo es
   evaluable con hallazgos del motor de riesgo. Los textos "Sin alertas — buen
   estado" y "Sin hallazgos relevantes" se sustituyen por "No evaluable" cuando
   la cobertura es insuficiente.

**Verificación.** 19 pruebas permanentes en `src/lib/conti/conti.test.ts`
(saneamiento de confianza en cinco variantes, respeto a porcentajes fiscales
reales, contrato sin duplicar el bloque de evidencia, degradación de modo sin
expediente, derivación a motores deterministas con rutas existentes en el
registro, y advertencia obligatoria en toda capacidad no operativa).
Suite completa: 306 en verde.

---

## Conti — Fase 1.1: aislamiento real de modos, motores conectados y validador de grounding

**Causa del cruce de contexto.** El prompt prohibía usar el expediente en Guía y Consulta, pero el dato seguía llegando: (1) el mensaje de bienvenida del panel incluía `Expediente activo: **<razón social>**` y viajaba como turno del historial en cualquier modo; (2) el `clienteId` se enviaba siempre desde el navegador; (3) un hilo abierto en modo Expediente conservaba sus turnos al cambiar de modo. La instrucción no era una barrera.

**Payload antes / después**

| Modo | Antes | Después |
|---|---|---|
| Guía | capacidades + guías + normativa + turnos previos con razón social/RFC | capacidades + guías. Sin `clienteId`, sin RFC, sin razón social, sin régimen, sin cifras |
| Consulta | igual que Guía | sólo catálogo normativo + motores. Sin capacidades de cliente y sin expediente |
| Expediente | expediente tras `assertClienteScope` | igual, con minimización de campos (RFC, razón social, régimen, tipo de persona) |

Implementado en `src/lib/conti/contexto.ts`: `construirPayloadConti` decide qué existe, `depurarHistorial` redacta RFC/razón social/menciones al expediente en los turnos previos, y `mismaConversacion` hace del modo parte de la llave del hilo (columna `modo` en `bot_ayuda_threads`): cambiar de modo abre conversación nueva.

**Motores deterministas conectados** (`src/lib/conti/motores.ts`), vía function calling server-side: `conti_calcular_isr_pf`, `conti_calcular_isr_pm`, `conti_calcular_resico`, `conti_calcular_iva`. Cada salida devuelve entradas normalizadas, resultado, conjunto normativo, versión, hash, vigencia, fuente, verificación, fundamentos, advertencias y limitaciones. El modelo sólo explica la salida. RESICO $10,000 con retención de PM: ISR causado $100, retención $125, pago mensual $0, diferencia aritmética $25, sin concluir acreditamiento futuro, con fundamento 113-E/113-F/113-J y sin atribuir la tabla al Anexo 8.

**Validador de grounding** (`src/lib/conti/validador.ts`), aplicado antes de mostrar cualquier respuesta:
- fuga de contexto en Guía/Consulta → se rechaza y se regenera sin el contexto contaminado;
- umbral "Salud Fiscal > 80", metas de conciliación y "incidencias críticas en cero" → eliminados;
- EFOS definitivo que invalida la deducción → sustituido por materialidad/efectos/regularización;
- pagos en efectivo de $2,000 como regla general → sustituido por la dependencia del supuesto;
- pre-SUA, "Riesgo SAT = cierre seguro", Anexo 8 en RESICO, nombres internos y tokens → eliminados;
- rutas internas que no existen en el registro de capacidades → se retira el enlace;
- importes publicados sin ejecución de motor → "No calculado".

**Interfaz.** En Guía y Consulta el panel muestra "Sin expediente · este modo no utiliza datos de clientes" y una nota de que no recibe RFC ni razón social; en Expediente muestra nombre, RFC y periodo como confirmación visual del contexto. El saludo dejó de mencionar el expediente y el cambio de modo limpia la conversación.

**Salud Fiscal.** Sin cobertura mínima, las recomendaciones ya no quedan vacías: se listan las acciones necesarias para obtener cobertura, con su ruta.

**Verificación.** 331 pruebas en verde (49 de Conti, 28 nuevas de aislamiento/motores/validador). Smoke test sintético en preview con las tres consultas (cierre mensual en Guía, RESICO $10,000 en Consulta, ruta obsoleta `/app/tools/sat-risk`): ninguna mencionó expediente, RESICO ejecutó el motor y devolvió 100/125/0/25, y la ruta obsoleta se redirigió a `/app/riesgo`. No se tocaron datos, PAC, SAT ni correo reales.

**Riesgos pendientes.** El typecheck del proyecto arrastra errores previos y ajenos a este cambio en enlaces a `/auth` (parámetro `search` requerido). El modelo todavía puede proponer pasos operativos genéricos en Guía; el validador retira rutas y umbrales inventados, pero la redacción de pasos no queda sellada campo por campo.

## 2026-08-05 — Conti Fase 1.2: grounding de Guía, fundamento RESICO y Salud Fiscal

- **Fundamento RESICO**: `motores.ts` ahora describe 113-E (ingresos cobrados, tabla y cálculo mensual), 113-J (retención 1.25% considerada en el mensual) y 113-F (sólo determinación anual). Nueva regla del validador `resico_113f_mensual` sustituye cualquier texto que atribuya la resta mensual al 113-F. El resultado del motor no cambió ($100 / $125 / $0 / $25).
- **Rutas y nombres inventados**: el validador reescribe todo enlace con el nombre y la ruta registrados y devuelve `navegacion[]` con `capabilityId`, nombre, ruta y madurez; sin capabilityId la recomendación se elimina. Nueva regla `nombre_ui_inexistente` que retira módulos/pestañas/opciones/botones fuera del vocabulario registrado (p. ej. módulo "Impuestos", opción "Pagos Provisionales / Definitivos").
- **Guía sellada**: nuevo `src/lib/conti/guia.ts` con el contrato por paso (capabilityId, nombre, ruta, madurez, descripción, prerequisites, availableActions, completionCriteria, limitations, externalDependencies, evidenceSource) inyectado al modelo. `Capability.criteriosTerminacion` es la única fuente de criterios de cierre; vacío ⇒ texto obligatorio de "sin criterio automático registrado".
- **EFOS**: alcance registrado obligatorio; se sustituyen promesas de "ningún proveedor en listas negras".
- **Salud Fiscal**: la ruta faltante documental apuntaba a `/app/expedientes` (no registrada) → `/app/clientes`; la UI ya no dice "No hay acciones pendientes" sin cobertura.
- 352 pruebas en verde, 16 nuevas en `src/lib/conti/grounding.test.ts`. No se tocó aislamiento de modos, router ni cableado de motores.

## Descarga Masiva SAT — migración a SAT directo con e.firma

**Problema.** El módulo prometía descargas de "nómina, pagos y retenciones" como
si fueran servicios independientes, dependía de un PAC de pago, mezclaba la
cuota del plan con el saldo del proveedor y presentaba las corridas como
síncronas cuando el SAT responde de forma diferida.

**Corrección.**
- Proveedor principal `sat_directo` (e.firma del contribuyente, costo $0 por
  solicitud). Arquitectura de proveedores en `src/lib/sat/providers/contrato.ts`
  lista para reconectar un PAC sin tocar la UI.
- Máquina de estados explícita (`preparando → solicitando → esperando_sat →
  descargando → ingiriendo → recalculando → completada/parcial/error/vencida`)
  con idempotencia por corrida y por solicitud.
- Bóveda de e.firma v2 (AES-256-GCM con AAD ligada al expediente y rotación de
  llave). La carga exige consentimiento explícito registrado
  (`consentimiento_at/user_id/version`).
- Cuota del plan y saldo del proveedor quedaron separados; sandbox no toca
  saldo real.
- UI: sólo se solicitan **emitidos** y **recibidos**; nómina y complementos de
  pago son clasificación posterior. Retenciones se marca como pendiente. Se
  agregó "Consultar avance" y la causa/acción cuando la corrida está bloqueada.
- Se retiró `sincronizarCfdis` (ruta PAC legada); la pantalla del expediente
  ahora dirige a Descarga Masiva SAT.

**Reversión.** Volver a un PAC: registrar el proveedor en `providers/contrato.ts`
y cambiar `proveedor` en `sat_sync_config`; no se requieren cambios de esquema.

## Lector Masivo de XML — impuestos, clasificación y ZIP seguro

- Nuevo módulo puro `src/lib/cfdi/lectura-masiva.ts` (20 pruebas): desglose real
  de IVA/IEPS/otros trasladados y retenciones (ISR, IVA, otros) a nivel
  comprobante y concepto; clasificación por perspectiva del RFC activo
  (ingreso, gasto, notas de crédito, nómina, pago, otro) para que E/N/P dejen de
  sumarse como ingreso o gasto; totales netos.
- El estado nunca se infiere del XML: se muestra "No verificado ante SAT" salvo
  evidencia oficial.
- Carga de ZIP con límites de seguridad (200 MB por ZIP, 20 000 entradas, 1 GB
  descomprimido, 5 MB por XML, ratio 200) y reporte de archivos ignorados.
- `src/routes/app.tools.xml-bulk-reader.tsx` ya consume el módulo: KPIs netos,
  columnas de impuestos y clasificación, filtro por clasificación y exportes
  CSV/Excel con el desglose completo.

## Descarga Masiva SAT — cierre del ciclo asíncrono verificable

- **Ciclo asíncrono extraído a módulo puro** `src/lib/sat/ciclo-asincrono.ts`:
  solicitar → verificar → descargar → ingerir, sin base de datos y sin red.
  El orquestador de producción (`sat-directo-runner.server.ts`) ya no duplica
  esa lógica: le inyecta el cliente SAT real, el abridor de ZIP y el ingestor
  de CFDI. Las pruebas cubren exactamente el código que corre en producción.
- **Proveedor sintético** `src/lib/sat/providers/simulado.ts`: reproduce el
  comportamiento real del SAT (la solicitud NO está lista de inmediato, los
  paquetes se liberan tras N verificaciones, y una solicitud puede terminar
  vacía, con error o vencida). No es seleccionable por ningún usuario ni
  aparece en el registro de proveedores.
- **Prueba de ciclo completo** `src/lib/sat/ciclo-asincrono.test.ts` (9 casos):
  una solicitud aceptada no se da por descargada; el ciclo completo llega a
  `completada` con cobertura total; volver a cosechar no vuelve a descargar
  paquetes ni duplica XML; cobertura parcial cuando una dirección falla;
  periodo sin comprobantes = completada con cero (no error); solicitud vencida;
  duplicados entre paquetes; XML ilegible contabilizado como rechazado;
  agotamiento de reintentos.
- **No hay regresión de estado**: `guardarAvanceCorrida` sólo escribe sobre
  corridas activas, así una corrida terminal nunca se reabre ni se reescribe.
- **Candado entre trabajadores**: el cron reclama cada corrida antes de
  cosecharla (ventana de 3 minutos), evitando que dos ejecuciones simultáneas
  descarguen e ingieran el mismo paquete.
- Suite completa: 385 pruebas en verde.

## 2026-08-08 · Descarga SAT: cosecha observable y reintento manual

- **Cron de cosecha corregido y acelerado.** La tarea programada `sat-sync-hourly`
  apuntaba a `abogaclick.com.mx` (dominio equivocado) y enviaba la cabecera
  `apikey` vacía, por lo que **nunca cosechó una sola corrida**: todo el avance
  dependía del botón "Consultar avance". Se reemplazó por `sat-sync-10min`,
  con la URL estable del proyecto, la llave correcta y frecuencia `*/10 * * * *`.
- **Reintento manual de corridas detenidas.** Nuevo `reabrirSolicitudes()`
  (módulo puro) + `reintentarCorrida()` (servidor) + botón "Reintentar" en la
  lista de corridas de `/app/sat-sync` para estados `error`, `parcial` y `vencida`.
  Reabre sólo lo que el SAT todavía puede entregar (folio vivo y código
  reintentable), conserva intacto lo ya descargado y reporta como irrecuperable
  lo vencido (5011) o rechazado de origen (5001/5002/5003), exigiendo corrida nueva.
- Pruebas: `src/lib/sat/reintento.test.ts` (7 casos).

## Conexión de e.firma accesible desde /app/sat-sync

- **Síntoma**: el aviso "este expediente no tiene una e.firma activa" no ofrecía ninguna acción; el formulario existía sólo dentro del detalle del expediente.
- **Corrección**: nueva tarjeta reutilizable `src/components/EFirmaCard.tsx` ("Conexión con el SAT mediante e.firma") mostrada en Descarga Masiva SAT y en el expediente; el aviso rojo ahora incluye el botón "Conectar e.firma ahora".
- **Formulario**: valida extensión y tamaño, la contraseña vive sólo en el input (nunca en estado, caché ni almacenamiento), se limpia al enviar, botón bloqueado durante la validación y sin doble envío.
- **Validación server-side** (`src/lib/sat/efirma-validacion.server.ts`): legibilidad del .cer, apertura del .key con contraseña, correspondencia criptográfica llave↔certificado, RFC igual al del expediente, vigencia y descarte de CSD. Falla cerrado con mensajes diferenciados y sin detalle técnico.
- **Alcance y bitácora**: `conectarSat` y `desconectarSat` ahora pasan por `assertClienteScope` y registran `sat.efirma.conectar/reemplazar/eliminar` en `audit_logs` sin secretos. Se conserva la bóveda AES-256-GCM v2 con AAD y versión de llave.

## SAT Sync — corrida atorada en "solicitando" y e.firma "inactiva" tras conectar

**Síntoma (prueba controlada en vivo):** con la e.firma mostrada como *Conectado*,
la corrida manual devolvía un error genérico, quedaba creada en `solicitando`,
la misma pantalla afirmaba después que el expediente *no tenía e.firma activa*,
y a los 52 minutos seguía viva: el cron no la recuperaba y el candado impedía
crear otra sin ofrecer una salida segura.

**Causas reales**
1. El runner consultaba `sat_credenciales.rfc` (columna inexistente: es `efirma_rfc`),
   por lo que la lectura devolvía nulo y el flujo concluía "sin e.firma".
2. El AAD de descifrado se armaba con ese RFC nulo, así que ni con la columna
   correcta habría abierto la llave: la validación al conectar y la validación al
   ejecutar eran caminos distintos (divergencia de preflight).
3. La excepción ocurría después del INSERT de la corrida, dejándola huérfana en
   `solicitando`; el cosechador ignora corridas sin folio, así que nadie la cerraba.

**Correcciones**
- `src/lib/sat/credencial.server.ts`: fuente única de verdad de la e.firma
  (existencia, vigencia, coincidencia de RFC y verificación real de descifrado).
  La tarjeta de conexión, el preflight y el runner leen de aquí.
- Preflight completo en `runSyncNow` **antes** de insertar la corrida: si la
  e.firma no es utilizable no se crea corrida, no se consume cuota, no hay candado
  y no se contacta al SAT.
- `runSyncNow` ya no lanza errores genéricos: devuelve `{ ok:false, error }` con
  etapa, código, mensaje, acción y si hubo o no solicitud enviada; toda excepción
  posterior al INSERT cierra la corrida y devuelve la reserva no consumida.
- `src/lib/sat/saneamiento.ts` / `.server.ts`: barrido que cierra como
  `error_inicio_incompleto` las corridas con más de 15 minutos en `solicitando`
  sin folio SAT, y reencauza a `esperando_sat` las que sí lo tienen. Se ejecuta
  al inicio de cada cron, antes de cosechar.
- `cerrarCorridaSat`: salida manual segura (sólo sin folio SAT, o con folio pero
  abandonada más de 24 h), con registro en bitácora de auditoría.
- UI `/app/sat-sync`: el panel de estado indica si la corrida tiene folio del SAT,
  explica por qué se puede o no cerrar y ofrece el botón "Cerrar corrida atorada".
  El mensaje de e.firma distingue "nunca conectada" de "conectada pero no usable".
- Pruebas: `src/lib/sat/saneamiento.test.ts` (6 casos) fija que nunca se reenvía
  al SAT una solicitud cuyo destino se desconoce.

## 2026-08-08 — Barrido automático SAT no cerraba corridas atoradas
**Causa raíz:** la consulta del saneamiento pedía la columna `created_at`, que no existe en `sat_sync_runs`. PostgREST devolvía error, el código sólo leía `data` (que quedaba vacío) y el barrido reportaba "0 revisadas" con éxito aparente. Por eso una corrida estuvo 11 horas en `solicitando`.
**Cómo se demostró:** dos corridas sintéticas (proveedor `sintetico`, sin contacto con el SAT) sobrevivieron a los ciclos reales del cron de las 17:50 y 18:00 UTC con `runs_revisados = 0`.
**Corrección:** se quitó la columna inexistente, y ahora un error de lectura se lanza y queda registrado en el heartbeat en vez de silenciarse.
**Observabilidad nueva:** tabla `sat_cron_heartbeat` (una fila por ejecución, aunque no haya trabajo), sello de versión desplegada y panel de salud en Saldo PAC SAT.
**Sin efectos colaterales:** saldo PAC 0/0 y cuota del despacho en 0 antes y después.

### Verificación en ciclo real del cron (2026-08-08 18:40 UTC)
Prueba con expediente y corridas sintéticas (proveedor `sintetico`), sin e.firma real
y sin contacto con el SAT. Datos anonimizados.

| Elemento | Antes | Después del ciclo 18:40 UTC |
|---|---|---|
| Corrida **sin folio** (16:25 UTC) | `solicitando` / `en_curso` | `error` / `error`, cobertura `nula`, cerrada 18:40:02, código `error_inicio_incompleto` |
| Corrida **con folio simulado** (16:20 UTC) | `solicitando` / `en_curso` | `esperando_sat`, folio conservado, sin reenvío |

- **Heartbeat 18:40:02 UTC:** `ok = true`, HTTP 200, duración 767 ms.
- **Métricas:** `runs_revisados = 2`, `runs_saneados = 1`, `runs_reencauzados = 1`.
- **Versión desplegada:** `sat-cron-2026.08.08b-fix-columna-created_at` (coincide con la esperada).
- **Sin contacto con el SAT:** `solicitudes_consultadas = 0`, `paquetes_descargados = 0`,
  `corridas_iniciadas = 0`, y cero eventos de sincronización en las últimas 3 horas.
- **Cuota y saldo sin cambios:** saldo PAC 0 disponible / 0 reservado (última modificación
  25-jun-2026); consumo del periodo sin variación (último cambio 04:51 UTC, previo a la prueba);
  cero movimientos en el libro PAC durante la ventana de prueba.
- **Limpieza:** el expediente y las dos corridas sintéticas se eliminaron al validar
  ambas transiciones; ningún dato real fue tocado.

## 2026-08-08 — Causa funcional del rechazo SAT 301 (Descarga Masiva)

**Corrida rechazada (anonimizada):** dirección `recibidos`, `TipoSolicitud="CFDI"`,
rango 2026-08-01..2026-08-03, sin folio SAT. Respuesta: `301 XML Mal Formado:
La solicitud de descarga no es válida. No se permite la descarga de xml que se
encuentren cancelados.`

**Causa:** el constructor anterior no emitía el atributo `EstadoComprobante`.
Al omitirse, el servicio asume `Todos` (incluye cancelados) y, para
`TipoSolicitud=CFDI` recibidos, lo rechaza de forma terminal.

Request saneado ANTERIOR (sin sello/certificado/token):
`<des:solicitud xmlns:des="http://DescargaMasivaTerceros.sat.gob.mx"
FechaFinal="2026-08-03T23:59:59" FechaInicial="2026-08-01T00:00:00"
RfcReceptor="XXX010101XXX" RfcSolicitante="XXX010101XXX" TipoSolicitud="CFDI"/>`

Request saneado POSTERIOR:
`<des:solicitud xmlns:des="http://DescargaMasivaTerceros.sat.gob.mx"
EstadoComprobante="Vigente" FechaFinal="2026-08-03T23:59:59"
FechaInicial="2026-08-01T00:00:00" RfcReceptor="XXX010101XXX"
RfcSolicitante="XXX010101XXX" TipoSolicitud="CFDI">
<Signature>[OMITIDA]</Signature></des:solicitud>`

**Correcciones:** `src/lib/sat/solicitud-xml.ts` (constructor tipado) más
`src/lib/sat/contrato-wsdl.ts` (validación WSDL/XSD local previa al sellado:
atributos declarados, enumerados, patrones RFC/fecha, orden alfabético y
combinaciones prohibidas CFDI+Cancelado/Todos).

**Pruebas:** `solicitud-xml.test.ts` (falla con el payload anterior) y
`solicitud-transporte.test.ts` (transporte simulado: 5000+folio → pendiente /
esperando_sat; recibidos cancelados → rechazo local sin firma ni red; 301 →
error terminal sin reintento). Total: 423 pruebas en verde.
Sin e.firma real y sin contacto con el SAT.

## 2026-08-09 — Trazabilidad operativa de SAT Sync

**Síntoma.** Una corrida real terminaba en "completada" sin poder responder qué
trajo: no había forma de ver folios, paquetes ni los comprobantes ingresados, y
el rechazo de la corrida aparecía en la tarjeta de e.firma como si el
certificado estuviera roto.

**Causa.** Los XML se guardaban sin linaje (no existía vínculo con la corrida,
la solicitud ni el paquete), los recálculos posteriores no dejaban evidencia y
la UI leía `last_error` de la credencial sin distinguir su origen.

**Corrección.**
- Columnas de linaje en `cfdi_xml`: `origen`, `proveedor`, `sat_run_id`,
  `sat_solicitud_id`, `sat_paquete_id`, `validacion` (+ índices de consulta).
- `ingestOneInternal` acepta y persiste el linaje; el runner registra un evento
  por documento (`nuevo`, `duplicado`, `rechazado`) ligado a la corrida.
- Estado `recalculando`: una corrida con comprobantes nuevos ya no puede
  cerrarse como completada sin evidencia de los recálculos
  (`cerrarTrasRecalculo`). Cada módulo deja `recalculo_ok` / `recalculo_fallido`.
- Nuevo `detalleCorrida`: identificación, folios y códigos del SAT, paquetes,
  comprobantes clasificados (ingreso/gasto/nómina/pago) y recálculos. UUID,
  RFC y referencias de paquete se muestran enmascarados; el alcance sigue
  acotado por `assertClienteScope`.
- Módulo puro `src/lib/sat/linaje.ts` con el criterio ÚNICO de reintento
  (servidor y UI) y la separación entre errores de credencial y de corrida.
  Un rechazo terminal (familia 3xx) ya no ofrece "Reintentar" y explica por qué.
- `EFirmaCard` sólo muestra fallos del certificado; los errores de corrida
  quedaron en SAT Sync.

**Pruebas.** `src/lib/sat/linaje.test.ts` (14 casos) + suite completa: 437 pasan.

**Verificación de la corrida real** (anonimizada): corrida `c80cbaa3…`,
1 comprobante `BCDD4B19…4703`. Se reconstruyó su linaje (proveedor
`sat_directo`, paquete `58F4A014…_01`) y se registró el evento correspondiente.
No se contactó al SAT ni se usó la e.firma real.

## 2026-08-08 · Contradicciones en el detalle de la corrida SAT (c80cbaa3)

**Síntomas:** el detalle mostraba "1 paquete" y a la vez "Sin paquetes entregados";
un XML nuevo con "Sin recálculos registrados: esta corrida no trajo comprobantes nuevos".

**Causas reales**
1. `detalleCorrida` leía `solicitud.paquetes`, pero el ciclo guarda
   `paquetes_encontrados` / `paquetes_procesados`. Lista vacía frente a un contador > 0.
2. El texto de recálculos era fijo en la UI y no dependía de `nuevos`.
   La corrida se cosechó antes del despliegue de linaje, así que no tiene eventos.
3. El comprobante real es tipo **I** recibido → Gasto (clasificación correcta).
   Total $0.00 es real: SubTotal 0.01 con Descuento 0.01, UsoCFDI S01.

**Correcciones**
- Nuevo módulo puro `src/lib/sat/procesamiento.ts`: fuente única de paquetes,
  complementos, evaluación de procesamiento posterior y estado/cobertura honestos.
- `detalleCorrida`: paquetes desde solicitudes + linaje de los XML; documentos con
  tipo, complementos, moneda, RFC enmascarados y enlace al comprobante;
  `estado_honesto` y cobertura derivados de la evidencia.
- Nueva acción `completarProcesamiento` (idempotente, sin SAT, sin cuota, sin PAC).
- `CorridaDetalle.tsx`: mensajes provenientes del servidor + botón de recuperación.
- 28 regresiones nuevas en `src/lib/sat/procesamiento.test.ts`.

## 2026-08-09 · "Completar procesamiento posterior" reportaba éxito sin evidencia

**Síntoma real.** La acción devolvía "procesamiento posterior completado", actualizaba
`detalle`/`finalizado_at` y dejaba la corrida en *Procesamiento pendiente*, sin ningún
evento por módulo y con el botón todavía disponible.

**Causa raíz (dos fallos encadenados).**
1. Los eventos se escribían en `sat_sync_eventos`, cuyo `CHECK` sólo admite
   `nuevo | cancelado | sustituido | duplicado | sospechoso | error`: todo
   `recalculo_ok` era rechazado. El `insert` estaba dentro de un `try/catch`
   que sólo hacía `console.warn`, así que el fallo era invisible.
2. El cierre escribía `cobertura = 'pendiente de procesamiento'` y estados
   inexistentes, valores que las restricciones de `sat_sync_runs` rechazan
   (`cobertura ∈ total|parcial|nula`, `estado ∈ …|recalculando|completada|…`).

**Corrección.**
- Bitácora dedicada `sat_procesamiento_eventos` (uno por módulo y corrida) con
  ciclo `iniciado → completado|omitido|fallido`, `idempotency_key` única,
  `resultado`, `motivo` y marcas de tiempo.
- `src/lib/sat/procesamiento.server.ts`: ejecutor único. Abre el evento antes
  de correr el módulo (el choque de llave única es el candado contra doble
  clic), y si la evidencia no puede persistirse revierte el intento y **falla**
  en vez de declarar éxito. El estado final siempre se relee de la base.
- `evaluarProcesamiento` deriva estado, cobertura, mensaje y **etiqueta del
  botón** ("Completar procesamiento posterior" / "Reanudar procesamiento") sólo
  de esos eventos. Una omisión sin motivo no cuenta como evidencia.
- `finalizado_at` sólo se fija cuando el procesamiento es terminal; los estados
  se traducen a valores válidos de la columna antes de escribir.
- UI: tabla Módulo | Estado | Inicio | Fin | Resultado en el detalle.
- Corrida real `c80cbaa3…`: se corrigió el texto engañoso y quedó marcada como
  pendiente de procesamiento. No se ejecutaron módulos, no se contactó al SAT,
  no se usó la e.firma y no se consumió cuota ni PAC.
- 39 regresiones en `src/lib/sat/procesamiento.test.ts` (483 en total, verde).

## 2026-08-08 · Segundo falso positivo de procesamiento SAT en producción

**Síntoma real.** A las 15:07 (México) la acción volvió a mostrar éxito, actualizó
`finalizado_at` y el texto legado, pero el detalle reabierto mostró cero recibos y
cuatro módulos faltantes; Actividad seguía mostrando *Completada*.

**Causa comprobada.** La petición fue atendida por el contrato legado desplegado:
el registro de auditoría `2523` conserva la forma antigua (`ok` por módulo, sin
`execution_id` ni versión) y `sat_procesamiento_eventos` quedó con cero filas. Ese
contrato ejecutaba módulos en memoria, declaraba éxito sin una relectura de recibos
y la UI mostraba `toast.success` para cualquier respuesta resuelta. Actividad y KPI
consultaban directamente `sat_sync_runs.estado`, mientras el detalle ya calculaba
`estado_honesto` desde recibos, creando dos fuentes de verdad.

**Efecto comprobado.** Salud Fiscal sí reemplazó el snapshot del periodo a las
21:07:43Z. No existe evidencia inequívoca de escritura para Riesgo, Auditor CFDI o
EFOS, que son módulos de lectura. No se volvió a ejecutar la corrida para auditarla.

**Endurecimiento.** Versión `sat-processing-2026.08.08.2` / protocolo `v2`:
- correlación por `execution_id` e índice de soporte;
- error obligatorio ante cero recibos después de ejecutar;
- no se actualiza resumen/fin antes de verificar recibos terminales;
- DTO estructurado con completados, omitidos, fallidos, pendientes, estado y cobertura;
- UI rechaza `ok=false` y muestra una versión no sensible;
- Actividad, detalle y última sincronización proyectan la misma evaluación honesta;
- botón bloqueado hasta completar una prueba sintética desplegada con sesión autorizada.

**Validación disponible.** 56 pruebas SAT y typecheck en verde. La prueba E2E
autenticada quedó pendiente porque el entorno de verificación no tenía sesión; por
lo tanto no se declaró resuelto ni se autorizó al usuario a pulsar.

## 2026-08-08 — Causa raíz real: bitácora de procesamiento sin permisos de tabla
- **Síntoma:** `sat_procesamiento_eventos` siempre con 0 filas; el botón "Completar procesamiento posterior" reportaba éxito pero el detalle seguía "pendiente".
- **Diagnóstico:** la tabla se creó con RLS y políticas correctas, pero **sin ningún GRANT**. Sin privilegios de tabla, PostgREST rechaza la escritura antes de evaluar RLS, así que ningún recibo podía persistirse jamás — con independencia de la versión de código desplegada.
- **Corrección:** migración con `GRANT SELECT, INSERT, UPDATE ... TO authenticated` y `GRANT ALL ... TO service_role`. Verificado con `has_table_privilege` y auditadas todas las tablas públicas (ninguna otra sin grants).
- **Efecto:** el botón se libera de nuevo; la ejecución sigue siendo idempotente, con candado por módulo y reconstrucción de recibo cuando ya existen resultados (no se reejecutan módulos ni se contacta al SAT).

## Corrida SAT 2026-07-29 → 2026-08-01 · linaje roto y métricas contradictorias
- **Causa raíz**: la cosecha manual llamaba `cosecharCorrida` sin `runId`; los 8 XML se guardaron en el expediente con `sat_run_id` nulo, así que el detalle decía "0 de 8" y "no incorporó comprobantes" con estado completada y cobertura total.
- **Correcciones**: `runId` obligatorio en toda ruta de cosecha; métricas reconstruidas desde evidencia (`src/lib/sat/metricas.ts`) con contadores inequívocos (entregados/nuevos/duplicados/rechazados/vinculados/visibles); acción explícita "Reconciliar linaje" (idempotente, sin contactar al SAT ni modificar XML); UUID canónico en mayúsculas al ingerir + índice único insensible a mayúsculas para que un periodo solapado cuente duplicado y no cree fila nueva; Salud Fiscal y Auditor ya no imprimen `[object Object]` y el Auditor declara su alcance; confirmación previa al envío con direcciones, periodo y días inclusivos.
- **Pruebas**: 15 nuevas en `src/lib/sat/metricas.test.ts` (161 en verde).
