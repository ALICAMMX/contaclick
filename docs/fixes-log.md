
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
