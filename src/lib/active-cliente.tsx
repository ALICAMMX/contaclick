import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { resolveActiveCliente } from "@/lib/clientes.functions";

export type ActiveCliente = {
  id: string;
  rfc: string;
  razon_social: string;
  regimen_fiscal?: string | null;
} | null;

type Ctx = {
  cliente: ActiveCliente;
  setCliente: (c: ActiveCliente) => void;
  clear: () => void;
};

const ActiveCtx = createContext<Ctx | null>(null);
const STORAGE_KEY = "cc.activeCliente";

export function ActiveClienteProvider({ children }: { children: ReactNode }) {
  const [cliente, setClienteState] = useState<ActiveCliente>(null);
  const resolveCliente = useServerFn(resolveActiveCliente);

  const setCliente = useCallback((c: ActiveCliente) => {
    setClienteState(c);
    try {
      if (c) localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setClienteState(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!cliente?.id) return;
    let alive = true;
    resolveCliente({ data: { id: cliente.id } })
      .then((resolved) => {
        if (!alive) return;
        const next = resolved
          ? { id: resolved.id, rfc: resolved.rfc, razon_social: resolved.razon_social, regimen_fiscal: resolved.regimen_fiscal }
          : null;
        if (JSON.stringify(next) !== JSON.stringify(cliente)) setCliente(next);
      })
      .catch(() => { /* si no puede validar, conserva el estado local */ });
    return () => { alive = false; };
  }, [cliente, resolveCliente, setCliente]);

  const value = useMemo<Ctx>(() => ({ cliente, setCliente, clear: () => setCliente(null) }), [cliente, setCliente]);
  return <ActiveCtx.Provider value={value}>{children}</ActiveCtx.Provider>;
}

export function useActiveCliente() {
  const ctx = useContext(ActiveCtx);
  if (!ctx) throw new Error("useActiveCliente must be used inside ActiveClienteProvider");
  return ctx;
}
