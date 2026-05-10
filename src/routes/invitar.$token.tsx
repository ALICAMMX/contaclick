import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getInvitationByToken, acceptInvitation } from "@/lib/equipo/equipo.functions";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { Building2, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/invitar/$token")({
  component: AcceptInvitationPage,
  head: () => ({ meta: [{ title: "Invitación · CFDI Cloud" }] }),
});

function AcceptInvitationPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const fetchInv = useServerFn(getInvitationByToken);
  const acceptFn = useServerFn(acceptInvitation);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setHasSession(!!data.session));
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => fetchInv({ data: { token } }),
    enabled: hasSession === true,
  });

  if (hasSession === null) return <CenterShell><p className="text-muted-foreground">Cargando…</p></CenterShell>;

  if (!hasSession) {
    const redirectUrl = `/invitar/${token}`;
    return (
      <CenterShell>
        <h1 className="text-xl font-semibold mb-2">Inicia sesión para aceptar la invitación</h1>
        <p className="text-sm text-muted-foreground mb-6">Crea una cuenta o inicia sesión para unirte al despacho.</p>
        <Button asChild className="w-full">
          <Link to="/auth" search={{ next: redirectUrl } as any}>Ir a iniciar sesión</Link>
        </Button>
        <p className="text-xs text-muted-foreground mt-4">
          Al iniciar sesión, regresa a este link para completar la invitación.
        </p>
      </CenterShell>
    );
  }

  if (isLoading) return <CenterShell><p className="text-muted-foreground">Validando invitación…</p></CenterShell>;

  const inv = data?.invitation;
  if (!inv || inv.used || inv.revoked || inv.expired) {
    return (
      <CenterShell>
        <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
        <h1 className="text-xl font-semibold mb-2">Invitación no válida</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {!inv ? "Este link no existe." : inv.used ? "Ya fue utilizada." : inv.revoked ? "Fue cancelada por el administrador." : "Expiró."}
        </p>
        <Button asChild variant="outline"><Link to="/app">Ir a la app</Link></Button>
      </CenterShell>
    );
  }

  const onAccept = async () => {
    setAccepting(true);
    try {
      await acceptFn({ data: { token } });
      toast.success(`Te uniste a ${inv.despacho_nombre}`);
      navigate({ to: "/app" });
    } catch (e: any) {
      toast.error(e?.message ?? "Error al aceptar");
      setAccepting(false);
    }
  };

  return (
    <CenterShell>
      <Building2 className="h-10 w-10 text-primary mx-auto mb-3" />
      <h1 className="text-xl font-semibold mb-1">Te invitaron a unirte a</h1>
      <p className="text-2xl font-bold text-primary mb-6">{inv.despacho_nombre}</p>
      <p className="text-sm text-muted-foreground mb-6">
        Te unirás como <span className="font-medium text-foreground">{inv.role === "despacho" ? "administrador" : "colaborador"}</span>.
      </p>
      <Button onClick={onAccept} disabled={accepting} className="w-full">
        <CheckCircle2 className="h-4 w-4 mr-2" />
        {accepting ? "Aceptando…" : "Aceptar invitación"}
      </Button>
    </CenterShell>
  );
}

function CenterShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="rounded-xl border border-border bg-card/40 backdrop-blur p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
