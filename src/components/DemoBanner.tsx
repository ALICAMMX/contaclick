import { useAuth } from "@/lib/auth";
import { DEMO_EMAIL } from "@/lib/demo/demo-account.functions";
import { Sparkles } from "lucide-react";

export function DemoBanner() {
  const { user } = useAuth();
  if (user?.email !== DEMO_EMAIL) return null;
  return (
    <div className="w-full bg-gradient-to-r from-primary/15 via-primary/10 to-primary/15 border-b border-primary/30 px-4 py-2 flex items-center justify-center gap-2 text-xs text-primary">
      <Sparkles className="h-3.5 w-3.5" />
      <span className="font-medium">Modo DEMO</span>
      <span className="text-primary/70">— Todos los datos son ficticios. Carga el showroom completo desde Configuración → Datos demo.</span>
    </div>
  );
}
