// Pruebas del PUENTE fiscal (sustituyen a la antigua snapshot.test.ts, que sólo
// verificaba la forma del manifiesto y no probaba ningún cálculo).
//
// Se demuestra que el puente EJECUTA los motores normativos reales, que falla
// cerrada ante errores de lectura, que revalida la huella de la evidencia y que
// escribe únicamente por el escritor privilegiado del servidor.
import { describe, expect, it } from "vitest";
import { calcularYRegistrar, leerParametrosPrevios, FiscalNoComprobadoError } from "./impuestos.puente";
import { calcularPreliminar, type EntradasFiscales } from "./impuestos";
import { calcularIsrPf, calcularIva } from "@/lib/fiscal/normativa/motor";
import { verificarSelloNormativo } from "./sello-normativo";

const ENTRADAS: EntradasFiscales = {
  periodo: "2026-01",
  entradas_version: "entradas@2",
  regimen_sat: "612",
  regimen: "PF_GENERAL_MENSUAL",
  criterio: "flujo_efectivo",
  ingresos_cobrados_centavos: 15_000_00,
  ingresos_pue_centavos: 15_000_00,
  ingresos_ppd_centavos: 0,
  ingresos_nominales_acumulados_centavos: 15_000_00,
  iva_trasladado_cobrado_centavos: 2_400_00,
  deducciones_pagadas_centavos: 5_000_00,
  deducciones_pue_centavos: 5_000_00,
  deducciones_ppd_centavos: 0,
  iva_acreditable_pagado_centavos: 800_00,
  isr_retenido_centavos: 0,
  iva_retenido_centavos: 0,
  faltantes: {
    comprobantes_sin_estatus_sat: 0,
    recibidos_sin_decision: 0,
    ppd_sin_complemento: 0,
    cancelados: 0,
    recibidos_sin_regla_iva: 0,
    ppd_pagado_sin_complemento: 0,
    sin_tipo_cambio: 0,
    complementos_duplicados: 0,
  },
  evaluable: true,
  input_hash: "hash-evidencia-1",
};

function supabaseFalso(
  entradas: EntradasFiscales | EntradasFiscales[],
  opciones: { errorParametros?: string } = {},
) {
  const registros: any[] = [];
  const lecturas: EntradasFiscales[] = Array.isArray(entradas) ? [...entradas] : [];
  let i = 0;
  const sb: any = {
    registros,
    rpc: async (fn: string, args: any) => {
      if (fn === "cierre_entradas_fiscales") {
        const e = lecturas.length ? (lecturas[Math.min(i++, lecturas.length - 1)] as EntradasFiscales) : (entradas as EntradasFiscales);
        return { data: e, error: null };
      }
      if (fn === "cierre_registrar_resultado_fiscal_srv") {
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
              limit: async () =>
                opciones.errorParametros
                  ? { data: null, error: { message: opciones.errorParametros } }
                  : { data: [{ entradas: { parametros_humanos: { coeficiente_utilidad: 0.2 } } }], error: null },
            }),
          }),
        }),
      }),
    }),
  };
  return sb;
}

