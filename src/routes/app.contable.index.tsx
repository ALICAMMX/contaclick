import { createFileRoute, Navigate } from "@tanstack/react-router";
export const Route = createFileRoute("/app/contable/")({ component: () => <Navigate to="/app/contable/herramientas" /> });
