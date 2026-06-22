import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Search, UserRound, X, FileBadge, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listClientes, createCliente, deleteCliente } from "@/lib/clientes.functions";
import { useActiveCliente } from "@/lib/active-cliente";

export const Route = createFileRoute("/app/clientes")({
  component: ClientesPage,
});

function ClientesPage() {
  const fetchList = useServerFn(listClientes);
  const create = useServerFn(createCliente);
  const remove = useServerFn(deleteCliente);
  const qc = useQueryClient();
  const { cliente: active, setCliente } = useActiveCliente();
  const [openForm, setOpenForm] = useState(false);
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["clientes"],
    queryFn: () => fetchList(),
  });

  const createMut = useMutation({
    mutationFn: (input: any) => create({ data: input }),
    onSuccess: (row) => {
      toast.success("Expediente creado");
      qc.invalidateQueries({ queryKey: ["clientes"] });
      setOpenForm(false);
      setCliente({ id: row.id, rfc: row.rfc, razon_social: row.razon_social, regimen_fiscal: row.regimen_fiscal });
    },
    onError: (e: Error) => toast.error(e.message ?? "No se pudo crear"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: (_v, id) => {
      toast.success("Expediente eliminado");
      qc.invalidateQueries({ queryKey: ["clientes"] });
      if (active?.id === id) setCliente(null);
    },
  });

  const clientes = (data?.clientes ?? []).filter((c) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return c.rfc.toLowerCase().includes(s) || c.razon_social.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Expedientes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cada expediente es un RFC sobre el que ejecutas las herramientas.{" "}
            {isLoading ? (
              <span className="inline-block h-3 w-10 align-middle rounded bg-muted/50 animate-pulse" />
            ) : (
              <>{data?.clientes.length ?? 0} en total.</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/app/rfcs-vinculados" className="inline-flex items-center gap-1.5 h-10 px-3 rounded-md border border-border bg-card hover:bg-accent text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            <FileBadge className="h-4 w-4" /> RFC vinculados
          </Link>
          <Button variant="hero" onClick={() => setOpenForm((v) => !v)}>
            {openForm ? <><X className="h-4 w-4" /> Cancelar</> : <><Plus className="h-4 w-4" /> Nuevo expediente</>}
          </Button>
        </div>
      </div>

      {openForm && <NewClienteForm onSubmit={(d) => createMut.mutate(d)} loading={createMut.isPending} />}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre o RFC..."
          className="w-full pl-9 pr-3 h-10 rounded-lg bg-input/50 border border-border text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="rounded-xl border border-border/60 bg-card/50 overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Cargando...</div>
        ) : clientes.length === 0 ? (
          <div className="p-12 text-center">
            <UserRound className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
            <div className="font-medium">{q ? "No hay coincidencias" : "Aún no tienes expedientes"}</div>
            <p className="text-sm text-muted-foreground mt-1">
              {q ? "Prueba con otro RFC o nombre." : "Crea tu primer expediente para empezar a usar las herramientas."}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/30">
              <tr>
                <th className="text-left font-medium px-5 py-3">Razón social</th>
                <th className="text-left font-medium px-5 py-3">RFC</th>
                <th className="text-left font-medium px-5 py-3">Régimen</th>
                <th className="text-right font-medium px-5 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => {
                const isActive = active?.id === c.id;
                return (
                  <tr key={c.id} className={`border-t border-border/30 ${isActive ? "bg-primary/5" : "hover:bg-accent/5"}`}>
                    <td className="px-5 py-3.5 font-medium">{c.razon_social}</td>
                    <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{c.rfc}</td>
                    <td className="px-5 py-3.5 text-muted-foreground text-xs">{c.regimen_fiscal ?? "—"}</td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex justify-end gap-2">
                        {isActive ? (
                          <span className="text-xs px-2 py-1 rounded-md bg-primary/15 text-primary">Activo</span>
                        ) : (
                          <button
                            onClick={() => setCliente({ id: c.id, rfc: c.rfc, razon_social: c.razon_social, regimen_fiscal: c.regimen_fiscal })}
                            className="text-xs px-2 py-1 rounded-md border border-border hover:bg-accent/40"
                          >
                            Activar
                          </button>
                        )}
                        <Link to="/app/clientes/$id" params={{ id: c.id }} className="text-xs px-2 py-1 rounded-md border border-border hover:bg-accent/40">
                          Ficha · SAT
                        </Link>
                        <Link to="/app/tools" className="text-xs px-2 py-1 rounded-md border border-border hover:bg-accent/40">
                          Herramientas
                        </Link>
                        <button
                          onClick={() => {
                            if (confirm(`¿Eliminar el expediente ${c.rfc}?`)) deleteMut.mutate(c.id);
                          }}
                          className="text-xs px-2 py-1 rounded-md text-destructive hover:bg-destructive/10"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const REGIMENES = [
  "601 - General de Ley Personas Morales",
  "603 - Personas Morales con Fines no Lucrativos",
  "605 - Sueldos y Salarios e Ingresos Asimilados a Salarios",
  "606 - Arrendamiento",
  "608 - Demás ingresos",
  "612 - Personas Físicas con Actividades Empresariales y Profesionales",
  "621 - Incorporación Fiscal",
  "625 - Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas",
  "626 - RESICO Personas Morales",
  "626 - RESICO Personas Físicas",
];

function NewClienteForm({ onSubmit, loading }: { onSubmit: (d: any) => void; loading: boolean }) {
  const [rfc, setRfc] = useState("");
  const [razon, setRazon] = useState("");
  const [regimen, setRegimen] = useState("");
  const [email, setEmail] = useState("");
  const [tel, setTel] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ rfc, razon_social: razon, regimen_fiscal: regimen || null, email: email || null, telefono: tel || null });
      }}
      className="rounded-xl border border-border/60 bg-card/50 p-5 grid sm:grid-cols-2 gap-3"
    >
      <Field label="RFC*">
        <input required value={rfc} onChange={(e) => setRfc(e.target.value.toUpperCase())} placeholder="XAXX010101000" className="input-ctrl font-mono" />
      </Field>
      <Field label="Razón social*">
        <input required value={razon} onChange={(e) => setRazon(e.target.value)} placeholder="Servicios García SA de CV" className="input-ctrl" />
      </Field>
      <Field label="Régimen fiscal">
        <select value={regimen} onChange={(e) => setRegimen(e.target.value)} className="input-ctrl">
          <option value="">Selecciona...</option>
          {REGIMENES.map((r) => <option key={r}>{r}</option>)}
        </select>
      </Field>
      <Field label="Email contacto">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contacto@empresa.mx" className="input-ctrl" />
      </Field>
      <Field label="Teléfono">
        <input value={tel} onChange={(e) => setTel(e.target.value)} placeholder="+52 ..." className="input-ctrl" />
      </Field>
      <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
        <Button type="submit" variant="hero" disabled={loading}>
          {loading ? "Creando..." : "Crear expediente"}
        </Button>
      </div>
      <style>{`.input-ctrl { height:38px; padding:0 12px; border-radius:8px; background:hsl(var(--input) / 0.5); border:1px solid hsl(var(--border)); font-size:14px; outline:none; width:100%; } .input-ctrl:focus { box-shadow:0 0 0 1px hsl(var(--ring)); }`}</style>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground mb-1 block">{label}</span>
      {children}
    </label>
  );
}
