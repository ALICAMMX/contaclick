import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { resolveActiveCliente } from "@/lib/clientes.functions";

export type ActiveCliente = {
  id: string;
  rfc: string;
  razon_social: string;
  regimen_fiscal?: string | null;
} | null;

type Ctx = {
  cliente: ActiveCliente;
  /** true mientras se re-resuelve el expediente persistido al cargar la app. */
  hydrating: boolean;
  setCliente: (c: ActiveCliente) => void;
  clear: () => void;
};

const ActiveCtx = createContext<Ctx | null>(null);
const STORAGE_KEY = "cc.activeCliente";

export function ActiveClienteProvider({ children }: { children: ReactNode }) {
  const [cliente, setClienteState] = useState<ActiveCliente>(null);
  const [hydrating, setHydrating] = useState(true);
  const resolveCliente = useServerFn(resolveActiveCliente);
  const queryClient = useQueryClient();

  // Identidad estable del server fn para no re-disparar efectos en cada render.
  const resolveRef = useRef(resolveCliente);
  resolveRef.current = resolveCliente;

  // Aislamiento: al cambiar de expediente se descarta TODA la caché de datos
  // para que ninguna pantalla muestre información del expediente anterior.
  const previousId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const id = cliente?.id ?? null;
    if (previousId.current !== undefined && previousId.current !== id) {
      queryClient.cancelQueries();
      queryClient.clear();
    }
    previousId.current = id;
  }, [cliente?.id, queryClient]);

  const setCliente = useCallback((c: ActiveCliente) => {
    setClienteState(c);
    try {
      // Solo guardamos el id en localStorage. El RFC, razón social y régimen
      // fiscal son datos sensibles y se re-resuelven server-side en cada carga.
      if (c?.id) localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: c.id }));
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  }, []);

  // Hidratación inicial: leer solo el id persistido y resolver server-side.
  useEffect(() => {
    let alive = true;
    let pending = false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as { id?: string }) : null;
      const id = parsed?.id;
      if (!id) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        pending = true;
        resolveRef.current({ data: { id } })
          .then((resolved) => {
            if (!alive) return;
            if (resolved) {
              previousId.current = resolved.id;
              setClienteState({
                id: resolved.id,
                rfc: resolved.rfc,
                razon_social: resolved.razon_social,
                regimen_fiscal: resolved.regimen_fiscal,
              });
            } else {
              try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
            }
          })
          .catch(() => { /* sin red / sin sesión: no hidratar */ })
          .finally(() => { if (alive) setHydrating(false); });
      }
    } catch {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }
    if (!pending) setHydrating(false);
    return () => { alive = false; };
  }, []);

  // Revalidación server-side cada vez que cambia el expediente seleccionado.
  // Si el usuario perdió el acceso, se limpia (fail-closed).
  const revalidatedFor = useRef<string | null>(null);
  useEffect(() => {
    const id = cliente?.id ?? null;
    if (!id || revalidatedFor.current === id) return;
    revalidatedFor.current = id;
    let alive = true;
    resolveRef.current({ data: { id } })
      .then((resolved) => {
        if (!alive) return;
        if (!resolved) { setCliente(null); return; }
        setClienteState((prev) =>
          prev && prev.id === resolved.id && prev.rfc === resolved.rfc && prev.razon_social === resolved.razon_social
            ? prev
            : { id: resolved.id, rfc: resolved.rfc, razon_social: resolved.razon_social, regimen_fiscal: resolved.regimen_fiscal },
        );
      })
      .catch(() => { /* conservar estado local si no se puede validar */ });
    return () => { alive = false; };
  }, [cliente?.id, setCliente]);

  const value = useMemo<Ctx>(
    () => ({ cliente, hydrating, setCliente, clear: () => setCliente(null) }),
    [cliente, hydrating, setCliente],
  );
  return <ActiveCtx.Provider value={value}>{children}</ActiveCtx.Provider>;
}

export function useActiveCliente() {
  const ctx = useContext(ActiveCtx);
  if (!ctx) throw new Error("useActiveCliente must be used inside ActiveClienteProvider");
  return ctx;
}


/**
 * Congela el expediente activo al montarse el componente. Permite detectar si
 * el usuario cambió de expediente a mitad de una operación larga (subir XML,
 * conciliar, etc.) y abortar antes de mezclar contabilidades.
 *
 * Uso:
 *   const frozen = useFrozenCliente();
 *   frozen.assertSame(); // throw si el activo cambió
 */
export function useFrozenCliente() {
  const { cliente } = useActiveCliente();
  const [frozen] = useState<ActiveCliente>(cliente);
  const currentMatches = !!frozen && frozen.id === cliente?.id;
  const assertSame = useCallback(() => {
    if (!frozen) {
      throw new Error("No había expediente activo cuando inició la operación.");
    }
    if (!cliente || cliente.id !== frozen.id) {
      throw new Error(
        `El expediente activo cambió durante la operación (de ${frozen.rfc} a ${cliente?.rfc ?? "ninguno"}). Para evitar mezclar contabilidades, la acción fue cancelada. Vuelve al expediente ${frozen.rfc} y reintenta.`,
      );
    }
  }, [frozen, cliente]);
  return { frozen, current: cliente, currentMatches, assertSame };
}

