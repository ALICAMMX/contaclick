import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/privacidad")({
  component: PrivacidadPage,
  head: () => ({
    meta: [
      { title: "Aviso de Privacidad — Contaclick" },
      {
        name: "description",
        content:
          "Aviso de Privacidad de Contaclick, plataforma administrada por Grupo ALICAM, responsable del tratamiento de datos personales conforme a la LFPDPPP.",
      },
    ],
  }),
});

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold mb-3">
        {n}. {title}
      </h2>
      <div className="space-y-3 text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

function PrivacidadPage() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/"><Logo /></Link>
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">
            Volver
          </Link>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold mb-2">Aviso de Privacidad</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Última actualización: junio 2026 · Aplica a la plataforma <strong>Contaclick</strong>.
        </p>

        <Section n="1" title="Identidad del Responsable">
          <p>
            <strong>Grupo ALICAM</strong>, con domicilio en Playa Pichilingue #106, Colonia Militar
            Marte, Alcaldía Iztacalco, Ciudad de México, es el responsable del tratamiento de sus
            datos personales y administra la plataforma <strong>Contaclick</strong>
            (<a className="underline" href="https://contaclick.lovable.app">contaclick.lovable.app</a>),
            de acuerdo con la Ley Federal de Protección de Datos Personales en Posesión de los
            Particulares (LFPDPPP) y su Reglamento.
          </p>
        </Section>

        <Section n="2" title="Datos Personales Recabados">
          <p>
            Recabamos sus datos personales cuando se registra en Contaclick, contrata o utiliza el
            servicio, se comunica con soporte o navega en el sitio. Tratamos las siguientes
            categorías de datos:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Identificación: nombre, apellidos, correo electrónico, contraseña cifrada.</li>
            <li>Despacho/empresa: nombre comercial, RFC, datos fiscales, dirección.</li>
            <li>Contacto: teléfono, dirección.</li>
            <li>
              Datos contables y fiscales que usted carga voluntariamente (CFDI, constancias, estados
              de cuenta, credenciales SAT/CIEC y FIEL) para la operación del servicio.
            </li>
            <li>Datos de navegación: dirección IP, cookies, páginas visitadas, dispositivo.</li>
            <li>Datos de pago necesarios para procesar su suscripción.</li>
          </ul>
          <p>
            Las credenciales del SAT y archivos de la e.firma se almacenan cifrados y se usan
            únicamente para automatizar trámites que usted autorice expresamente dentro de la
            plataforma.
          </p>
        </Section>

        <Section n="3" title="Finalidades del Tratamiento">
          <p>Finalidades primarias (necesarias para el servicio):</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Crear y administrar su cuenta y la de los miembros de su despacho.</li>
            <li>
              Prestar los servicios de contabilidad asistida, conciliación bancaria, gestión de CFDI,
              cumplimiento fiscal y herramientas de IA contratados.
            </li>
            <li>Procesar pagos, facturación y cobranza.</li>
            <li>Brindar soporte técnico y atención a usuarios.</li>
            <li>Cumplir obligaciones legales, fiscales y contractuales.</li>
            <li>Prevenir fraude y proteger la seguridad de la plataforma.</li>
          </ul>
          <p>Finalidades secundarias (requieren su consentimiento y puede oponerse):</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Envío de novedades del producto, contenidos y promociones.</li>
            <li>Análisis estadístico y mejora de funcionalidades.</li>
          </ul>
        </Section>

        <Section n="4" title="Transferencias de Datos">
          <p>
            Para operar Contaclick compartimos datos con proveedores que actúan como encargados del
            tratamiento bajo contrato y obligación de confidencialidad:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Infraestructura, base de datos y autenticación (proveedores de nube).</li>
            <li>Procesadores de pago para gestionar suscripciones.</li>
            <li>Proveedores de correo transaccional para notificaciones de la cuenta.</li>
            <li>Proveedores de modelos de IA para las funciones de asistente contable.</li>
            <li>
              Autoridades fiscales y administrativas cuando usted autorice un trámite o cuando lo
              exija la ley.
            </li>
          </ul>
          <p>
            No vendemos sus datos personales ni los compartimos con terceros para fines comerciales
            ajenos al servicio.
          </p>
        </Section>

        <Section n="5" title="Derechos ARCO y revocación del consentimiento">
          <p>
            Usted puede ejercer en cualquier momento sus derechos de Acceso, Rectificación,
            Cancelación y Oposición (ARCO), así como revocar el consentimiento para el tratamiento
            de sus datos, enviando su solicitud a{" "}
            <a className="underline" href="mailto:2020alicam@gmail.com">2020alicam@gmail.com</a>{" "}
            o al teléfono +52 (55) 4528-2044. La solicitud deberá incluir nombre, correo
            registrado en Contaclick y el derecho que desea ejercer.
          </p>
        </Section>

        <Section n="6" title="Cookies y tecnologías de rastreo">
          <p>
            Contaclick utiliza cookies y almacenamiento local para mantener su sesión iniciada,
            recordar preferencias y medir el uso del producto. Puede deshabilitarlas desde su
            navegador, considerando que algunas funcionalidades pueden dejar de operar
            correctamente.
          </p>
        </Section>

        <Section n="7" title="Medidas de seguridad">
          <p>
            Grupo ALICAM ha implementado medidas administrativas, técnicas y físicas razonables
            para proteger sus datos personales: cifrado en tránsito (TLS) y en reposo para
            credenciales sensibles, control de acceso por roles, registros de auditoría y
            separación de datos por despacho mediante políticas de seguridad a nivel de fila.
          </p>
        </Section>

        <Section n="8" title="Conservación y eliminación de datos">
          <p>
            Conservamos sus datos mientras mantenga una cuenta activa y por los plazos adicionales
            que exija la legislación fiscal y mercantil aplicable. Al darse de baja puede
            solicitar la eliminación de los datos que no estemos obligados a conservar.
          </p>
        </Section>

        <Section n="9" title="Cambios al Aviso de Privacidad">
          <p>
            Podremos actualizar este aviso para reflejar cambios legales, operativos o del
            servicio. Publicaremos la versión vigente en esta página y, cuando los cambios sean
            sustanciales, le notificaremos por correo electrónico.
          </p>
        </Section>

        <Section n="10" title="Consentimiento">
          <p>
            Al registrarse en Contaclick y proporcionar sus datos personales, usted manifiesta
            haber leído y aceptado este Aviso de Privacidad y consiente el tratamiento de sus
            datos conforme a los términos aquí descritos.
          </p>
        </Section>

        <div className="border-t pt-6 mt-10 text-sm text-muted-foreground">
          <p><strong>Responsable:</strong> Grupo ALICAM</p>
          <p><strong>Domicilio:</strong> Playa Pichilingue #106, Col. Militar Marte, Iztacalco, CDMX.</p>
          <p>
            <strong>Email:</strong>{" "}
            <a className="underline" href="mailto:2020alicam@gmail.com">2020alicam@gmail.com</a>
          </p>
          <p><strong>Teléfono:</strong> +52 (55) 4528-2044</p>
          <p className="mt-2">
            Aviso completo de Grupo ALICAM:{" "}
            <a className="underline" href="https://alicam.com.mx/privacidad" target="_blank" rel="noreferrer">
              alicam.com.mx/privacidad
            </a>
          </p>
        </div>
      </article>
    </main>
  );
}
