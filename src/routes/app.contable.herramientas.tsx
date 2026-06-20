import { createFileRoute, redirect } from "@tanstack/react-router";

// Catálogo legacy — redirige al único catálogo en /app/contable.
export const Route = createFileRoute("/app/contable/herramientas")({
  beforeLoad: () => {
    throw redirect({ to: "/app/contable" });
  },
});
