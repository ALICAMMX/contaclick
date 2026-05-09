import { Sparkles } from "lucide-react";

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dims = size === "sm" ? "h-7 w-7" : size === "lg" ? "h-10 w-10" : "h-8 w-8";
  const text = size === "sm" ? "text-base" : size === "lg" ? "text-2xl" : "text-lg";
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`${dims} rounded-lg flex items-center justify-center relative overflow-hidden`}
        style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
      >
        <Sparkles className="h-4 w-4 text-primary-foreground relative z-10" strokeWidth={2.5} />
      </div>
      <div className={`font-display font-semibold ${text} tracking-tight`}>
        Conta<span className="gradient-text">Click</span>
        <span className="text-muted-foreground font-normal ml-1">IA</span>
      </div>
    </div>
  );
}
