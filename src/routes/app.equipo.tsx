import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { listTeam, createInvitation, revokeInvitation, removeMember } from "@/lib/equipo/equipo.functions";
import { getAccesoConfig, toggleAccesoRestringido, listAsignaciones, setAsignacion } from "@/lib/asignaciones/asignaciones.functions";
import { Button } from "@/components/ui/button";
import { Copy, Link2, Lock, Mail, Trash2, UserPlus, Users, X, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";

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

      <AccesoExpedientesSection />

      <div className="text-xs text-muted-foreground">
        <Link to="/app/configuracion" className="hover:underline">← Configuración del despacho</Link>
      </div>
    </div>
  );
}

function AccesoExpedientesSection() {
  const qc = useQueryClient();
  const cfgFn = useServerFn(getAccesoConfig);
  const toggleFn = useServerFn(toggleAccesoRestringido);
  const listFn = useServerFn(listAsignaciones);
  const setFn = useServerFn(setAsignacion);

  const cfg = useQuery({ queryKey: ["acceso-config"], queryFn: () => cfgFn() });
  const data = useQuery({ queryKey: ["asignaciones"], queryFn: () => listFn() });

  const toggleM = useMutation({
    mutationFn: (enabled: boolean) => toggleFn({ data: { enabled } }),
    onSuccess: () => { toast.success("Configuración actualizada"); qc.invalidateQueries({ queryKey: ["acceso-config"] }); qc.invalidateQueries({ queryKey: ["clientes"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });
  const setM = useMutation({
    mutationFn: (v: { user_id: string; cliente_id: string; assigned: boolean }) => setFn({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["asignaciones"] }); qc.invalidateQueries({ queryKey: ["clientes"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const restringido = !!cfg.data?.accesoRestringido;
  const miembros = (data.data?.miembros ?? []).filter((m) => m.role !== "despacho");
  const clientes = data.data?.clientes ?? [];
  const asignados = new Set((data.data?.asignaciones ?? []).map((a) => `${a.user_id}|${a.cliente_id}`));

  return (
    <section className="rounded-xl border border-border bg-card/40 p-5 space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> Permisos por expediente
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Por defecto, todos los miembros del despacho ven todos los expedientes. Activa el acceso restringido
            si quieres que cada contador sólo vea los RFC que tú le asignes.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <span className="text-xs text-muted-foreground">{restringido ? "Restringido" : "Abierto"}</span>
          <input
            type="checkbox"
            checked={restringido}
            disabled={cfg.isLoading || toggleM.isPending}
            onChange={(e) => toggleM.mutate(e.target.checked)}
            className="h-5 w-9 appearance-none rounded-full bg-muted relative cursor-pointer
              checked:bg-primary transition
              before:content-[''] before:absolute before:top-0.5 before:left-0.5 before:h-4 before:w-4 before:rounded-full before:bg-background before:transition
              checked:before:translate-x-4"
          />
        </label>
      </header>

      {restringido && (
        miembros.length === 0 ? (
          <div className="text-sm text-muted-foreground rounded-md border border-dashed border-border p-4">
            Aún no tienes colaboradores. Genera una invitación arriba y luego asígnale expedientes.
          </div>
        ) : clientes.length === 0 ? (
          <div className="text-sm text-muted-foreground rounded-md border border-dashed border-border p-4">
            No hay expedientes en este despacho.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground bg-muted/30">
                <tr>
                  <th className="text-left px-3 py-2 sticky left-0 bg-muted/30">Expediente</th>
                  {miembros.map((m) => (
                    <th key={m.user_id} className="px-3 py-2 text-center font-medium">
                      <div className="truncate max-w-[140px]">{m.full_name || m.email || m.user_id.slice(0, 6)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clientes.map((c) => (
                  <tr key={c.id} className="border-t border-border/40">
                    <td className="px-3 py-2 sticky left-0 bg-card">
                      <div className="font-medium">{c.razon_social}</div>
                      <div className="text-xs font-mono text-muted-foreground">{c.rfc}</div>
                    </td>
                    {miembros.map((m) => {
                      const checked = asignados.has(`${m.user_id}|${c.id}`);
                      return (
                        <td key={m.user_id} className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={setM.isPending}
                            onChange={(e) => setM.mutate({ user_id: m.user_id, cliente_id: c.id, assigned: e.target.checked })}
                            className="h-4 w-4 accent-primary cursor-pointer"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {!restringido && (
        <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <Lock className="h-3 w-3" /> Modo abierto: cualquier miembro ve cualquier expediente del despacho.
        </div>
      )}
    </section>
  );
}
