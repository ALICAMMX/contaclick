import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setClienteState(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const setCliente = useCallback((c: ActiveCliente) => {
    setClienteState(c);
    try {
      if (c) localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  }, []);

  const value = useMemo<Ctx>(() => ({ cliente, setCliente, clear: () => setCliente(null) }), [cliente, setCliente]);
  return <ActiveCtx.Provider value={value}>{children}</ActiveCtx.Provider>;
}

export function useActiveCliente() {
  const ctx = useContext(ActiveCtx);
  if (!ctx) throw new Error("useActiveCliente must be used inside ActiveClienteProvider");
  return ctx;
}
