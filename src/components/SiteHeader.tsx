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
          <a href="/#pricing" className="hover:text-foreground transition-colors">Precios</a>
          <Link to="/app" className="hover:text-foreground transition-colors">Dashboard</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="hidden sm:inline-flex">Iniciar sesión</Button>
          <Button asChild size="sm" variant="hero">
            <Link to="/app">Probar gratis</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
