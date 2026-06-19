import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";

export const Route = createFileRoute("/privacidad")({
  head: () => ({
    meta: [
      { title: "Aviso de Privacidad — ContaClick IA" },
      { name: "description", content: "Aviso de Privacidad de ContaClick IA conforme a la LFPDPPP de México." },
    ],
  }),
  component: PrivacidadPage,
});

function PrivacidadPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-16 prose prose-invert">
        <h1 className="text-4xl font-semibold tracking-tight">Aviso de Privacidad</h1>
        <p className="text-sm text-muted-foreground mt-2">Última actualización: 19 de junio de 2026</p>

        <section className="mt-8 space-y-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            <strong className="text-foreground">ContaClick IA</strong> (en adelante, "la Plataforma"), con domicilio en
            México, es responsable del tratamiento de sus datos personales conforme a la
            <em> Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP)</em>.
          </p>

          <h2 className="text-foreground text-xl font-semibold pt-4">1. Datos que recabamos</h2>
          <p>
            Recabamos datos de identificación (nombre, RFC, correo, teléfono), datos fiscales de sus clientes (CFDI, estados
            de cuenta, declaraciones), y datos de uso de la Plataforma.
          </p>

          <h2 className="text-foreground text-xl font-semibold pt-4">2. Finalidades</h2>
          <p>
            Procesamos los datos para: (i) prestar los servicios contratados (análisis de CFDI, conciliaciones, auditorías
            fiscales), (ii) facturación y cobranza, (iii) soporte técnico, (iv) cumplimiento de obligaciones legales y
            requerimientos de autoridad (SAT, IMSS, INFONAVIT).
          </p>

          <h2 className="text-foreground text-xl font-semibold pt-4">3. Transferencias</h2>
          <p>
            No transferimos sus datos a terceros sin su consentimiento, salvo a proveedores de infraestructura cifrada
            (nube) y autoridades competentes mediante mandato legal.
          </p>

          <h2 className="text-foreground text-xl font-semibold pt-4">4. Derechos ARCO</h2>
          <p>
            Usted puede ejercer sus derechos de <strong>Acceso, Rectificación, Cancelación y Oposición</strong> enviando
            un correo a <a href="mailto:privacidad@contaclick.mx" className="text-primary">privacidad@contaclick.mx</a>.
          </p>

          <h2 className="text-foreground text-xl font-semibold pt-4">5. Seguridad</h2>
          <p>
            Implementamos medidas administrativas, físicas y técnicas (cifrado en tránsito y en reposo, control de
            accesos, auditoría de logs) para proteger sus datos.
          </p>

          <h2 className="text-foreground text-xl font-semibold pt-4">6. Cambios al aviso</h2>
          <p>
            Cualquier modificación a este aviso se publicará en esta misma página.
          </p>
        </section>

        <div className="mt-12">
          <Link to="/" className="text-sm text-primary hover:underline">← Volver al inicio</Link>
        </div>
      </main>
    </div>
  );
}
