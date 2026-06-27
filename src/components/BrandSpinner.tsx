import logoC from "@/assets/contaclick-c.png.asset.json";

type Props = {
  size?: "sm" | "md" | "lg" | "xl";
  label?: string;
  fullscreen?: boolean;
};

const sizes = {
  sm: "h-8 w-8",
  md: "h-14 w-14",
  lg: "h-20 w-20",
  xl: "h-28 w-28",
};

export function BrandSpinner({ size = "md", label, fullscreen }: Props) {
  const dim = sizes[size];
  const spinner = (
    <div className="flex flex-col items-center gap-3">
      <div className={`relative ${dim}`}>
        {/* Anillo giratorio */}
        <span
          className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary animate-spin"
          style={{ animationDuration: "1.1s" }}
          aria-hidden
        />
        {/* Logo pulsando al centro */}
        <img
          src={logoC}
          alt="ContaClick"
          className="absolute inset-1.5 m-auto h-[70%] w-[70%] object-contain animate-pulse drop-shadow"
          style={{ animationDuration: "1.6s" }}
          draggable={false}
        />
      </div>
      {label && (
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      )}
    </div>
  );

  if (fullscreen) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="min-h-screen w-full flex items-center justify-center bg-background"
      >
        {spinner}
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center py-8">
      {spinner}
    </div>
  );
}
