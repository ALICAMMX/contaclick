import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/registro")({
  validateSearch: (s: Record<string, unknown>) =>
    z.object({ next: z.string().optional() }).parse(s),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/auth", search: { next: search.next } });
  },
});
