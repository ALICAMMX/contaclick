import { createFileRoute, Link } from "@tanstack/react-router";
import { ModuleScaffold } from "@/components/ModuleScaffold";
import { HerramientaHelp } from "@/components/HerramientaHelp";
import { Boxes } from "lucide-react";
import { UnavailableNotice } from "@/components/CapabilityCard";
import { getCapability } from "@/lib/capabilities/registry";

export const Route = createFileRoute("/app/admin/inventarios")({ component: InvPage });

// Sin implementación real: esta pantalla no muestra KPI ni kardex simulados,
// porque un dato inventado no puede parecerse a información del expediente.
function InvPage() {
  const cap = getCapability("inventarios");
  return (
    <ModuleScaffold
      title="Inventarios"
      subtitle="Kardex derivado de CFDI emitidos y recibidos. Función en diseño: todavía no procesa información de tus expedientes."
      icon={<Boxes className="h-5 w-5" />}
      estado="proximamente"
      actions={<HerramientaHelp slug="admin-inventarios" />}
    >
      <UnavailableNotice mensaje={cap?.mensajeNoDisponible} />

      <div className="rounded-xl border border-border/60 bg-card/50 p-5 text-sm text-muted-foreground space-y-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Mientras tanto</div>
        <p>
          Puedes obtener el detalle de conceptos comprados y vendidos desde el{" "}
          <Link to="/app/tools/xml-bulk-reader" className="text-primary hover:underline">Lector masivo de XML</Link>{" "}
          y controlar la inversión en bienes desde{" "}
          <Link to="/app/admin/activos" className="text-primary hover:underline">Activos Fijos</Link>.
        </p>
      </div>
    </ModuleScaffold>
  );
}
