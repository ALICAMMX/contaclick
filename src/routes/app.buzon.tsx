import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/app/buzon")({
  component: () => <Navigate to="/app/admin/buzon" replace />,
});
