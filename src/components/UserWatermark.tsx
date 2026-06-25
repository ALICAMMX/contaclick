import { useAuth } from "@/lib/auth";

/**
 * Marca de agua diagonal con email del usuario.
 * Visible pero discreta; sirve como disuasión y forense en capturas de pantalla.
 * `pointer-events-none` para no bloquear interacción.
 */
export function UserWatermark() {
  const { user } = useAuth();
  const tag = user?.email ?? user?.id ?? "contaclick";
  const stamp = new Date().toISOString().slice(0, 10);
  const text = `${tag} · ${stamp}`;
  // Repetimos el texto en una rejilla diagonal usando un SVG como background.
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='520' height='260'>
    <text x='20' y='140' fill='rgba(148,163,184,0.10)' font-family='ui-monospace,monospace' font-size='14' transform='rotate(-22 260 130)'>${text}</text>
  </svg>`;
  const bg = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60] select-none print:block"
      style={{ backgroundImage: bg, backgroundRepeat: "repeat", mixBlendMode: "overlay" }}
    />
  );
}
