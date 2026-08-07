// Simulación de corrida SAT para CUENTAS DEMO/SANDBOX.
// Nunca contacta al SAT, nunca consume saldo y todo lo que produce queda
// etiquetado como demostración para que no se confunda con datos reales.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DireccionDescarga } from "./providers/contrato";
import {
  nuevaSolicitud,
  resolverEstadoCorrida,
  type ResumenCorrida,
  type SolicitudRegistro,
} from "./maquina-estados";

export async function simularCorridaDemo(args: {
  supabase: SupabaseClient;
  despachoId: string;
  clienteId: string;
  runId: string;
  direcciones: DireccionDescarga[];
  desde: string;
  hasta: string;
}): Promise<{ solicitudes: SolicitudRegistro[]; resumen: ResumenCorrida }> {
  const solicitudes: SolicitudRegistro[] = args.direcciones.map((direccion, i) => {
    const encontrados = 2 + i;
    return {
      ...nuevaSolicitud({
        direccion,
        desde: args.desde,
        hasta: args.hasta,
        id_solicitud: `demo-${args.runId}-${direccion}`,
        codigo: "5000",
        mensaje: "Corrida de demostración: no se contactó al SAT.",
        estado: "listo",
      }),
      paquetes_encontrados: [`demo-${direccion}`],
      paquetes_procesados: [`demo-${direccion}`],
      xml_encontrados: encontrados,
      xml_nuevos: encontrados,
      duplicados: 0,
      rechazados: 0,
    };
  });

  for (const s of solicitudes) {
    await args.supabase.from("sat_sync_eventos").insert({
      despacho_id: args.despachoId,
      cliente_id: args.clienteId,
      run_id: args.runId,
      tipo: "info",
      mensaje: `Demostración: ${s.xml_nuevos} comprobantes ${s.direccion} simulados (sin contacto con el SAT).`,
    });
  }

  return { solicitudes, resumen: resolverEstadoCorrida(solicitudes) };
}
