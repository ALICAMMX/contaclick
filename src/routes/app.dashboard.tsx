import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/app/dashboard")({
  component: () => <Navigate to="/app/despacho" replace />,
});
