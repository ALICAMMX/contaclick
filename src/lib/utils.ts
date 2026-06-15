import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formato de fecha estándar para México: dd/mm/aaaa.
 * Acepta strings ISO (YYYY-MM-DD), strings con hora, Date o null/undefined.
 */
export function fmtFechaMx(input: string | Date | null | undefined): string {
  if (!input) return "—";
  // ISO simple sin hora: parsear manualmente para evitar shift por timezone.
  if (typeof input === "string") {
    const m = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return String(input);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}
