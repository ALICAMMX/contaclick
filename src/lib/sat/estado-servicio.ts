// Decisión pura sobre si una corrida SAT puede ejecutarse.
// Vive fuera de *.functions.ts para poder probarse sin base de datos ni PAC.

export type CausaSat =
  | "ok"
  | "cuenta_bloqueada"
  | "sin_seleccion"
  | "sin_credencial"
  | "cuota_agotada"
  | "servicio_sin_saldo";

export type NivelPac = "ok" | "critico" | "insuficiente" | "agotado";

export type DecisionSat = {
  puede_ejecutar: boolean;
  causa: CausaSat;
  motivo: string | null;
};

export function nivelPac(
  disponible: number,
  previstas: number,
  umbralCritico: number,
): NivelPac {
  if (disponible <= 0) return "agotado";
  if (disponible < previstas) return "insuficiente";
  if (disponible <= umbralCritico) return "critico";
  return "ok";
}

export function decidirEstadoSat(input: {
  acceso: boolean;
  motivoBloqueo?: string | null;
  previstas: number;
  credencialActiva: boolean;
  ilimitado: boolean;
  restante: number | null;
  periodo: string;
  esSandbox: boolean;
  nivelServicio?: NivelPac;
}): DecisionSat {
  if (!input.acceso) {
    return { puede_ejecutar: false, causa: "cuenta_bloqueada", motivo: input.motivoBloqueo ?? null };
  }
  if (input.previstas <= 0) {
    return {
      puede_ejecutar: false,
      causa: "sin_seleccion",
      motivo: "Selecciona al menos un tipo de comprobante para descargar.",
    };
  }
  if (!input.credencialActiva) {
    return {
      puede_ejecutar: false,
      causa: "sin_credencial",
      motivo:
        "Este expediente no tiene una credencial SAT activa (e.firma o CIEC). Conéctala antes de sincronizar.",
    };
  }
  if (!input.ilimitado && input.restante !== null && input.previstas > input.restante) {
    return {
      puede_ejecutar: false,
      causa: "cuota_agotada",
      motivo: `Esta corrida requiere ${input.previstas} solicitudes y a tu plan le quedan ${input.restante} en el periodo ${input.periodo}. Reduce el rango o los tipos de comprobante, o mejora tu plan.`,
    };
  }
  // Sandbox/demo no toca el saldo real del proveedor.
  if (input.esSandbox) return { puede_ejecutar: true, causa: "ok", motivo: null };

  if (input.nivelServicio === "agotado" || input.nivelServicio === "insuficiente") {
    return {
      puede_ejecutar: false,
      causa: "servicio_sin_saldo",
      motivo:
        "El servicio de descarga masiva SAT está temporalmente sin saldo operativo. " +
        "No se consumirá nada de tu cuota: el administrador ya fue notificado y podrás reintentar en cuanto se recargue.",
    };
  }
  return { puede_ejecutar: true, causa: "ok", motivo: null };
}
