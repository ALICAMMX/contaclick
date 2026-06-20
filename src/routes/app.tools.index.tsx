import { createFileRoute, redirect } from "@tanstack/react-router";

// El catálogo único de herramientas vive en /app/contable.
// /app/tools se mantiene solo como host de las páginas de cada herramienta.
export const Route = createFileRoute("/app/tools/")({
  beforeLoad: () => {
    throw redirect({ to: "/app/contable" });
  },
});
