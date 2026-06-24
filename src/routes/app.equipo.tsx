import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { listTeam, createInvitation, revokeInvitation, removeMember } from "@/lib/equipo/equipo.functions";
import { getAccesoConfig, toggleAccesoRestringido, listAsignaciones, setAsignacion } from "@/lib/asignaciones/asignaciones.functions";
import { Button } from "@/components/ui/button";
import { Copy, Link2, Lock, Trash2, UserPlus, Users, X, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/app/equipo")({
  component: EquipoPage,
  head: () => ({ meta: [{ title: "Equipo · CFDI Cloud" }] }),
});

function EquipoPage() {
  const fetchTeam = useServerFn(listTeam);
  const createFn = useServerFn(createInvitation);
  const revokeFn = useServerFn(revokeInvitation);
  const removeFn = useServerFn(removeMember);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["team"], queryFn: () => fetchTeam() });
  const [lastLink, setLastLink] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () => createFn({ data: { role: "colaborador" } }),
    onSuccess: (r) => {
      const url = `${window.location.origin}/invitar/${r.token}`;
      setLastLink(url);
      navigator.clipboard?.writeText(url).catch(() => {});
      toast.success("Invitación creada y copiada al portapapeles");
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al crear invitación"),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { id } }),
    onSuccess: () => { toast.success("Invitación cancelada"); qc.invalidateQueries({ queryKey: ["team"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const removeMut = useMutation({
    mutationFn: (user_id: string) => removeFn({ data: { user_id } }),
    onSuccess: () => { toast.success("Miembro removido"); qc.invalidateQueries({ queryKey: ["team"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  if (isLoading) return <div className="text-muted-foreground">Cargando…</div>;
  if (!data?.isAdmin) return (
    <div className="rounded-lg border border-border p-8 text-center">
      <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
      <h2 className="text-lg font-semibold">No eres administrador</h2>
      <p className="text-sm text-muted-foreground mt-1">Solo los administradores del despacho pueden gestionar el equipo.</p>
    </div>
  );

  const { members, invitations, limit } = data;
  const activeInvites = invitations.filter((i: any) => !i.used_at && !i.revoked_at && new Date(i.expires_at) > new Date());
  const total = members.length + activeInvites.length;
  const remaining = limit === null ? Infinity : Math.max(0, limit - total);

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Equipo</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {limit === null ? "Miembros ilimitados" : `${total} de ${limit} miembros usados`}
            {limit !== null && remaining > 0 && ` · ${remaining} disponibles`}
          </p>
        </div>
        <Button
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending || (limit !== null && remaining <= 0)}
        >
          <UserPlus className="h-4 w-4 mr-2" />
          {createMut.isPending ? "Generando…" : "Generar link de invitación"}
        </Button>
      </header>

      {lastLink && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-2">
          <div className="text-sm font-medium flex items-center gap-2"><Link2 className="h-4 w-4" /> Link copiado al portapapeles</div>
          <div className="flex items-center gap-2">
            <input readOnly value={lastLink} className="flex-1 bg-card/40 border border-border rounded px-2 py-1 text-xs font-mono" />
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(lastLink); toast.success("Copiado"); }}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Expira en 7 días. Compártelo por WhatsApp o como prefieras.</p>
        </div>
      )}

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Miembros activos ({members.length})</h2>
        <div className="rounded-lg border border-border divide-y divide-border/60">
          {members.map((m: any) => (
            <div key={m.user_id} className="flex items-center justify-between p-4">
              <div>
                <div className="font-medium text-sm">{m.full_name || m.email || m.user_id.slice(0, 8)}</div>
                <div className="text-xs text-muted-foreground">{m.email}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-0.5 rounded-full ${m.role === "despacho" ? "bg-primary/15 text-primary" : "bg-accent/30 text-foreground"}`}>
                  {m.role === "despacho" ? "Admin" : "Colaborador"}
                </span>
                {!m.is_self && m.role !== "despacho" && (
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm("¿Remover a este miembro?")) removeMut.mutate(m.user_id); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Invitaciones pendientes ({activeInvites.length})</h2>
        {activeInvites.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Sin invitaciones activas. Genera un link arriba para invitar a alguien.
          </div>
        ) : (
          <div className="rounded-lg border border-border divide-y divide-border/60">
            {activeInvites.map((inv: any) => {
              const url = `${typeof window !== "undefined" ? window.location.origin : ""}/invitar/${inv.token}`;
              return (
                <div key={inv.id} className="flex items-center justify-between p-4 gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-mono truncate text-muted-foreground">{url}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Expira {new Date(inv.expires_at).toLocaleDateString("es-MX")}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(url); toast.success("Copiado"); }}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => revokeMut.mutate(inv.id)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="text-xs text-muted-foreground">
        <Link to="/app/configuracion" className="hover:underline">← Configuración del despacho</Link>
      </div>
    </div>
  );
}
