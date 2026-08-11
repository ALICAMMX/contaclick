// Prueba del PUENTE fiscal (sustituye a la antigua snapshot.test.ts, que sólo
// verificaba la forma del manifiesto y no probaba ningún cálculo).
//
// Lo que se demuestra aquí es que el puente EJECUTA los motores normativos
// reales: el resultado registrado se compara contra el ISR/IVA que producen las
// tarifas versionadas, no contra un valor provisto por el llamador.
import { describe, expect, it } from "vitest";
import { calcularYRegistrar, leerParametrosPrevios } from "./impuestos.puente";
import { calcularPreliminar, type EntradasFiscales } from "./impuestos";
import { calcularIsrPfMensual, calcularIva } from "@/lib/fiscal/normativa/motor";

const ENTRADAS: EntradasFiscales = {
  periodo: "2026-01",
  entradas_version: "entradas@1",
  regimen_sat: "612",
  regimen: "PF_GENERAL_MENSUAL",
  criterio: "flujo_efectivo",
  ingresos_cobrados_centavos: 15_000_00,
  ingresos_pue_centavos: 15_000_00,
  ingresos_ppd_centavos: 0,
  iva_trasladado_cobrado_centavos: 2_400_00,
  deducciones_pagadas_centavos: 5_000_00,
  deducciones_pue_centavos: 5_000_00,
  deducciones_ppd_centavos: 0,
  iva_acreditable_pagado_centavos: 800_00,
  isr_retenido_centavos: 0,
  iva_retenido_centavos: 0,
  faltantes: { comprobantes_sin_estatus_sat: 0, recibidos_sin_decision: 0, ppd_sin_complemento: 0 },
  evaluable: true,
  input_hash: "hash-evidencia-1",
};

function supabaseFalso(entradas: EntradasFiscales) {
  const registros: any[] = [];
  return {
    registros,
    rpc: async (fn: string, args: any) => {
      if (fn === "cierre_entradas_fiscales") return { data: entradas, error: null };
      if (fn === "cierre_registrar_resultado_fiscal") {
        registros.push(args);
        return { data: { ok: true }, error: null };
      }
      return { data: null, error: { message: `RPC inesperado: ${fn}` } };
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({
                data: [{ entradas: { parametros_humanos: { coeficiente_utilidad: 0.2 } } }],
              }),
            }),
          }),
        }),
      }),
    }),
  } as any;
}

describe("puente fiscal del cierre", () => {
  it("registra exactamente lo que producen los motores versionados de ISR e IVA", async () => {
    const sb = supabaseFalso(ENTRADAS);
    const r = await calcularYRegistrar(sb, "cli-1", "2026-01", {});

    expect(r.registrado).toBe(true);
    expect(sb.registros).toHaveLength(1);

    // Cálculo independiente con los motores reales.
    const isr = calcularIsrPfMensual(
      { ingresos_centavos: 15_000_00, deducciones_centavos: 5_000_00, retenciones_centavos: 0 },
      "2026-01",
    );
    const iva = calcularIva(
      { trasladado_centavos: 2_400_00, acreditable_centavos: 800_00, retenido_centavos: 0 },
      "2026-01",
    );

    const registrado = sb.registros[0]._resultado;
    expect(registrado.isr_a_cargo_centavos).toBe(isr.isr_a_cargo_centavos);
    expect(registrado.iva_a_cargo_centavos).toBe(iva.iva_a_cargo_centavos);
    expect(registrado.iva_a_favor_centavos).toBe(iva.iva_a_favor_centavos);
    // Un impuesto real, no un cero de relleno.
    expect(registrado.isr_a_cargo_centavos).toBeGreaterThan(0);
  });

  it("envía el input_hash de la evidencia, no uno del llamador", async () => {
    const sb = supabaseFalso(ENTRADAS);
    await calcularYRegistrar(sb, "cli-1", "2026-01", {});
    expect(sb.registros[0]._input_hash).toBe("hash-evidencia-1");
    expect(sb.registros[0]._normativa_sha256).toBeTruthy();
  });

  it("no registra nada cuando la evidencia es incompleta: falla cerrada", async () => {
    const incompletas: EntradasFiscales = {
      ...ENTRADAS,
      evaluable: false,
      faltantes: { comprobantes_sin_estatus_sat: 3, recibidos_sin_decision: 2, ppd_sin_complemento: 0 },
    };
    const sb = supabaseFalso(incompletas);
    const r = await calcularYRegistrar(sb, "cli-1", "2026-01", {});
    expect(r.registrado).toBe(false);
    expect(r.motivo).toBeTruthy();
    expect(sb.registros).toHaveLength(0);
    expect(calcularPreliminar(incompletas, {}).resultado).toBeNull();
  });

  it("recupera los parámetros humanos previos para que el sellado no los pierda", async () => {
    const sb = supabaseFalso(ENTRADAS);
    const previos = await leerParametrosPrevios(sb, "cli-1", "2026-01");
    expect(previos.coeficiente_utilidad).toBe(0.2);
  });
});
