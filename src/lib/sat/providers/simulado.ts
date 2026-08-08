// =====================================================================
// Proveedor SINTÉTICO de Descarga Masiva.
//
// No es seleccionable por ningún usuario ni aparece en el registro de
// proveedores: existe para comprobar el ciclo asíncrono completo
// (solicitar → esperar → descargar → ingerir) con datos deterministas.
//
// Reproduce el comportamiento real del SAT: la solicitud NO está lista de
// inmediato, los paquetes se liberan después de N verificaciones y una
// solicitud puede terminar vacía, con error o vencida.
// =====================================================================

import type { DireccionDescarga } from "./contrato";
import type { ClienteCiclo, RespuestaVerificacion } from "../ciclo-asincrono";

export type GuionDireccion = {
  /** Verificaciones que responden "en proceso" antes de liberar el resultado. */
  esperas?: number;
  /** Desenlace de la solicitud. */
  desenlace?: "listo" | "vacio" | "error" | "vencida";
  /** Paquetes liberados cuando el desenlace es `listo`. */
  paquetes?: { id: string; xml: string[] }[];
  /** Código con el que responde `solicitar`. */
  codigoSolicitud?: string;
};

export type GuionSimulado = Partial<Record<DireccionDescarga, GuionDireccion>>;

const CODIGO_POR_DESENLACE: Record<string, string> = {
  listo: "5000",
  vacio: "5004",
  error: "5006",
  vencida: "5011",
};

const ESTADO_SAT_POR_DESENLACE: Record<string, number> = {
  listo: 3,
  vacio: 3,
  error: 4,
  vencida: 6,
};

/** CFDI 4.0 sintético mínimo, suficiente para el ciclo de ingesta. */
export function cfdiSintetico(uuid: string, total = 1160): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Fecha="2026-01-15T10:00:00" Serie="A" Folio="1" SubTotal="1000.00" Moneda="MXN" Total="${total.toFixed(2)}" TipoDeComprobante="I" Exportacion="01" MetodoPago="PUE" FormaPago="03" LugarExpedicion="64000">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="EMISOR SINTETICO" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="BBB010101BB1" Nombre="RECEPTOR SINTETICO" DomicilioFiscalReceptor="64000" RegimenFiscalReceptor="601" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="01010101" Cantidad="1" ClaveUnidad="E48" Descripcion="Servicio sintetico" ValorUnitario="1000.00" Importe="1000.00" ObjetoImp="02"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="${uuid}" FechaTimbrado="2026-01-15T10:01:00"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;
}

export type ClienteSimulado = ClienteCiclo & {
  /** Bitácora de llamadas, para comprobar que no se repiten descargas. */
  llamadas: { solicitar: number; verificar: number; descargar: string[] };
};

/**
 * Construye un cliente que se comporta como el servicio del SAT según el
 * guion recibido. El "ZIP" que devuelve `descargar` es un JSON serializado
 * de los XML del paquete: el abridor de paquetes sintético lo interpreta.
 */
export function crearClienteSimulado(guion: GuionSimulado): ClienteSimulado {
  const porSolicitud = new Map<string, { direccion: DireccionDescarga; verificaciones: number }>();
  const llamadas = { solicitar: 0, verificar: 0, descargar: [] as string[] };

  const cfg = (d: DireccionDescarga): Required<GuionDireccion> => {
    const g = guion[d] ?? {};
    return {
      esperas: g.esperas ?? 1,
      desenlace: g.desenlace ?? "listo",
      paquetes: g.paquetes ?? [{ id: `pkg-${d}-1`, xml: [cfdiSintetico(`uuid-${d}-1`)] }],
      codigoSolicitud: g.codigoSolicitud ?? "5000",
    };
  };

  return {
    llamadas,
    async solicitar({ direccion }) {
      llamadas.solicitar++;
      const c = cfg(direccion);
      const id = `sol-${direccion}`;
      porSolicitud.set(id, { direccion, verificaciones: 0 });
      return { idSolicitud: id, codigo: c.codigoSolicitud, mensaje: "Solicitud recibida" };
    },
    async verificar(idSolicitud): Promise<RespuestaVerificacion> {
      llamadas.verificar++;
      const reg = porSolicitud.get(idSolicitud);
      if (!reg) throw new Error(`Solicitud desconocida ${idSolicitud}`);
      reg.verificaciones++;
      const c = cfg(reg.direccion);

      if (reg.verificaciones <= c.esperas) {
        return { estado: 2, codigo: "5008", mensaje: "En proceso", numeroCfdis: 0, paquetes: [] };
      }
      const numeroCfdis =
        c.desenlace === "listo" ? c.paquetes.reduce((a, p) => a + p.xml.length, 0) : 0;
      return {
        estado: ESTADO_SAT_POR_DESENLACE[c.desenlace] ?? 3,
        codigo: CODIGO_POR_DESENLACE[c.desenlace] ?? "5000",
        mensaje: `Desenlace sintético: ${c.desenlace}`,
        numeroCfdis,
        paquetes: c.desenlace === "listo" ? c.paquetes.map((p) => p.id) : [],
      };
    },
    async descargar(idPaquete) {
      llamadas.descargar.push(idPaquete);
      for (const d of Object.keys(guion) as DireccionDescarga[]) {
        const p = cfg(d).paquetes.find((x) => x.id === idPaquete);
        if (p) {
          return JSON.stringify(
            p.xml.map((xml, i) => ({ nombre: `${idPaquete}-${i + 1}.xml`, xml })),
          );
        }
      }
      throw new Error(`Paquete inexistente ${idPaquete}`);
    },
  };
}

/** Abridor de "paquetes" sintéticos (JSON en vez de ZIP real). */
export async function abrirPaqueteSimulado(zipB64: string) {
  return JSON.parse(zipB64) as { nombre: string; xml: string }[];
}
