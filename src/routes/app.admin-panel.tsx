import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  adminListUsers,
  adminSetActivo,
  adminSetPlan,
  adminSetRole,
  adminRegisterPago,
  claimSuperAdmin,
  isSuperAdmin,
  type AdminUserRow,
} from "@/lib/admin-panel/admin-panel.functions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Users,
  ShieldCheck,
  CreditCard,
  Bot,
  ToggleLeft,
  ToggleRight,
  Search,
  CircleDollarSign,
  TimerReset,
} from "lucide-react";

export const Route = createFileRoute("/app/admin-panel")({ component: AdminPanel });

const ROLES = ["super_admin", "despacho", "contador", "auxiliar", "cliente_final", "colaborador"] as const;

function AdminPanel() {
  const checkRole = useServerFn(isSuperAdmin);
  const claim = useServerFn(claimSuperAdmin);
  const qc = useQueryClient();

  const roleQ = useQuery({
    queryKey: ["admin-panel", "role"],
    queryFn: () => checkRole(),
  });

  const claimMut = useMutation({
    mutationFn: () => claim(),
    onSuccess: () => {
      toast.success("Eres super administrador.");
      qc.invalidateQueries({ queryKey: ["admin-panel"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (roleQ.isLoading)
    return <div className="p-8 text-muted-foreground">Verificando permisos…</div>;

  if (!roleQ.data?.isSuperAdmin) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center">
        <ShieldCheck className="h-10 w-10 mx-auto text-gold mb-3" />
        <h1 className="serif text-2xl">Panel de super administrador</h1>
        <p className="text-sm text-muted-foreground mt-2">
          No tienes permisos para entrar a este panel.
        </p>
        {!roleQ.data?.anySuperAdmin && (
          <div className="mt-6 rounded-lg border border-gold/40 bg-gold/10 p-4 text-sm">
            <p className="mb-3">
              Aún no hay un super administrador configurado. Como eres el primer usuario, puedes reclamar el rol ahora.
            </p>
            <Button onClick={() => claimMut.mutate()} disabled={claimMut.isPending}>
              {claimMut.isPending ? "Asignando…" : "Reclamar super admin"}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return <Dashboard />;
}

function Dashboard() {
  const listFn = useServerFn(adminListUsers);
  const setActivo = useServerFn(adminSetActivo);
  const setPlan = useServerFn(adminSetPlan);
  const setRole = useServerFn(adminSetRole);
  const registerPago = useServerFn(adminRegisterPago);
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const dataQ = useQuery({
    queryKey: ["admin-panel", "list"],
    queryFn: () => listFn(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-panel", "list"] });

  const activoMut = useMutation({
    mutationFn: (v: { user_id: string; activo: boolean }) => setActivo({ data: v }),
    onSuccess: (_d, v) => {
      toast.success(v.activo ? "Cuenta activada" : "Cuenta desactivada");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const planMut = useMutation({
    mutationFn: (v: { despacho_id: string; plan_id: string }) => setPlan({ data: v }),
    onSuccess: () => {
      toast.success("Plan actualizado");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const roleMut = useMutation({
    mutationFn: (v: { user_id: string; despacho_id: string | null; role: any; action: "add" | "remove" }) =>
      setRole({ data: v }),
    onSuccess: () => {
      toast.success("Roles actualizados");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const pagoMut = useMutation({
    mutationFn: (v: { despacho_id: string; monto_mxn: number }) => registerPago({ data: v }),
    onSuccess: () => {
      toast.success("Pago registrado");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const rows = dataQ.data?.rows ?? [];
    if (!q.trim()) return rows;
    const s = q.toLowerCase();
    return rows.filter(
      (r) =>
        r.email?.toLowerCase().includes(s) ||
        r.full_name?.toLowerCase().includes(s) ||
        r.despacho_nombre?.toLowerCase().includes(s) ||
        r.telefono?.toLowerCase().includes(s),
    );
  }, [dataQ.data, q]);

  if (dataQ.isLoading)
    return <div className="p-8 text-muted-foreground">Cargando usuarios…</div>;
  if (dataQ.error)
    return <div className="p-8 text-destructive">{(dataQ.error as Error).message}</div>;

  const stats = dataQ.data!.stats;
  const planes = dataQ.data!.planes;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-gold mb-2">
            <ShieldCheck className="h-3 w-3" /> Super admin
          </div>
          <h1 className="serif text-3xl">Panel de usuarios</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestiona altas, membresías, pagos y consumo de IA de toda la plataforma.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon={Users} label="Usuarios" value={stats.total_usuarios.toString()} />
        <StatCard icon={ToggleRight} label="Activos" value={stats.activos.toString()} />
        <StatCard icon={CreditCard} label="Con pago" value={stats.pagados.toString()} />
        <StatCard
          icon={CircleDollarSign}
          label="Ingresos mes"
          value={`$${stats.ingresos_mes_mxn.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`}
        />
        <StatCard
          icon={Bot}
          label="IA mes (USD)"
          value={`$${stats.ia_costo_total_usd_mes.toFixed(2)}`}
        />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, correo, teléfono o despacho…"
            className="pl-9"
          />
        </div>
        <Button variant="outline" onClick={() => dataQ.refetch()}>
          Refrescar
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Despacho</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>RFCs</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead>IA (mes)</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <UserRow
                key={r.user_id}
                row={r}
                planes={planes}
                onActivo={(v) => activoMut.mutate({ user_id: r.user_id, activo: v })}
                onPlan={(planId) => r.despacho_id && planMut.mutate({ despacho_id: r.despacho_id, plan_id: planId })}
                onRole={(role, action) =>
                  roleMut.mutate({
                    user_id: r.user_id,
                    despacho_id: r.despacho_id,
                    role,
                    action,
                  })
                }
                onPago={(monto) => r.despacho_id && pagoMut.mutate({ despacho_id: r.despacho_id, monto_mxn: monto })}
              />
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                  Sin resultados
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="text-2xl font-semibold tabular-nums mt-2">{value}</div>
    </div>
  );
}

function UserRow({
  row,
  planes,
  onActivo,
  onPlan,
  onRole,
  onPago,
}: {
  row: AdminUserRow;
  planes: { id: string; clave: string; nombre: string; precio_mxn: number }[];
  onActivo: (v: boolean) => void;
  onPlan: (planId: string) => void;
  onRole: (role: any, action: "add" | "remove") => void;
  onPago: (monto: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [monto, setMonto] = useState<string>(row.plan_precio_mxn?.toString() ?? "");

  return (
    <>
      <TableRow className={!row.activo ? "opacity-60" : ""}>
        <TableCell>
          <div className="font-medium">{row.full_name || "Sin nombre"}</div>
          <div className="text-xs text-muted-foreground">{row.email}</div>
          {row.telefono && (
            <div className="text-xs text-muted-foreground">📱 {row.telefono}</div>
          )}
        </TableCell>
        <TableCell>
          <div className="text-sm">{row.despacho_nombre ?? "—"}</div>
          {row.despacho_estado === "trial" && row.trial_ends_at && (
            <Badge variant="outline" className="mt-1 gap-1 text-[10px]">
              <TimerReset className="h-3 w-3" />
              Trial · {new Date(row.trial_ends_at).toLocaleDateString("es-MX")}
            </Badge>
          )}
        </TableCell>
        <TableCell>
          {row.despacho_id ? (
            <Select value={row.plan_clave ?? ""} onValueChange={(v) => {
              const p = planes.find((x) => x.clave === v);
              if (p) onPlan(p.id);
            }}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue placeholder="Sin plan" />
              </SelectTrigger>
              <SelectContent>
                {planes.map((p) => (
                  <SelectItem key={p.id} value={p.clave}>
                    {p.nombre} · ${p.precio_mxn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            "—"
          )}
        </TableCell>
        <TableCell>
          <UsageMini usado={row.rfc_activos} limite={row.rfc_limite} />
        </TableCell>
        <TableCell>
          {row.ultimo_pago_at ? (
            <>
              <div className="text-sm tabular-nums">
                ${Number(row.ultimo_pago_monto).toLocaleString("es-MX")}
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(row.ultimo_pago_at).toLocaleDateString("es-MX")}
              </div>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Sin pagos</span>
          )}
          <div className="text-[10px] text-muted-foreground mt-0.5">
            Total: ${row.total_pagado_mxn.toLocaleString("es-MX")}
          </div>
        </TableCell>
        <TableCell>
          <UsageMini usado={row.ia_calls_mes} limite={row.ia_msgs_limite} label="msgs" />
          <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
            ${row.ia_costo_usd_mes.toFixed(3)} USD · {row.ia_tokens_mes.toLocaleString()} tok
          </div>
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap gap-1 max-w-[180px]">
            {row.roles.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
            {row.roles.map((r) => (
              <Badge key={r} variant="secondary" className="text-[10px]">
                {r}
              </Badge>
            ))}
          </div>
        </TableCell>
        <TableCell>
          <button
            onClick={() => onActivo(!row.activo)}
            className="inline-flex items-center gap-1.5 text-sm"
            title={row.activo ? "Desactivar" : "Activar"}
          >
            {row.activo ? (
              <ToggleRight className="h-5 w-5 text-emerald-500" />
            ) : (
              <ToggleLeft className="h-5 w-5 text-muted-foreground" />
            )}
            <span className="text-xs">{row.activo ? "Activo" : "Inactivo"}</span>
          </button>
        </TableCell>
        <TableCell className="text-right">
          <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
            {open ? "Cerrar" : "Gestionar"}
          </Button>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={9} className="bg-muted/30">
            <div className="grid md:grid-cols-2 gap-4 p-3">
              <div>
                <div className="text-xs font-semibold mb-2">Roles / privilegios</div>
                <div className="flex flex-wrap gap-1.5">
                  {ROLES.map((r) => {
                    const has = row.roles.includes(r);
                    return (
                      <button
                        key={r}
                        onClick={() => onRole(r, has ? "remove" : "add")}
                        className={`text-xs px-2 py-1 rounded border transition ${
                          has
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card border-border hover:bg-accent"
                        }`}
                      >
                        {has ? "− " : "+ "}
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold mb-2">Registrar pago manual (MXN)</div>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    placeholder="0.00"
                    className="h-9"
                    disabled={!row.despacho_id}
                  />
                  <Button
                    size="sm"
                    disabled={!row.despacho_id || !monto || Number(monto) <= 0}
                    onClick={() => onPago(Number(monto))}
                  >
                    Registrar
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Útil para reflejar pagos cobrados fuera de la plataforma.
                </p>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function UsageMini({ usado, limite, label }: { usado: number; limite: number; label?: string }) {
  const ilimitado = limite < 0;
  const sinLimite = !ilimitado && limite === 0;
  const pct = ilimitado || sinLimite ? 0 : Math.min(100, (usado / limite) * 100);
  const tone =
    ilimitado || sinLimite
      ? "bg-muted-foreground/40"
      : pct >= 100
        ? "bg-destructive"
        : pct >= 80
          ? "bg-warning"
          : pct >= 50
            ? "bg-primary"
            : "bg-emerald-500";
  return (
    <div className="min-w-[110px]">
      <div className="text-sm tabular-nums">
        {usado.toLocaleString("es-MX")}
        {ilimitado ? " / ∞" : sinLimite ? "" : ` / ${limite.toLocaleString("es-MX")}`}
        {label && <span className="text-[10px] text-muted-foreground ml-1">{label}</span>}
      </div>
      {!ilimitado && !sinLimite && (
        <div className="h-1 rounded-full bg-muted/40 overflow-hidden mt-1">
          <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
