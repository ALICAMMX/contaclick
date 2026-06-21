import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/app/tools/sat-risk")({
  component: () => <Navigate to="/app/riesgo" replace />,
});
