import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";

export const Route = createFileRoute("/terminos")({
  head: () => ({
    meta: [
      { title: "Términos y Condiciones — ContaClick IA" },
      { name: "description", content: "Términos y Condiciones de uso de la plataforma ContaClick IA." },
    ],
  }),
  component: TerminosPage,
});

function TerminosPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-4xl font-semibold tracking-tight">Términos y Condiciones</h1>
        <p className="text-sm text-muted-foreground mt-2">Última actualización: 19 de junio de 2026</p>

        <section className="mt-8 space-y-4 text-sm leading-relaxed text-muted-foreground">
          <h2 className="text-foreground text-xl font-semibold pt-2">1. Aceptación</h2>
          <p>Al registrarte y usar ContaClick IA aceptas estos Términos en su totalidad. Si no estás de acuerdo, abstente de usar la Plataforma.</p>

          <h2 className="text-foreground text-xl font-semibold pt-4">2. Licencia de uso</h2>
          <p>Se te otorga una licencia limitada, no exclusiva e intransferible para usar la Plataforma de acuerdo con el plan contratado.</p>

          <h2 className="text-foreground text-xl font-semibold pt-4">3. Obligaciones del usuario</h2>
          <p>Eres responsable de la veracidad de los datos cargados (CFDI, estados de cuenta, RFC) y del uso adecuado de las credenciales fiscales (CIEC, e.firma) bajo tu control.</p>

          <h2 className="text-foreground text-xl font-semibold pt-4">4. Planes y pagos</h2>
          <p>La Plataforma opera bajo modelo SaaS con suscripción mensual o anual. Los cobros se realizan por adelantado. No hay reembolsos por periodos parciales.</p>

          <h2 className="text-foreground text-xl font-semibold pt-4">5. Limitación de responsabilidad</h2>
          <p>ContaClick IA es una herramienta de apoyo al contador. <strong className="text-foreground">No sustituye el criterio profesional</strong> ni la responsabilidad del contribuyente o su asesor fiscal frente al SAT.</p>

          <h2 className="text-foreground text-xl font-semibold pt-4">6. Propiedad intelectual</h2>
          <p>Todo el software, marca, diseño y contenido es propiedad de ContaClick IA. Queda prohibida su reproducción sin autorización.</p>

          <h2 className="text-foreground text-xl font-semibold pt-4">7. Terminación</h2>
          <p>Podemos suspender la cuenta por incumplimiento o uso indebido. Podrás cancelar tu suscripción en cualquier momento desde tu panel.</p>

          <h2 className="text-foreground text-xl font-semibold pt-4">8. Jurisdicción</h2>
          <p>Estos Términos se rigen por las leyes de los Estados Unidos Mexicanos. Cualquier controversia se someterá a los tribunales de la Ciudad de México.</p>
        </section>

        <div className="mt-12">
          <Link to="/" className="text-sm text-primary hover:underline">← Volver al inicio</Link>
        </div>
      </main>
    </div>
  );
}
