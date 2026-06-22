import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Upload, CheckCircle2, AlertCircle, FileSpreadsheet, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ImportDialog, type ColSpec } from "@/components/ImportDialog";
import { upsertClienteFromCsf } from "@/lib/clientes.functions";

export const Route = createFileRoute("/app/tools/import-clientes")({
  component: ImportClientesPage,
});

const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/i;

const COLUMNS: ColSpec[] = [
  { key: "rfc", label: "RFC", required: true, example: "GAJP800101AB1", hint: "13 caracteres (PF) o 12 (PM)" },
  { key: "razon_social", label: "Razón social", required: true, example: "Servicios García SA de CV" },
  { key: "tipo_persona", label: "Tipo persona", example: "fisica | moral", hint: "fisica o moral" },
  { key: "regimen_fiscal", label: "Régimen fiscal", example: "626 - RESICO Personas Físicas" },
  { key: "codigo_postal", label: "Código postal", example: "06600" },
  { key: "email", label: "Email", example: "contacto@empresa.mx" },
  { key: "telefono", label: "Teléfono", example: "+52 55 1234 5678" },
  { key: "tipo_relacion", label: "Tipo", example: "cliente", hint: "cliente | proveedor | acreedor (default: cliente)" },
];

const TEMPLATE_ROWS = [
  { rfc: "GAJP800101AB1", razon_social: "Pedro García Juárez", tipo_persona: "fisica", regimen_fiscal: "626 - RESICO Personas Físicas", codigo_postal: "06600", email: "pedro@ejemplo.mx", telefono: "5512345678", tipo_relacion: "cliente" },
  { rfc: "SGA010101A23", razon_social: "Servicios García SA de CV", tipo_persona: "moral", regimen_fiscal: "601 - General de Ley Personas Morales", codigo_postal: "11000", email: "contacto@sga.mx", telefono: "5587654321", tipo_relacion: "cliente" },
];

type RowResult = { rfc: string; razon_social: string; status: "ok" | "error"; accion?: string; message?: string };

function ImportClientesPage() {
  const upsert = useServerFn(upsertClienteFromCsf);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<RowResult[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const mut = useMutation({
    mutationFn: async (rows: Record<string, any>[]) => {
      const out: RowResult[] = [];
      setProgress({ done: 0, total: rows.length });
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rfc = String(r.rfc ?? "").trim().toUpperCase();
        const razon = String(r.razon_social ?? "").trim();
        try {
          if (!RFC_REGEX.test(rfc)) throw new Error("RFC inválido");
          if (razon.length < 2) throw new Error("Razón social requerida");
          const tipoPersona = String(r.tipo_persona ?? "").toLowerCase().trim();
          const tipoRel = String(r.tipo_relacion ?? "cliente").toLowerCase().trim();
          const res = await upsert({
            data: {
              rfc,
              razon_social: razon,
              regimen_fiscal: r.regimen_fiscal ? String(r.regimen_fiscal) : null,
              codigo_postal: r.codigo_postal ? String(r.codigo_postal) : null,
              tipo_persona: tipoPersona === "fisica" || tipoPersona === "moral" ? tipoPersona : null,
              tipo_relacion: ["cliente", "proveedor", "acreedor"].includes(tipoRel) ? tipoRel : "cliente",
            } as any,
          });
          out.push({ rfc, razon_social: razon, status: "ok", accion: res.accion });
        } catch (e: any) {
          out.push({ rfc, razon_social: razon, status: "error", message: e?.message ?? "Error desconocido" });
        }
        setProgress({ done: i + 1, total: rows.length });
      }
      return out;
    },
    onSuccess: (out) => {
      setResults(out);
      const ok = out.filter((r) => r.status === "ok").length;
      const err = out.length - ok;
      qc.invalidateQueries({ queryKey: ["clientes"] });
      qc.invalidateQueries({ queryKey: ["rfcs-vinculados"] });
      if (err === 0) toast.success(`Importación completa: ${ok} registros`);
      else toast.warning(`${ok} importados, ${err} con error`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Importar cartera de clientes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Migra tu cartera completa desde Excel o CSV. Cada fila se valida y se guarda en RFC vinculados;
          los marcados como <b>cliente</b> aparecen también en Expedientes.
        </p>
      </div>

      <div className="rounded-xl border border-border/60 bg-card/50 p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="font-medium">Plantilla Excel</div>
            <p className="text-sm text-muted-foreground mt-1">
              Descarga la plantilla, llénala con tus clientes (uno por fila) y súbela. Aceptamos hasta 500 filas
              por importación. Si un RFC ya existe se actualiza, no se duplica.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <Button variant="hero" onClick={() => setOpen(true)}>
                <Upload className="h-4 w-4" /> Iniciar importación
              </Button>
              <Link to="/app/rfcs-vinculados" className="inline-flex items-center gap-1.5 h-10 px-4 rounded-md border border-border text-sm hover:bg-accent/30">
                Ver RFC vinculados <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {progress && mut.isPending && (
        <div className="rounded-lg border border-border/60 bg-card/50 p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span>Procesando registros…</span>
            <span className="font-mono">{progress.done} / {progress.total}</span>
          </div>
          <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        </div>
      )}

      {results.length > 0 && !mut.isPending && (
        <div className="rounded-xl border border-border/60 bg-card/50 overflow-hidden">
          <div className="px-5 py-3 border-b border-border/40 flex items-center justify-between">
            <div className="text-sm font-medium">Resultado</div>
            <div className="text-xs text-muted-foreground">
              {results.filter((r) => r.status === "ok").length} ok · {results.filter((r) => r.status === "error").length} errores
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/30">
              <tr>
                <th className="text-left font-medium px-5 py-2.5 w-10"></th>
                <th className="text-left font-medium px-5 py-2.5">RFC</th>
                <th className="text-left font-medium px-5 py-2.5">Razón social</th>
                <th className="text-left font-medium px-5 py-2.5">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className="border-t border-border/30">
                  <td className="px-5 py-2.5">
                    {r.status === "ok"
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      : <AlertCircle className="h-4 w-4 text-destructive" />}
                  </td>
                  <td className="px-5 py-2.5 font-mono text-xs">{r.rfc || "—"}</td>
                  <td className="px-5 py-2.5">{r.razon_social || "—"}</td>
                  <td className="px-5 py-2.5 text-xs text-muted-foreground">
                    {r.status === "ok" ? (r.accion === "creado" ? "Creado" : "Actualizado") : r.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ImportDialog
        open={open}
        onClose={() => setOpen(false)}
        title="cartera de clientes"
        columns={COLUMNS}
        templateRows={TEMPLATE_ROWS}
        onImport={async (rows) => {
          setResults([]);
          await mut.mutateAsync(rows);
        }}
        helpNote={
          <>
            <b>RFC</b> y <b>Razón social</b> son obligatorios. Si dejas <b>Tipo</b> vacío se guarda como <b>cliente</b>.
            Los RFC repetidos se actualizan en lugar de duplicarse.
          </>
        }
      />
    </div>
  );
}
