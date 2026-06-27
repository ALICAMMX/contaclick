import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Ticket, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/app/admin/cupones")({
  beforeLoad: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });
    const { data: isSA } = await supabase.rpc("is_super_admin");
    if (!isSA) throw redirect({ to: "/app" });
  },
  component: CuponesAdmin,
});

type Cupon = {
  id: string;
  codigo: string;
  descripcion: string | null;
  porcentaje: number;
  vigente_desde: string | null;
  vigente_hasta: string | null;
  max_usos: number | null;
  usos_actuales: number;
  planes_permitidos: string[] | null;
  ciclos_permitidos: string[] | null;
  activo: boolean;
};

function CuponesAdmin() {
  const [items, setItems] = useState<Cupon[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    codigo: "",
    descripcion: "",
    porcentaje: 10,
    vigente_hasta: "",
    max_usos: "",
  });

  async function load() {
    const { data, error } = await supabase
      .from("cupones")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) { toast.error(error.message); return; }
    setItems((data ?? []) as Cupon[]);
  }
  useEffect(() => { load(); }, []);

  async function crear() {
    if (!form.codigo.trim() || form.porcentaje <= 0) {
      toast.error("Código y porcentaje son obligatorios");
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("cupones").insert({
      codigo: form.codigo.trim().toUpperCase(),
      descripcion: form.descripcion || null,
      porcentaje: Number(form.porcentaje),
      vigente_hasta: form.vigente_hasta ? new Date(form.vigente_hasta).toISOString() : null,
      max_usos: form.max_usos ? Number(form.max_usos) : null,
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Cupón creado");
    setForm({ codigo: "", descripcion: "", porcentaje: 10, vigente_hasta: "", max_usos: "" });
    load();
  }

  async function toggleActivo(c: Cupon) {
    const { error } = await supabase.from("cupones").update({ activo: !c.activo }).eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    load();
  }

  async function eliminar(c: Cupon) {
    if (!confirm(`¿Eliminar cupón ${c.codigo}?`)) return;
    const { error } = await supabase.from("cupones").delete().eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    load();
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
          <Ticket className="h-6 w-6 text-primary" /> Cupones
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Crea y administra los cupones de descuento aplicables en el checkout. Solo super-admin.
        </p>
      </div>

      <section className="rounded-2xl border border-border/60 bg-card p-5">
        <h2 className="font-medium mb-3 flex items-center gap-2"><Plus className="h-4 w-4" /> Nuevo cupón</h2>
        <div className="grid sm:grid-cols-5 gap-3">
          <Input placeholder="CÓDIGO" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} className="uppercase" />
          <Input placeholder="Descripción" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className="sm:col-span-2" />
          <Input type="number" min={1} max={100} placeholder="% desc." value={form.porcentaje} onChange={(e) => setForm({ ...form, porcentaje: Number(e.target.value) })} />
          <Input type="number" min={1} placeholder="Máx. usos" value={form.max_usos} onChange={(e) => setForm({ ...form, max_usos: e.target.value })} />
          <Input type="date" placeholder="Vigente hasta" value={form.vigente_hasta} onChange={(e) => setForm({ ...form, vigente_hasta: e.target.value })} className="sm:col-span-2" />
          <Button onClick={crear} disabled={loading} className="sm:col-span-3">Crear cupón</Button>
        </div>
      </section>

      <section className="rounded-2xl border border-border/60 bg-card p-5">
        <h2 className="font-medium mb-3">Cupones existentes ({items.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-b border-border/50">
              <tr>
                <th className="py-2">Código</th>
                <th>%</th>
                <th>Usos</th>
                <th>Vigencia</th>
                <th>Activo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-b border-border/30">
                  <td className="py-2 font-mono">{c.codigo}<div className="text-xs text-muted-foreground font-sans">{c.descripcion}</div></td>
                  <td>{c.porcentaje}%</td>
                  <td>{c.usos_actuales}{c.max_usos ? ` / ${c.max_usos}` : ""}</td>
                  <td className="text-xs">{c.vigente_hasta ? new Date(c.vigente_hasta).toLocaleDateString("es-MX") : "—"}</td>
                  <td><Switch checked={c.activo} onCheckedChange={() => toggleActivo(c)} /></td>
                  <td>
                    <Button variant="ghost" size="icon" onClick={() => eliminar(c)} className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground text-sm">Sin cupones aún.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
