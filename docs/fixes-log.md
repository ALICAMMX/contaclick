
## Reporte ejecutivo cortado y PDF sin descarga
- Problema: el diálogo del reporte ejecutivo podía cortar visualmente contenido largo por layout con overflow; el botón PDF no siempre descargaba por usar guardado directo del generador PDF; algunos generadores IA podían aceptar salidas incompletas/truncadas o fallar en silencio.
- Corrección: diálogo con scroll real, descarga centralizada por Blob, exportación PDF validada en navegador, límites IA ampliados, rechazo explícito de respuestas IA incompletas, sin recortes silenciosos de hallazgos/recomendaciones, captura de error al guardar recomendaciones.
- Corrección global: reportes PDF/Excel/CSV usan descarga robusta, PDF ejecutivo evita fuentes/estilos que renderizaban mal, otros generadores de reportes recibieron límites IA más seguros y guardas contra exportaciones vacías o incompletas.
