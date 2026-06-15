import { createFileRoute, redirect } from "@tanstack/react-router";

// El conciliador funcional vive en /app/conciliacion. Esta ruta queda como alias.
export const Route = createFileRoute("/app/tools/bank-reconciler")({
  beforeLoad: () => {
    throw redirect({ to: "/app/conciliacion" });
  },
});
