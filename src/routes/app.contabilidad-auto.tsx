import { createFileRoute, Navigate } from "@tanstack/react-router";

// Contabilidad automática quedó unificada en /app/polizas: un solo generador
// de pólizas por CFDI (sin duplicados), con las pestañas de Bancos, Catálogo,
// Reglas y Exportar (CONTPAQi, Aspel COI, Anexo 24) en la misma pantalla.
export const Route = createFileRoute("/app/contabilidad-auto")({
  component: () => <Navigate to="/app/polizas" replace />,
});
