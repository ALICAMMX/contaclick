import { createFileRoute } from "@tanstack/react-router";
import { Upload } from "lucide-react";

export const Route = createFileRoute("/portal/documentos")({
  component: DocumentosPage,
});

function DocumentosPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Documentos</h1>
        <p className="text-sm text-muted-foreground mt-1">Sube los documentos que tu contador te solicite.</p>
      </header>
      <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
        Próximamente: bandeja de pendientes y carga de documentos.
      </div>
    </div>
  );
}
