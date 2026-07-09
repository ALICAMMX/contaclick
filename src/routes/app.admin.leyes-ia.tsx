import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listLeyes, upsertLey, indexarLey } from "@/lib/leyes/leyes.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Database, BookOpen } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/admin/leyes-ia")({ component: LeyesIAAdmin });

type Ley = {
  id: string;
  clave: string;
  nombre: string;
  tipo: string;
  version: string | null;
  publicado: boolean;
  total_articulos: number;
  total_embeddings: number;
};

function LeyesIAAdmin() {
  const list = useServerFn(listLeyes);
  const upsert = useServerFn(upsertLey);
  const index = useServerFn(indexarLey);
  const q = useQuery({ queryKey: ["leyes-admin"], queryFn: () => list() });
  const leyes = (q.data?.leyes ?? []) as Ley[];

  const [form, setForm] = useState({ clave: "", nombre: "", tipo: "ley", version: "", publicado: true });
  const [selectedId, setSelectedId] = useState<string>("");
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState<"none" | "save" | "index">("none");

  async function saveLey() {
    if (!form.clave || !form.nombre) return toast.error("Clave y nombre son obligatorios");
    setBusy("save");
    try {
      const r = await upsert({ data: { ...form, tipo: form.tipo as any, version: form.version || null } });
      if (r.ok) { toast.success("Ley guardada"); setForm({ clave: "", nombre: "", tipo: "ley", version: "", publicado: true }); q.refetch(); }
      else toast.error(r.error ?? "Error");
    } finally { setBusy("none"); }
  }

  async function runIndex() {
    if (!selectedId || texto.length < 50) return toast.error("Selecciona ley y pega texto");
    setBusy("index");
    try {
      const r = await index({ data: { ley_id: selectedId, texto, reemplazar: true } });
      if (r.ok) { toast.success(`Indexado: ${r.articulos} artículos, ${r.embeddings} vectores`); setTexto(""); q.refetch(); }
      else toast.error(r.error ?? "Error");
    } finally { setBusy("none"); }
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-gold mb-2">
          <Database className="h-3 w-3" /> Super-admin
        </div>
        <h1 className="serif text-3xl">Corpus Legal IA</h1>
        <p className="text-sm text-muted-foreground mt-1">Carga leyes fiscales, artículo por artículo, para el chat de consulta legal con RAG.</p>
      </header>

      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Plus className="h-4 w-4" /> Nueva ley</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <Input placeholder="Clave (LISR)" value={form.clave} onChange={(e) => setForm({ ...form, clave: e.target.value.toUpperCase() })} />
          <Input className="md:col-span-2" placeholder="Nombre completo" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ley">Ley</SelectItem>
              <SelectItem value="reglamento">Reglamento</SelectItem>
              <SelectItem value="rmf">RMF</SelectItem>
              <SelectItem value="anexo">Anexo</SelectItem>
              <SelectItem value="criterio">Criterio normativo</SelectItem>
              <SelectItem value="jurisprudencia">Jurisprudencia</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Versión (2026)" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
        </div>
        <Button onClick={saveLey} disabled={busy !== "none"} size="sm">
          {busy === "save" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Guardar y publicar
        </Button>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><BookOpen className="h-4 w-4" /> Indexar texto</h2>
        <div className="grid md:grid-cols-[240px_1fr] gap-2 items-start">
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger><SelectValue placeholder="Selecciona ley" /></SelectTrigger>
            <SelectContent>
              {leyes.map((l) => <SelectItem key={l.id} value={l.id}>{l.clave} · {l.nombre.slice(0, 30)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={12}
            className="font-mono text-xs"
            placeholder={"Pega aquí el texto completo de la ley. El parser detecta 'Artículo N.-' automáticamente y genera un embedding por artículo.\n\nEjemplo:\nArtículo 1.- Están obligadas al pago del impuesto sobre la renta...\nArtículo 2.- Para los efectos de esta Ley, se considera establecimiento permanente..."}
          />
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">{texto.length.toLocaleString()} caracteres · ~{Math.ceil(texto.length / 4000)} artículos estimados</span>
          <Button onClick={runIndex} disabled={busy !== "none" || !selectedId || texto.length < 50}>
            {busy === "index" ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Indexando…</> : "Indexar y generar embeddings"}
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold mb-3">Leyes en el corpus ({leyes.length})</h2>
        {q.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : leyes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay leyes cargadas.</p>
        ) : (
          <div className="space-y-1.5">
            {leyes.map((l) => (
              <div key={l.id} className="flex items-center justify-between p-2 rounded border border-border bg-background text-sm">
                <div>
                  <span className="font-semibold">{l.clave}</span>
                  <span className="text-muted-foreground ml-2">{l.nombre}</span>
                  {l.version && <span className="text-xs text-muted-foreground ml-2">v{l.version}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{l.total_articulos} art.</Badge>
                  <Badge variant="outline" className="text-[10px]">{l.total_embeddings} vec.</Badge>
                  {l.publicado ? <Badge className="text-[10px]">Publicada</Badge> : <Badge variant="secondary" className="text-[10px]">Borrador</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
