import { createFileRoute, Outlet } from "@tanstack/react-router";
export const Route = createFileRoute("/app/legal")({ component: () => <Outlet /> });
