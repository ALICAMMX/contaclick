import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Logo } from "./Logo";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "./ui/sheet";

const navLinks = [
  { href: "/#features", label: "Producto", isHash: true },
  { href: "/#modules", label: "Módulos", isHash: true },
  { to: "/precios", label: "Precios" },
  { to: "/seguridad", label: "Seguridad" },
  { to: "/contacto", label: "Contacto" },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/50 glass">
      <div className="mx-auto max-w-7xl flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
        <Link to="/" className="shrink-0"><Logo /></Link>

        <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          {navLinks.map((l) =>
            "isHash" in l ? (
              <a key={l.href} href={l.href} className="hover:text-foreground transition-colors">{l.label}</a>
            ) : (
              <Link key={l.to} to={l.to} className="hover:text-foreground transition-colors">{l.label}</Link>
            )
          )}
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to="/auth">Iniciar sesión</Link>
          </Button>
          <Button asChild size="sm" variant="hero" className="hidden xs:inline-flex sm:inline-flex">
            <Link to="/auth">Probar gratis</Link>
          </Button>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menú">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px] sm:w-[320px]">
              <SheetHeader>
                <SheetTitle><Logo /></SheetTitle>
              </SheetHeader>
              <nav className="mt-6 flex flex-col gap-1">
                {navLinks.map((l) =>
                  "isHash" in l ? (
                    <a
                      key={l.href}
                      href={l.href}
                      onClick={() => setOpen(false)}
                      className="rounded-md px-3 py-3 text-sm text-foreground hover:bg-accent"
                    >
                      {l.label}
                    </a>
                  ) : (
                    <Link
                      key={l.to}
                      to={l.to}
                      onClick={() => setOpen(false)}
                      className="rounded-md px-3 py-3 text-sm text-foreground hover:bg-accent"
                    >
                      {l.label}
                    </Link>
                  )
                )}
              </nav>
              <div className="mt-6 flex flex-col gap-2">
                <Button asChild variant="outline" onClick={() => setOpen(false)}>
                  <Link to="/auth">Iniciar sesión</Link>
                </Button>
                <Button asChild variant="hero" onClick={() => setOpen(false)}>
                  <Link to="/auth">Probar gratis</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
