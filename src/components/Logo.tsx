import logoAsset from "@/assets/contaclick-logo-transparent.png";

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" | "xl" }) {
  const h = size === "sm" ? "h-8" : size === "lg" ? "h-14" : size === "xl" ? "h-24" : "h-10";
  const text = size === "sm" ? "text-[10px]" : size === "lg" ? "text-sm" : size === "xl" ? "text-lg" : "text-xs";
  return (
    <div className="flex items-center gap-2">
      <img
        src={logoAsset.url}
        alt="ContaClick"
        className={`${h} w-auto object-contain`}
        loading="eager"
        decoding="async"
      />
      <span className={`font-display font-semibold tracking-wider text-muted-foreground ${text} uppercase`}>
        IA
      </span>
    </div>
  );
}
