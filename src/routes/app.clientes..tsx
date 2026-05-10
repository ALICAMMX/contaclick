
function Stat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "destructive" }) {
  return (
    <div className="rounded-md bg-background/60 border border-border/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${tone === "destructive" ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}
