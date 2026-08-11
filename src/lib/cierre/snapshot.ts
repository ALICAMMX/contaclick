// ─────────────────────────────────────────────────────────────────────────────
// ETAPA 6 — tipos del sellado del cierre mensual.
//
// Aquí NO se calcula nada. La huella, el resumen y los bloqueos los produce la
// base de datos (`cierre_estado` / `cierre_sellar_manifiesto`) sobre el mismo
// manifiesto canónico que se sella. Duplicar ese cálculo en el navegador o en
// el servidor de aplicación crearía una segunda verdad que puede discrepar de
// la sellada: por eso se eliminó.
// ─────────────────────────────────────────────────────────────────────────────

import type { EstadoEtapa, EtapaId } from "./flujo";

export type EtapaSnapshot = {
  id: EtapaId;
  estado: EstadoEtapa;
  cobertura: number | null;
  version: number;
  motivo?: string | null;
};

/** Importes SIEMPRE en centavos enteros: ni el sello ni la UI usan flotantes. */
export type ResumenCierre = {
  cfdi_total: number;
  cfdi_emitidos: number;
  cfdi_recibidos: number;
  ingresos_centavos: number;
  egresos_centavos: number;
  iva_trasladado_centavos: number;
  iva_acreditable_centavos: number;
  movimientos: number;
  conciliaciones: number;
  polizas: number;
  polizas_bloqueadas: number;
  decisiones: number;
  excepciones_pendientes: number;
};

export type Bloqueo = { codigo: string; detalle: string };

export type SelloRegistrado = {
  id: string;
  version: number;
  motivo: string;
  huella: string;
  resumen: ResumenCierre;
  created_at: string;
  sellado_por: string | null;
  vigente: boolean;
};

export type SelloObsoleto = SelloRegistrado & {
  causa: string;
  /** Secciones del manifiesto que cambiaron desde el sellado. */
  diferencias: string[];
};

export type EstadoCierre = {
  periodo: string;
  evaluador: string;
  etapas: Array<{
    etapa: EtapaId;
    estado: EstadoEtapa;
    cobertura: number | null;
    version: number;
    motivo: string | null;
  }>;
  resumen: ResumenCierre;
  bloqueos: Bloqueo[];
  huella_actual: string;
  sello_vigente: SelloRegistrado | null;
  sello_obsoleto: SelloObsoleto | null;
  sellos: SelloRegistrado[];
};
