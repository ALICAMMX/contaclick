// ─────────────────────────────────────────────────────────────────────────────
// REGLAS FISCALES DE SEGURIDAD PARA CONTI
//
// Conti NO calcula impuestos por su cuenta. Cualquier cifra fiscal que llegue
// al usuario debe provenir de un motor determinista con sello normativo. Si el
// usuario pide un cálculo, Conti explica el procedimiento y deriva a la
// herramienta que sí puede firmarlo.
// ─────────────────────────────────────────────────────────────────────────────

import { inventarioNormativo } from "@/lib/fiscal/normativa/motor";

export type DerivacionCalculo = {
  requiere: boolean;
  motivo: string | null;
  herramienta: string | null;
  ruta: string | null;
};

const DISPARADORES: { re: RegExp; herramienta: string; ruta: string }[] = [
  {
    re: /\bresico\b/i,
    herramienta: "Calculadora RESICO",
    ruta: "/app/tools/resico-calculator",
  },
  {
    re: /\b(persona moral|pm|coeficiente de utilidad|pago provisional de la empresa)\b/i,
    herramienta: "ISR / IVA Persona Moral",
    ruta: "/app/tools/isr-iva-pm",
  },
  {
    re: /\b(isr|iva|pago provisional|retenci[oó]n|subsidio|n[oó]mina|salarios|aguinaldo|ptu|finiquito)\b/i,
    herramienta: "Calculadora ISR / IVA",
    ruta: "/app/tools/isr-iva-calculator",
  },
];

const VERBOS_CALCULO =
  /\b(calcula|cu[aá]nto|cu[aá]nta|import[eo]|determina|c[oó]mo se calcula|cu[aá]l ser[ií]a|estim[ao]|res[uú]ltame|dame el monto)\b/i;

const HAY_CIFRA = /\d[\d,.]{2,}/;

/**
 * Detecta que el usuario pide una cifra fiscal concreta. En ese caso Conti debe
 * derivar al motor determinista en lugar de improvisar aritmética.
 */
export function detectarCalculo(texto: string): DerivacionCalculo {
  const t = String(texto ?? "");
  const pideCifra = VERBOS_CALCULO.test(t) && (HAY_CIFRA.test(t) || /\bisr|iva|resico|subsidio\b/i.test(t));
  if (!pideCifra) return { requiere: false, motivo: null, herramienta: null, ruta: null };

  const match = DISPARADORES.find((d) => d.re.test(t));
  if (!match) {
    return {
      requiere: true,
      motivo: "El usuario pide una cifra fiscal y no hay motor determinista asociado.",
      herramienta: null,
      ruta: null,
    };
  }
  return {
    requiere: true,
    motivo: "El usuario pide una cifra fiscal: debe calcularse con el motor determinista sellado.",
    herramienta: match.herramienta,
    ruta: match.ruta,
  };
}

/** Inventario compacto de vigencias normativas cargadas en la plataforma. */
export function digestNormativo(): string {
  const filas = inventarioNormativo().map(
    (c) =>
      `- ${c.impuesto} · ${c.regimen} · ejercicio ${c.ejercicio} (v${c.version}) — vigencia ${c.vigencia} — ${c.fuente} — cotejo: ${c.verificacion.estado}`,
  );
  return filas.join("\n");
}

export const REGLA_CALCULO = `REGLA DE CÁLCULO (inviolable):
- No inventes ni improvises tarifas, límites inferiores, cuotas fijas, porcentajes de subsidio, UMA ni topes.
- No hagas aritmética fiscal en el chat para producir una cifra que el usuario vaya a usar.
- Explica el procedimiento y deriva SIEMPRE a la herramienta determinista correspondiente, que aplica el Anexo 8 vigente y firma el resultado con su sello normativo.
- Si el periodo solicitado no tiene tabla cargada, dilo: el cálculo se bloquea, no se usa la tabla de otro ejercicio.`;
