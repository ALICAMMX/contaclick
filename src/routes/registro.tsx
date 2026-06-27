import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/registro")({
  beforeLoad: () => {
    throw redirect({ to: "/auth" });
  },
});
