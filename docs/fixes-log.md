
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
