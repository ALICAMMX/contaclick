import { describe, expect, it } from "vitest";
import {
  derivarDesdeEncabezado,
  repararDerivadosCfdi,
  VERSION_RECUPERACION_ENCABEZADO,
  MOTIVO_RECUPERADO_ENCABEZADO,
  type FilaCanonica,
} from "./reparacion";

const RFC = "GORJ781201BK3";

/** Doble mínimo de Supabase: registra los patches aplicados. */
function supabaseFalso(escrituras: Array<{ id: string; patch: any }>) {
  return {
    from() {
      return {
        update(patch: any) {
          return {
            eq(_col: string, id: string) {
              escrituras.push({ id, patch });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  } as any;
}

const fila = (over: Partial<FilaCanonica>): FilaCanonica => ({
  id: "x",
  uuid: "U-1",
  tipo_cfdi: "I",
  rfc_emisor: "AAA010101AAA",
  rfc_receptor: RFC,
  metodo_pago: "PUE",
  estatus_sat: "desconocido",
  fecha: "2026-07-29T18:00:00+00:00",
  periodo: null,
  direccion: null,
  clase_documental: null,
  ...over,
});

describe("recuperación desde encabezado (sin XML original)", () => {
  it("asigna julio a un comprobante fechado dentro de julio (hora del centro)", () => {
    const d = derivarDesdeEncabezado(fila({}), RFC);
    expect(d.periodo).toBe("2026-07");
    expect(d.direccion).toBe("recibido");
    expect(d.detalle_reconstruible).toBe(false);
  });

  it("separa el comprobante que ya cae en agosto", () => {
    // 2026-08-02T05:26Z = 2026-08-01 23:26 hora del centro.
    const d = derivarDesdeEncabezado(fila({ fecha: "2026-08-02T05:26:04+00:00" }), RFC);
    expect(d.periodo).toBe("2026-08");
  });

  it("clasifica emitidos y recibidos según el RFC del expediente", () => {
    expect(derivarDesdeEncabezado(fila({ rfc_emisor: RFC, rfc_receptor: "BBB010101BB1" }), RFC).direccion).toBe(
      "emitido",
    );
    expect(derivarDesdeEncabezado(fila({}), RFC).direccion).toBe("recibido");
  });

  it("nunca declara normalización desde el original y deja marca honesta", async () => {
    const escrituras: Array<{ id: string; patch: any }> = [];
    const r = await repararDerivadosCfdi(supabaseFalso(escrituras), fila({ id: "a" }), RFC);
    expect(r.cambiado).toBe(true);
    const patch = escrituras[0]!.patch;
    expect(patch.normalizacion_version).toBe(VERSION_RECUPERACION_ENCABEZADO);
    expect(patch.detalle_reconstruible).toBe(false);
    expect(patch.periodo).toBe("2026-07");
    expect(patch.motivos[0].codigo).toBe(MOTIVO_RECUPERADO_ENCABEZADO.codigo);
  });

  it("es idempotente: repetir no reporta cambio ni altera los valores", async () => {
    const escrituras: Array<{ id: string; patch: any }> = [];
    const sb = supabaseFalso(escrituras);
    await repararDerivadosCfdi(sb, fila({ id: "b" }), RFC);
    const ya = fila({
      id: "b",
      periodo: "2026-07",
      direccion: "recibido",
      clase_documental: escrituras[0]!.patch.clase_documental,
    });
    const segundo = await repararDerivadosCfdi(sb, ya, RFC);
    expect(segundo.cambiado).toBe(false);
    expect(escrituras[1]!.patch.periodo).toBe(escrituras[0]!.patch.periodo);
    expect(escrituras[1]!.patch.direccion).toBe(escrituras[0]!.patch.direccion);
  });
});
