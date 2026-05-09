import { createFileRoute } from "@tanstack/react-router";
import {
  TrendingUp, TrendingDown, Users, FileText, AlertTriangle,
  CheckCircle2, Banknote, Sparkles,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip,
  BarChart, Bar, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardHome,
});

const flujoData = [
  { mes: "May", ingresos: 420000, egresos: 280000 },
  { mes: "Jun", ingresos: 510000, egresos: 320000 },
  { mes: "Jul", ingresos: 480000, egresos: 310000 },
  { mes: "Ago", ingresos: 620000, egresos: 380000 },
  { mes: "Sep", ingresos: 590000, egresos: 360000 },
  { mes: "Oct", ingresos: 720000, egresos: 410000 },
];

const ivaData = [
  { mes: "Jun", trasladado: 81600, acreditable: 51200 },
  { mes: "Jul", trasladado: 76800, acreditable: 49600 },
  { mes: "Ago", trasladado: 99200, acreditable: 60800 },
  { mes: "Sep", trasladado: 94400, acreditable: 57600 },
  { mes: "Oct", trasladado: 115200, acreditable: 65600 },
];

const kpis = [
  { label: "Clientes activos", value: "47", delta: "+3", icon: Users, trend: "up" },
  { label: "CFDI este mes", value: "2,318", delta: "+18%", icon: FileText, trend: "up" },
  { label: "Riesgos detectados", value: "12", delta: "−4", icon: AlertTriangle, trend: "down", warning: true },
  { label: "Bancos conciliados", value: "94%", delta: "+6%", icon: CheckCircle2, trend: "up" },
];

const alertas = [
  { tipo: "alta", cliente: "Servicios García SA", msg: "2 CFDI de proveedor en lista 69-B presunto", time: "hace 2h" },
  { tipo: "media", cliente: "Distribuidora MX", msg: "Depósito de $45,200 sin CFDI relacionado", time: "hace 5h" },
  { tipo: "baja", cliente: "Comercial Luna", msg: "DIOT pendiente para octubre", time: "ayer" },
  { tipo: "alta", cliente: "Tech Norte SAPI", msg: "Diferencia de $12,800 entre IVA declarado y CFDI", time: "ayer" },
];

function DashboardHome() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs text-muted-foreground">Octubre 2026</div>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">Buenos días, Carlos 👋</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Tu despacho tiene <span className="text-warning font-medium">12 alertas</span> y{" "}
            <span className="text-foreground font-medium">8 pendientes</span> esta semana.
          </p>
        </div>
        <div className="glass rounded-lg px-4 py-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-md flex items-center justify-center" style={{ background: "var(--gradient-accent)" }}>
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Semáforo fiscal global</div>
            <div className="text-sm font-medium text-success">87 / 100 — Saludable</div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl p-5 border border-border/60 bg-card/50" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="flex items-center justify-between">
              <div className={`h-9 w-9 rounded-md flex items-center justify-center ${k.warning ? "bg-warning/15" : "bg-primary/15"}`}>
                <k.icon className={`h-4 w-4 ${k.warning ? "text-warning" : "text-primary"}`} />
              </div>
              <div className={`text-xs flex items-center gap-1 ${k.trend === "up" ? "text-success" : "text-warning"}`}>
                {k.trend === "up" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {k.delta}
              </div>
            </div>
            <div className="mt-4 text-3xl font-semibold tracking-tight">{k.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl p-5 border border-border/60 bg-card/50">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">Flujo mensual consolidado</h3>
              <p className="text-xs text-muted-foreground">Ingresos vs egresos · todos los clientes</p>
            </div>
            <div className="text-xs text-muted-foreground">MXN</div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={flujoData}>
              <defs>
                <linearGradient id="ing" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.68 0.20 252)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="oklch(0.68 0.20 252)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="egr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.78 0.17 152)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="oklch(0.78 0.17 152)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.05)" vertical={false} />
              <XAxis dataKey="mes" stroke="oklch(0.68 0.018 260)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="oklch(0.68 0.018 260)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v / 1000}k`} />
              <Tooltip contentStyle={{ background: "oklch(0.20 0.014 260)", border: "1px solid oklch(0.28 0.014 260)", borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="ingresos" stroke="oklch(0.68 0.20 252)" strokeWidth={2} fill="url(#ing)" />
              <Area type="monotone" dataKey="egresos" stroke="oklch(0.78 0.17 152)" strokeWidth={2} fill="url(#egr)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl p-5 border border-border/60 bg-card/50">
          <h3 className="font-semibold">IVA</h3>
          <p className="text-xs text-muted-foreground">Trasladado vs acreditable</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={ivaData}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.05)" vertical={false} />
              <XAxis dataKey="mes" stroke="oklch(0.68 0.018 260)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="oklch(0.68 0.018 260)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v / 1000}k`} />
              <Tooltip contentStyle={{ background: "oklch(0.20 0.014 260)", border: "1px solid oklch(0.28 0.014 260)", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="trasladado" fill="oklch(0.68 0.20 252)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="acreditable" fill="oklch(0.78 0.17 152)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Alertas */}
      <div className="rounded-xl border border-border/60 bg-card/50">
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" /> Alertas IA recientes
            </h3>
            <p className="text-xs text-muted-foreground">Detectadas automáticamente en los últimos 7 días</p>
          </div>
          <button className="text-xs text-primary hover:underline">Ver todas</button>
        </div>
        <div className="divide-y divide-border/40">
          {alertas.map((a, i) => (
            <div key={i} className="px-5 py-3.5 flex items-center gap-4 hover:bg-accent/5 transition-colors">
              <div className={`h-2 w-2 rounded-full ${
                a.tipo === "alta" ? "bg-destructive" : a.tipo === "media" ? "bg-warning" : "bg-muted-foreground"
              }`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{a.cliente}</div>
                <div className="text-xs text-muted-foreground truncate">{a.msg}</div>
              </div>
              <div className="text-xs text-muted-foreground">{a.time}</div>
              <button className="text-xs px-3 py-1.5 rounded-md glass hover:bg-accent/10">Revisar</button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <QuickAction icon={Banknote} title="Conciliar bancos" desc="Sube estados de cuenta y cruza con CFDI" />
        <QuickAction icon={FileText} title="Subir CFDI" desc="ZIP, carpeta o XML individuales" />
      </div>
    </div>
  );
}

function QuickAction({ icon: Icon, title, desc }: { icon: typeof Users; title: string; desc: string }) {
  return (
    <button className="rounded-xl p-5 border border-border/60 bg-card/50 hover:bg-card flex items-center gap-4 text-left transition-all hover:-translate-y-0.5">
      <div className="h-11 w-11 rounded-lg flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
        <Icon className="h-5 w-5 text-primary-foreground" />
      </div>
      <div className="flex-1">
        <div className="font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </button>
  );
}
