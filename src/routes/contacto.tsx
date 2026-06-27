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

  const [sending, setSending] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      toast.error("Completa nombre, correo y mensaje.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/public/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, telefono, despacho, message }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || "No se pudo enviar tu mensaje.");
        setSending(false);
        return;
      }
      setSent(true);
      toast.success("¡Mensaje enviado! Te respondemos en menos de 24 hrs.");
    } catch {
      toast.error("Error de red. Intenta de nuevo.");
    } finally {
      setSending(false);
    }
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
          ¡Tu mensaje fue enviado correctamente! Un asesor de ContaClick te contactará en menos de 24 hrs hábiles. También te llegó una copia a <strong>{email}</strong>.
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
            <Button type="submit" variant="hero" className="w-full h-11" disabled={sending}>
              {sending ? "Enviando…" : "Enviar mensaje"}
            </Button>
            <Button asChild variant="outline" className="w-full h-11 gap-2">
              <a href="https://wa.me/5215545282044?text=Hola,%20quiero%20información%20sobre%20ContaClick%20IA" target="_blank" rel="noopener noreferrer">
                <WhatsAppIcon className="h-5 w-5" />
                O escríbenos directo al WhatsApp
              </a>
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

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.669.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.434-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.174 0C5.413 0 .104 5.309.104 12.04c0 2.117.553 4.183 1.605 6.008L0 24l6.305-1.654a11.882 11.882 0 006.79 2.13c6.768 0 12.076-5.309 12.076-12.04 0-3.212-1.251-6.233-3.492-8.478" />
    </svg>
  );
}

