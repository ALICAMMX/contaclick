import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/administrativo")({
  beforeLoad: () => {
    throw redirect({ to: "/app/admin" });
  },
});
