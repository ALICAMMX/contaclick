// Catálogo de obligaciones fiscales recurrentes por régimen fiscal mexicano.
// Se usa para autogenerar 12 meses de obligaciones cuando se crea un expediente.

export type TipoObligacion =
  | "mensual"
  | "bimestral"
  | "anual"
  | "informativa"
  | "laboral"
  | "estatal";

export type PlantillaObligacion = {
  clave: string; // identificador corto, ej. "ISR_MENS"
  nombre: string; // legible, ej. "Pago provisional ISR"
  tipo: TipoObligacion;
  periodicidad: "mensual" | "bimestral" | "anual";
  // Día del mes (1-31) o del periodo correspondiente. Si el día > último día del mes, se ajusta.
  dia_vencimiento: number;
  // Offset en meses respecto al periodo. Ej: ISR mensual se paga el mes siguiente -> 1
  offset_meses: number;
  // Para bimestrales: en qué mes par del bimestre se presenta (febrero=2 -> bimestre Ene-Feb se presenta marzo si offset=1)
  // Para anual: el mes en que vence (1-12). En ese caso solo se genera 1 vez al año.
  mes_anual?: number;
  descripcion?: string;
};

const COMUN_MENSUAL: PlantillaObligacion[] = [
  {
    clave: "ISR_MENS",
    nombre: "Pago provisional ISR",
    tipo: "mensual",
    periodicidad: "mensual",
    dia_vencimiento: 17,
    offset_meses: 1,
    descripcion: "Art. 14 LISR. Vence día 17 del mes siguiente.",
  },
  {
    clave: "IVA_MENS",
    nombre: "Declaración mensual de IVA",
    tipo: "mensual",
    periodicidad: "mensual",
    dia_vencimiento: 17,
    offset_meses: 1,
    descripcion: "Art. 5-D LIVA.",
  },
  {
    clave: "DIOT",
    nombre: "DIOT (Información de operaciones con terceros)",
    tipo: "informativa",
    periodicidad: "mensual",
    dia_vencimiento: 30,
    offset_meses: 1,
    descripcion: "Mes inmediato posterior al que corresponda.",
  },
  {
    clave: "RET_ISR",
    nombre: "Retenciones ISR sueldos / asimilados",
    tipo: "mensual",
    periodicidad: "mensual",
    dia_vencimiento: 17,
    offset_meses: 1,
  },
];

const LABORAL: PlantillaObligacion[] = [
  {
    clave: "IMSS",
    nombre: "Pago de cuotas IMSS",
    tipo: "laboral",
    periodicidad: "mensual",
    dia_vencimiento: 17,
    offset_meses: 1,
    descripcion: "Cuotas obrero-patronales del mes anterior.",
  },
  {
    clave: "INFONAVIT",
    nombre: "Aportaciones INFONAVIT / retenciones",
    tipo: "laboral",
    periodicidad: "bimestral",
    dia_vencimiento: 17,
    offset_meses: 1,
    descripcion: "Bimestral, mes posterior al cierre del bimestre.",
  },
];

const ANUAL_PM: PlantillaObligacion[] = [
  {
    clave: "ISR_ANUAL_PM",
    nombre: "Declaración anual ISR (Persona Moral)",
    tipo: "anual",
    periodicidad: "anual",
    dia_vencimiento: 31,
    offset_meses: 0,
    mes_anual: 3,
    descripcion: "Marzo del año siguiente al ejercicio.",
  },
];

const ANUAL_PF: PlantillaObligacion[] = [
  {
    clave: "ISR_ANUAL_PF",
    nombre: "Declaración anual ISR (Persona Física)",
    tipo: "anual",
    periodicidad: "anual",
    dia_vencimiento: 30,
    offset_meses: 0,
    mes_anual: 4,
    descripcion: "Abril del año siguiente al ejercicio.",
  },
];

const RESICO_PF: PlantillaObligacion[] = [
  {
    clave: "RESICO_ISR",
    nombre: "ISR mensual RESICO PF",
    tipo: "mensual",
    periodicidad: "mensual",
    dia_vencimiento: 17,
    offset_meses: 1,
  },
  {
    clave: "IVA_MENS",
    nombre: "Declaración mensual de IVA",
    tipo: "mensual",
    periodicidad: "mensual",
    dia_vencimiento: 17,
    offset_meses: 1,
  },
  ...ANUAL_PF,
];

const SALDOS_FAVOR_INFO = [
  {
    clave: "AVISO_CSD",
    nombre: "Renovación e.firma / CSD (revisión vigencia)",
    tipo: "informativa" as TipoObligacion,
    periodicidad: "anual" as const,
    dia_vencimiento: 1,
    offset_meses: 0,
    mes_anual: 1,
  },
];

export function plantillasPorRegimen(
  regimen: string | null | undefined,
  tipoPersona: "fisica" | "moral",
): PlantillaObligacion[] {
  const r = (regimen ?? "").toLowerCase();

  // RESICO PF
  if (r.includes("resico") && tipoPersona === "fisica") {
    return [...RESICO_PF, ...SALDOS_FAVOR_INFO];
  }

  // Persona Moral general (601, RESICO PM 626, etc.)
  if (tipoPersona === "moral") {
    return [
      ...COMUN_MENSUAL,
      ...LABORAL,
      ...ANUAL_PM,
      ...SALDOS_FAVOR_INFO,
    ];
  }

  // PF actividad empresarial / honorarios / arrendamiento (default)
  return [...COMUN_MENSUAL, ...ANUAL_PF, ...SALDOS_FAVOR_INFO];
}

// Calcula la fecha de vencimiento concreta para un periodo dado.
// periodoYear: año del periodo a generar (ej. 2026)
// periodoMonth: mes del periodo 1-12
export function fechaVencimiento(
  plantilla: PlantillaObligacion,
  periodoYear: number,
  periodoMonth: number,
): Date {
  if (plantilla.periodicidad === "anual" && plantilla.mes_anual) {
    const y = periodoYear + 1; // ejercicio cerrado se presenta el año siguiente
    const m = plantilla.mes_anual - 1;
    const lastDay = new Date(y, m + 1, 0).getDate();
    return new Date(y, m, Math.min(plantilla.dia_vencimiento, lastDay));
  }

  // mensual / bimestral
  const targetMonthIdx = (periodoMonth - 1) + plantilla.offset_meses;
  const y = periodoYear + Math.floor(targetMonthIdx / 12);
  const m = ((targetMonthIdx % 12) + 12) % 12;
  const lastDay = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(plantilla.dia_vencimiento, lastDay));
}
