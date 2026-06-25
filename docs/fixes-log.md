
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
