import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { Shield, Lock, Database, Users, FileCheck, Mail, AlertTriangle, Server, KeyRound, ScrollText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/seguridad")({
  head: () => ({
    meta: [
      { title: "Seguridad y privacidad — ContaClick" },
      {
        name: "description",
        content:
          "Cómo ContaClick protege la información fiscal y contable de tu despacho: cifrado, aislamiento por despacho, RLS, LFPDPPP y mejores prácticas.",
      },
    ],
  }),
  component: SeguridadPage,
});

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Shield;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center gap-3 space-y-0">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground leading-relaxed space-y-2">{children}</CardContent>
    </Card>
  );
}

function SeguridadPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-12 md:py-16">
        {/* Hero */}
        <header className="mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground mb-4">
            <Shield className="h-3.5 w-3.5 text-primary" />
            Confianza y seguridad
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Seguridad y privacidad
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl">
            ContaClick maneja información fiscal sensible de tu despacho y de tus clientes.
            Esta página describe, en lenguaje claro, qué hacemos para protegerla. Es contenido
            mantenido por el equipo de ContaClick y no constituye una certificación independiente.
          </p>
          <p className="text-xs text-muted-foreground mt-3">
            Última actualización: {new Date().toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </header>

        {/* Highlights grid */}
        <div className="grid gap-4 md:grid-cols-2 mb-10">
          <Section icon={Lock} title="Cifrado en tránsito y en reposo">
            <p>
              Todo el tráfico entre tu navegador y ContaClick viaja por <strong>HTTPS/TLS 1.2+</strong>.
              La base de datos cifra los datos en reposo a nivel de disco (AES-256 administrado por
              el proveedor de infraestructura). Las contraseñas se almacenan con <strong>bcrypt</strong>{" "}
              y nunca son visibles, ni para nosotros.
            </p>
          </Section>

          <Section icon={Users} title="Aislamiento por despacho (multi-tenant)">
            <p>
              Cada despacho es un tenant independiente. Toda tabla con datos del cliente lleva un
              campo <code>despacho_id</code> y políticas de <strong>Row-Level Security (RLS)</strong>{" "}
              en PostgreSQL: la base rechaza, a nivel de motor, cualquier intento de leer o escribir
              datos de un despacho al que el usuario no pertenezca. Esto incluye expedientes, CFDI,
              defensas, ejecuciones de herramientas y reportes.
            </p>
          </Section>

          <Section icon={KeyRound} title="Autenticación y control de acceso">
            <p>
              Acceso por correo + contraseña o Google. Soportamos <strong>roles dentro del despacho</strong>{" "}
              (propietario y colaborador) y <strong>revocación inmediata</strong> de invitaciones y
              accesos. Las sesiones usan tokens JWT de corta duración con rotación automática.
            </p>
          </Section>

          <Section icon={Database} title="Dónde viven tus datos">
            <p>
              ContaClick se aloja en infraestructura administrada de <strong>Lovable Cloud</strong>{" "}
              (PostgreSQL + edge compute). Los respaldos diarios automáticos del proveedor permiten
              recuperación punto en el tiempo (PITR). No vendemos ni cedemos datos a terceros para
              publicidad.
            </p>
          </Section>

          <Section icon={ScrollText} title="LFPDPPP (México) y privacidad">
            <p>
              Tratamos los datos personales y fiscales bajo la{" "}
              <strong>Ley Federal de Protección de Datos Personales en Posesión de los Particulares</strong>.
              Eres responsable del tratamiento; ContaClick actúa como encargado. Puedes ejercer
              derechos ARCO (acceso, rectificación, cancelación, oposición) escribiendo al contacto
              de privacidad listado abajo. Consulta también nuestro{" "}
              <a href="/privacidad" className="text-primary underline">aviso de privacidad</a>.
            </p>
          </Section>

          <Section icon={FileCheck} title="Datos del SAT y CFDI">
            <p>
              Los XML, RFC y CSF que subes se almacenan únicamente para que tu despacho los procese.
              No replicamos información a sistemas del SAT por tu cuenta sin tu autorización. Las
              credenciales sensibles (e.firma, CIEC) se guardan cifradas y solo se usan cuando tú
              ejecutas una herramienta que las requiere.
            </p>
          </Section>

          <Section icon={Server} title="Resiliencia y monitoreo">
            <p>
              Monitoreo de salud 24/7, alertas automáticas ante errores en producción y logs de
              auditoría para acciones críticas (invitaciones, cambios de rol, eliminaciones).
              Despliegues con rollback inmediato.
            </p>
          </Section>

          <Section icon={AlertTriangle} title="Reporte responsable de vulnerabilidades">
            <p>
              ¿Encontraste algo? Escríbenos a{" "}
              <a href="mailto:seguridad@contaclick.app" className="text-primary underline">
                seguridad@contaclick.app
              </a>
              . Te responderemos en menos de 72 horas. No realices pruebas que puedan afectar a otros
              usuarios o exfiltrar datos reales: usa una cuenta de prueba.
            </p>
          </Section>
        </div>

        {/* Shared responsibility */}
        <Card className="border-border/60 mb-10">
          <CardHeader>
            <CardTitle className="text-base">Modelo de responsabilidad compartida</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2 text-sm">
            <div>
              <p className="font-medium text-foreground mb-2">Lo que hace ContaClick</p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>Cifrado en tránsito y en reposo.</li>
                <li>Aislamiento por despacho con RLS a nivel de base.</li>
                <li>Respaldos automáticos diarios.</li>
                <li>Parches de seguridad y monitoreo continuo.</li>
                <li>Logs de auditoría de acciones sensibles.</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground mb-2">Lo que tú haces como despacho</p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>Usar contraseñas únicas y activar verificación cuando esté disponible.</li>
                <li>Revisar quién tiene acceso a tu despacho periódicamente.</li>
                <li>Revocar invitaciones de personas que ya no colaboran.</li>
                <li>No compartir credenciales de e.firma/CIEC por canales no seguros.</li>
                <li>Cumplir con el aviso de privacidad hacia tus propios clientes.</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Qualifier */}
        <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground mb-10">
          <p>
            <strong>Nota:</strong> ContaClick no cuenta hoy con certificaciones SOC&nbsp;2, ISO&nbsp;27001
            ni PCI-DSS. Si tu organización las requiere, contáctanos para evaluar tu caso. Esta
            página describe capacidades activas hoy; cualquier afirmación adicional sobre cumplimiento
            regulatorio (CFDI, SAT, IMSS) corresponde a tu despacho como responsable del tratamiento.
          </p>
        </div>

        {/* Contact */}
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            <div className="rounded-md bg-primary/10 p-2 text-primary">
              <Mail className="h-5 w-5" />
            </div>
            <CardTitle className="text-base">Contacto</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-1">
            <p>
              Seguridad: <a href="mailto:seguridad@contaclick.app" className="text-primary underline">seguridad@contaclick.app</a>
            </p>
            <p>
              Privacidad / ARCO:{" "}
              <a href="mailto:privacidad@contaclick.app" className="text-primary underline">privacidad@contaclick.app</a>
            </p>
            <p>
              Soporte general:{" "}
              <a href="mailto:hola@contaclick.app" className="text-primary underline">hola@contaclick.app</a>
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
