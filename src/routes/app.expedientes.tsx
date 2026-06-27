import { createFileRoute, Navigate } from "@tanstack/react-router";

// Vista unificada: /app/expedientes ahora redirige a /app/clientes
// para evitar dos experiencias paralelas sobre la misma entidad.
export const Route = createFileRoute("/app/expedientes")({
  component: () => <Navigate to="/app/clientes" replace />,
});