describe("puente fiscal del cierre", () => {
  it("registra exactamente lo que producen los motores versionados de ISR e IVA", async () => {
    const sb = supabaseFalso(ENTRADAS);
    const r = await calcularYRegistrar(sb, sb, "cli-1", "2026-01", {}, "user-1");

    expect(r.registrado).toBe(true);
    expect(sb.registros).toHaveLength(1);

    const isr = calcularIsrPf({
      periodo: "2026-01",
      ingresos: 15_000,
      deducciones: 5_000,
      retenciones: 0,
      pagosProvisionalesAnteriores: 0,
    });
    const iva = calcularIva({
      periodo: "2026-01",
      ivaTrasladado: 2_400,
      ivaAcreditable: 800,
      ivaRetenido: 0,
      saldoAFavorAnterior: 0,
    });
    const cent = (n: number) => Math.round(n * 100);

    const registrado = sb.registros[0]._resultado;
    expect(registrado.isr_a_cargo_centavos).toBe(cent(isr.isrACargo));
    expect(registrado.iva_a_cargo_centavos).toBe(cent(iva.ivaACargo));
    expect(registrado.iva_a_favor_centavos).toBe(cent(iva.ivaAFavor));
    expect(registrado.isr_a_cargo_centavos).toBeGreaterThan(0);
  });

  it("envía el input_hash de la evidencia y un SHA-256 normativo real recalculable", async () => {
    const sb = supabaseFalso(ENTRADAS);
    await calcularYRegistrar(sb, sb, "cli-1", "2026-01", {}, "user-1");
    expect(sb.registros[0]._input_hash).toBe("hash-evidencia-1");
    expect(sb.registros[0]._normativa_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(verificarSelloNormativo(sb.registros[0]._normativa).valido).toBe(true);
    // Alterar el objeto normativo invalida la huella.
    const alterado = {
      ...sb.registros[0]._normativa,
      conjuntos: sb.registros[0]._normativa.conjuntos.map((c: any) => ({ ...c, version: "adulterada" })),
    };
    expect(verificarSelloNormativo(alterado).valido).toBe(false);
  });

  it("escribe sólo por el escritor privilegiado, distinto del cliente de lectura", async () => {
    const lectura = supabaseFalso(ENTRADAS);
    const escritor = supabaseFalso(ENTRADAS);
    await calcularYRegistrar(lectura, escritor, "cli-1", "2026-01", {}, "user-1");
    expect(lectura.registros).toHaveLength(0);
    expect(escritor.registros).toHaveLength(1);
    expect(escritor.registros[0]._solicitado_por).toBe("user-1");
  });

  it("no registra nada cuando la evidencia es incompleta: falla cerrada", async () => {
    const incompletas: EntradasFiscales = {
      ...ENTRADAS,
      evaluable: false,
      faltantes: { ...ENTRADAS.faltantes, comprobantes_sin_estatus_sat: 3, recibidos_sin_decision: 2 },
    };
    const sb = supabaseFalso(incompletas);
    const r = await calcularYRegistrar(sb, sb, "cli-1", "2026-01", {}, "user-1");
    expect(r.registrado).toBe(false);
    expect(r.motivo).toBeTruthy();
    expect(sb.registros).toHaveLength(0);
    expect(calcularPreliminar(incompletas, {}).resultado).toBeNull();
  });

  it("rechaza el registro si la evidencia cambia entre el cálculo y la persistencia", async () => {
    const sb = supabaseFalso([ENTRADAS, { ...ENTRADAS, input_hash: "hash-evidencia-2" }]);
    const r = await calcularYRegistrar(sb, sb, "cli-1", "2026-01", {}, "user-1");
    expect(r.registrado).toBe(false);
    expect(r.motivo).toMatch(/cambió/i);
    expect(sb.registros).toHaveLength(0);
  });

  it("recupera los parámetros humanos previos para que el sellado no los pierda", async () => {
    const sb = supabaseFalso(ENTRADAS);
    const previos = await leerParametrosPrevios(sb, "cli-1", "2026-01");
    expect(previos.coeficiente_utilidad).toBe(0.2);
  });

  it("falla cerrada si no puede leer los parámetros previos: no devuelve {}", async () => {
    const sb = supabaseFalso(ENTRADAS, { errorParametros: "conexión perdida" });
    await expect(leerParametrosPrevios(sb, "cli-1", "2026-01")).rejects.toBeInstanceOf(
      FiscalNoComprobadoError,
    );
  });

  it("falla cerrada si no puede leer las entradas fiscales", async () => {
    const sb: any = { rpc: async () => ({ data: null, error: { message: "sin acceso" } }) };
    await expect(calcularYRegistrar(sb, sb, "cli-1", "2026-01", {}, "user-1")).rejects.toBeInstanceOf(
      FiscalNoComprobadoError,
    );
  });
});
