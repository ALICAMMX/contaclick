import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Check, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { listAlertas, marcarAlertaLeida, marcarTodasLeidas, type AlertaItem } from "@/lib/alertas/alertas.functions";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

function nivelIcon(nivel: AlertaItem["nivel"]) {
  if (nivel === "alto") return <AlertCircle className="h-4 w-4 text-destructive shrink-0" />;
  if (nivel === "medio") return <AlertTriangle className="h-4 w-4 text-warning shrink-0" />;
  return <Info className="h-4 w-4 text-muted-foreground shrink-0" />;
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const fnList = useServerFn(listAlertas);
  const fnLeer = useServerFn(marcarAlertaLeida);
  const fnLeerTodas = useServerFn(marcarTodasLeidas);

  const q = useQuery({
    queryKey: ["alertas", "abiertas"],
    queryFn: () => fnList(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const mLeer = useMutation({
    mutationFn: (id: string) => fnLeer({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alertas"] }),
  });
  const mLeerTodas = useMutation({
    mutationFn: () => fnLeerTodas(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alertas"] }),
  });

  const total = q.data?.total ?? 0;
  const alertas = q.data?.alertas ?? [];

  // Keyboard shortcut: "n" abre/cierra
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "n" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          title="Notificaciones"
          className="relative h-9 w-9 rounded-md border border-border bg-card hover:bg-accent grid place-items-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <Bell className="h-4 w-4" />
          {total > 0 && (
            <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold grid place-items-center">
              {total > 9 ? "9+" : total}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <div className="text-sm font-semibold">Notificaciones</div>
          {total > 0 && (
            <button
              onClick={() => mLeerTodas.mutate()}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Marcar todas
            </button>
          )}
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {q.isLoading ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">Cargando…</div>
          ) : alertas.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <Check className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              <div className="text-sm text-muted-foreground">Sin alertas abiertas</div>
              <div className="text-xs text-muted-foreground/70 mt-1">Los agentes IA avisarán aquí.</div>
            </div>
          ) : (
            alertas.map((a) => (
              <div key={a.id} className="px-3 py-2.5 border-b border-border/60 last:border-b-0 hover:bg-accent/50 group">
                <div className="flex items-start gap-2">
                  {nivelIcon(a.nivel)}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium leading-tight">{a.titulo}</div>
                    {a.descripcion && (
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{a.descripcion}</div>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
                      <span>{timeAgo(a.created_at)}</span>
                      {a.cliente_id && a.cliente_nombre && (
                        <>
                          <span>·</span>
                          <Link
                            to="/app/clientes/$id"
                            params={{ id: a.cliente_id }}
                            onClick={() => setOpen(false)}
                            className="hover:text-foreground hover:underline truncate"
                          >
                            {a.cliente_nombre}
                          </Link>
                        </>
                      )}
                      {a.tipo === "uso_limite" && (
                        <>
                          <span>·</span>
                          <Link
                            to="/precios"
                            onClick={() => setOpen(false)}
                            className="text-primary hover:underline"
                          >
                            Mejorar plan
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => mLeer.mutate(a.id)}
                    title="Marcar como leída"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="px-3 py-2 border-t border-border bg-muted/30">
          <Button variant="ghost" size="sm" asChild className="w-full justify-center h-7 text-xs">
            <Link to="/app/clientes" onClick={() => setOpen(false)}>Ver expedientes</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
