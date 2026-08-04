// Hook único de entitlements para el frontend. Ningún componente debe volver
// a calcular trials, planes ni límites: todos leen de aquí.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMisEntitlements, puedeCrearExpediente } from "./entitlements.functions";

export function useEntitlements() {
  const fetchEnt = useServerFn(getMisEntitlements);
  const q = useQuery({
    queryKey: ["entitlements"],
    queryFn: () => fetchEnt(),
    staleTime: 60_000,
    retry: 1,
  });

  const ent = q.data ?? null;
  return {
    ...q,
    ent,
    /** La cuenta puede operar. Mientras carga asumimos que sí (evita parpadeos). */
    acceso: ent ? ent.acceso : true,
    bloqueada: ent ? !ent.acceso : false,
    motivoBloqueo: ent?.motivo_bloqueo ?? null,
    /** Días de prueba restantes; null cuando ya hay plan contratado. */
    diasTrial: ent?.trial?.dias_restantes ?? null,
    enTrial: !!ent?.trial?.activo,
    plan: ent?.plan ?? null,
    limites: ent?.limites ?? null,
    uso: ent?.uso ?? null,
    medidores: ent?.medidores ?? [],
  };
}

export function usePuedeCrearExpediente() {
  const fetchPuede = useServerFn(puedeCrearExpediente);
  return useQuery({
    queryKey: ["entitlements", "puede-crear-expediente"],
    queryFn: () => fetchPuede(),
    staleTime: 30_000,
  });
}
