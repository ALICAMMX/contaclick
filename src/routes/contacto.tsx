import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Mail, User as UserIcon, MessageSquare, Phone, Building2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const DESTINO = "2020alicam@gmail.com";
const ASUNTO = "CONTACLIK";

export const Route = createFileRoute("/contacto")({
  head: () => ({
    meta: [
      { title: "Contacto — ContaClick IA" },
      { name: "description", content: "Solicita información, demo o soporte de ContaClick IA. Te contactamos en menos de 24 horas." },
    ],
  }),
  component: ContactoPage,
});

function ContactoPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [despacho, setDespacho] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      toast.error("Completa nombre, correo y mensaje.");
      return;
    }

    const body = [
      `Nombre: ${name}`,
      `Correo: ${email}`,
      `Teléfono: ${telefono || "(no proporcionado)"}`,
      `Despacho / Empresa: ${despacho || "(no proporcionado)"}`,
      "",
      "Mensaje:",
      message,
      "",
      "—",
      `Enviado desde contaclick.lovable.app el ${new Date().toLocaleString("es-MX")}`,
    ].join("\n");

    const href = `mailto:${DESTINO}?subject=${encodeURIComponent(ASUNTO)}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
    setSent(true);
    toast.success("Abriendo tu cliente de correo para enviar el mensaje.");
  };

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-4xl font-semibold tracking-tight">Contáctanos</h1>
        <p className="text-muted-foreground mt-2">
          ¿Quieres una demo, tienes dudas o necesitas soporte? Déjanos tus datos y te respondemos en menos de 24 hrs.
        </p>

        {sent ? (
          <div className="mt-10 rounded-xl border border-success/30 bg-success/10 p-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
            <h2 className="mt-4 text-xl font-semibold">¡Listo!</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Si tu cliente de correo no se abrió automáticamente, escríbenos directo a{" "}
              <a href={`mailto:${DESTINO}?subject=${encodeURIComponent(ASUNTO)}`} className="text-primary hover:underline">
                {DESTINO}
              </a>{" "}
              con el asunto <strong>{ASUNTO}</strong>.
            </p>
            <Link to="/" className="inline-block mt-6 text-sm text-primary hover:underline">← Volver al inicio</Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <Field icon={UserIcon} placeholder="Tu nombre completo" value={name} onChange={setName} required />
            <Field icon={Mail} type="email" placeholder="tu@email.com" value={email} onChange={setEmail} required />
            <Field icon={Phone} type="tel" placeholder="Teléfono (opcional)" value={telefono} onChange={setTelefono} />
            <Field icon={Building2} placeholder="Despacho o empresa (opcional)" value={despacho} onChange={setDespacho} />
            <div className="relative">
              <MessageSquare className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <textarea
                placeholder="¿En qué te podemos ayudar?"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={6}
                className="w-full pl-10 pr-3 py-3 rounded-lg bg-input/50 border border-border text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>
            <Button type="submit" variant="hero" className="w-full h-11">
              Enviar mensaje
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              También puedes escribirnos directo a{" "}
              <a href={`mailto:${DESTINO}?subject=${encodeURIComponent(ASUNTO)}`} className="text-primary hover:underline">
                {DESTINO}
              </a>
            </p>
          </form>
        )}
      </main>
    </div>
  );
}

function Field({
  icon: Icon,
  ...props
}: {
  icon: typeof Mail;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="relative">
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <input
        type={props.type ?? "text"}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        required={props.required}
        className="w-full h-11 pl-10 pr-3 rounded-lg bg-input/50 border border-border text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}
