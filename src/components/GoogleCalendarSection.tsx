import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Calendar, Loader2, Link2, Unplug, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getGoogleStatus,
  startGoogleAuth,
  disconnectGoogle,
  syncObligacionesToGoogle,
} from "@/lib/google-calendar/google.functions";

export function GoogleCalendarSection() {
  const qc = useQueryClient();
  const fnStatus = useServerFn(getGoogleStatus);
  const fnStart = useServerFn(startGoogleAuth);
  const fnDisc = useServerFn(disconnectGoogle);
  const fnSync = useServerFn(syncObligacionesToGoogle);

  const status = useQuery({
    queryKey: ["google-calendar-status"],
    queryFn: () => fnStatus(),
  });

  // Read ?google= flag after OAuth callback
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const flag = sp.get("google");
    if (!flag) return;
    if (flag === "connected") {
      toast.success(`Google Calendar conectado (${sp.get("email") || ""})`);
    } else if (flag === "error") {
      toast.error(`No se pudo conectar Google: ${sp.get("reason") || "error"}`);
    }
    const url = new URL(window.location.href);
    ["google", "email", "reason"].forEach((k) => url.searchParams.delete(k));
    window.history.replaceState({}, "", url.toString());
    qc.invalidateQueries({ queryKey: ["google-calendar-status"] });
  }, [qc]);

  const connect = useMutation({
    mutationFn: () => fnStart({ data: { origin: window.location.origin } }),
    onSuccess: (r: any) => {
      window.location.href = r.authUrl;
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const disconnect = useMutation({
    mutationFn: () => fnDisc(),
    onSuccess: () => {
      toast.success("Google Calendar desconectado");
      qc.invalidateQueries({ queryKey: ["google-calendar-status"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const sync = useMutation({
    mutationFn: () => fnSync({ data: { daysAhead: 120 } }),
    onSuccess: (r: any) => {
      toast.success(`Sincronización completada: ${r.created} nuevos, ${r.updated} actualizados${r.failed ? `, ${r.failed} con error` : ""}.`);
      qc.invalidateQueries({ queryKey: ["google-calendar-status"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const s = status.data;

  if (status.isLoading) {
    return (
      <div className="rounded-xl border border-border/60 bg-card/50 p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando estado de Google Calendar…
      </div>
    );
  }

  if (s && !s.isOwner) {
    return (
      <div className="rounded-xl border border-border/60 bg-card/50 p-5">
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Solo el dueño del despacho puede conectar Google Calendar.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Calendar className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <div className="font-semibold">Google Calendar</div>
          <div className="text-xs text-muted-foreground">
            Envía automáticamente las obligaciones fiscales próximas a tu calendario de Gmail.
          </div>
        </div>
      </div>

      {s?.connected ? (
        <>
          <div className="rounded-lg bg-green-500/10 border border-green-500/30 p-3 flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <div className="flex-1">
              <div className="font-medium">Conectado como {s.email}</div>
              {s.lastSyncAt && (
                <div className="text-xs text-muted-foreground">
                  Última sincronización: {new Date(s.lastSyncAt).toLocaleString("es-MX")}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => sync.mutate()} disabled={sync.isPending} variant="hero" size="sm">
              {sync.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sincronizar ahora (próximos 120 días)
            </Button>
            <Button onClick={() => disconnect.mutate()} disabled={disconnect.isPending} variant="ghost" size="sm">
              {disconnect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
              Desconectar
            </Button>
          </div>
        </>
      ) : (
        <Button onClick={() => connect.mutate()} disabled={connect.isPending} variant="hero" size="sm">
          {connect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          Conectar mi Google Calendar
        </Button>
      )}
    </div>
  );
}
