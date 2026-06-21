import { Link } from "@tanstack/react-router";
import { Logo } from "./Logo";
import { Button } from "./ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/50 glass">
      <div className="mx-auto max-w-7xl flex h-16 items-center justify-between px-6">
        <Link to="/"><Logo /></Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <a href="/#features" className="hover:text-foreground transition-colors">Producto</a>
          <a href="/#modules" className="hover:text-foreground transition-colors">Módulos</a>
          <Link to="/precios" className="hover:text-foreground transition-colors">Precios</Link>
          <Link to="/seguridad" className="hover:text-foreground transition-colors">Seguridad</Link>
          <Link to="/contacto" className="hover:text-foreground transition-colors">Contacto</Link>

        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to="/auth">Iniciar sesión</Link>
          </Button>
          <Button asChild size="sm" variant="hero">
            <Link to="/auth">Probar gratis</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
