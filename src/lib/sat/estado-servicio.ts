// Decisión pura sobre si una corrida SAT puede ejecutarse.
// Vive fuera de *.functions.ts para poder probarse sin base de datos ni SAT.
//
// Regla central: el estado del servicio es UNO SOLO y se resuelve aquí.
// Ningún otro punto de la aplicación puede decidir "hay/no hay servicio".

import { PROVEEDORES, type ProveedorId } from "./providers/contrato";

export type CausaSat =
  | "ok"
  | "cuenta_bloqueada"
  | "proveedor_no_disponible"
  | "sin_seleccion"
  | "rango_invalido"
  | "sin_credencial"
  | "efirma_vencida"
  | "solicitud_activa"
  | "cuota_agotada"
  | "servicio_sin_saldo";

export type NivelPac = "ok" | "critico" | "insuficiente" | "agotado";

export type DecisionSat = {
  puede_ejecutar: boolean;
  causa: CausaSat;
  motivo: string | null;
  /** Acción concreta y verificable que desbloquea la corrida. */
  accion: string | null;
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
  proveedor: ProveedorId;
  acceso: boolean;
  motivoBloqueo?: string | null;
  previstas: number;
  rangoValido: boolean;
  credencialActiva: boolean;
  efirmaVenceAt?: string | null;
  ahora?: number;
  solicitudActiva?: boolean;
  ilimitado: boolean;
  restante: number | null;
  periodo: string;
  esSandbox: boolean;
  nivelServicio?: NivelPac;
}): DecisionSat {
  const meta = PROVEEDORES[input.proveedor];

  if (!input.acceso) {
    return {
      puede_ejecutar: false,
      causa: "cuenta_bloqueada",
      motivo: input.motivoBloqueo ?? null,
      accion: "Regulariza tu suscripción para reactivar la descarga.",
    };
  }

  if (!meta?.disponible) {
    return {
      puede_ejecutar: false,
      causa: "proveedor_no_disponible",
      motivo: meta?.mensajeNoDisponible ?? "El proveedor seleccionado no está disponible.",
      accion: "Selecciona SAT directo (e.firma) como proveedor del expediente.",
    };
  }

  if (input.previstas <= 0) {
    return {
      puede_ejecutar: false,
      causa: "sin_seleccion",
      motivo: "Selecciona al menos una dirección: comprobantes emitidos o recibidos.",
      accion: "Activa Emitidos y/o Recibidos en la configuración de descarga.",
    };
  }

  if (!input.rangoValido) {
    return {
      puede_ejecutar: false,
      causa: "rango_invalido",
      motivo: "El rango de fechas no es válido: la fecha inicial debe ser anterior a la final.",
      accion: "Corrige el periodo de descarga.",
    };
  }

  if (!input.credencialActiva) {
    return {
      puede_ejecutar: false,
      causa: "sin_credencial",
      motivo:
        "Este expediente no tiene una e.firma activa. El SAT sólo entrega comprobantes a " +
        "solicitudes firmadas con la e.firma del propio contribuyente.",
      accion: "Carga el .cer, el .key y la contraseña de la e.firma del expediente.",
    };
  }

  if (input.efirmaVenceAt) {
    const vence = new Date(input.efirmaVenceAt).getTime();
    if (!isNaN(vence) && vence <= (input.ahora ?? Date.now())) {
      return {
        puede_ejecutar: false,
        causa: "efirma_vencida",
        motivo: "La e.firma cargada está vencida y el SAT rechazará la autenticación.",
        accion: "Renueva la e.firma ante el SAT y vuelve a cargarla en el expediente.",
      };
    }
  }

  if (input.solicitudActiva) {
    return {
      puede_ejecutar: false,
      causa: "solicitud_activa",
      motivo:
        "Ya hay una corrida en proceso con este mismo periodo y tipo de comprobantes. " +
        "El SAT es asíncrono: la descarga continúa aunque cierres la pantalla.",
      accion: "Espera a que termine la corrida en proceso o cámbiale el periodo.",
    };
  }

  if (!input.ilimitado && input.restante !== null && input.previstas > input.restante) {
    return {
      puede_ejecutar: false,
      causa: "cuota_agotada",
      motivo: `Esta corrida requiere ${input.previstas} solicitudes y a tu plan le quedan ${input.restante} en el periodo ${input.periodo}. Reduce el rango o las direcciones, o mejora tu plan.`,
      accion: "Reduce el periodo de descarga o mejora tu plan.",
    };
  }

  // Sandbox/demo no toca el saldo real de ningún proveedor.
  if (input.esSandbox) return { puede_ejecutar: true, causa: "ok", motivo: null, accion: null };

  // Sólo un proveedor con saldo contratado (PAC) puede quedarse sin saldo.
  if (
    meta.consumeSaldoProveedor &&
    (input.nivelServicio === "agotado" || input.nivelServicio === "insuficiente")
  ) {
    return {
      puede_ejecutar: false,
      causa: "servicio_sin_saldo",
      motivo:
        "El servicio del proveedor está temporalmente sin saldo operativo. " +
        "No se consumirá nada de tu cuota: el administrador ya fue notificado y podrás reintentar en cuanto se recargue.",
      accion: "Reintenta más tarde.",
    };
  }

  return { puede_ejecutar: true, causa: "ok", motivo: null, accion: null };
}
