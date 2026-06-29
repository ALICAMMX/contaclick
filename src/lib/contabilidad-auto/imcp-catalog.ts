// Plantilla de catálogo de cuentas IMCP-SAT (Anexo 24).
// Códigos agrupadores oficiales del SAT (RMF 2026, Anexo 24) + estructura jerárquica
// recomendada por el IMCP para PM régimen general. Importable a contabilidad
// electrónica sin ajustes.

export type IMCPCuenta = {
  codigo: string;          // Numeración interna jerárquica
  nombre: string;
  nivel: 1 | 2 | 3 | 4;
  naturaleza: "D" | "A";   // Deudora / Acreedora
  agrupador_sat: string;   // Código agrupador SAT (CodAgrup)
};

// Estructura mínima viable y suficiente para una PM régimen general.
// Cubre los rubros más auditados por el SAT en revisión electrónica.
export const PLANTILLA_IMCP_PM: IMCPCuenta[] = [
  // ACTIVO
  { codigo: "100", nombre: "ACTIVO", nivel: 1, naturaleza: "D", agrupador_sat: "100" },
  { codigo: "101", nombre: "Caja", nivel: 2, naturaleza: "D", agrupador_sat: "101" },
  { codigo: "101.01", nombre: "Caja general", nivel: 3, naturaleza: "D", agrupador_sat: "101.01" },
  { codigo: "102", nombre: "Bancos", nivel: 2, naturaleza: "D", agrupador_sat: "102" },
  { codigo: "102.01", nombre: "Bancos nacionales", nivel: 3, naturaleza: "D", agrupador_sat: "102.01" },
  { codigo: "103", nombre: "Inversiones", nivel: 2, naturaleza: "D", agrupador_sat: "103" },
  { codigo: "105", nombre: "Clientes", nivel: 2, naturaleza: "D", agrupador_sat: "105" },
  { codigo: "105.01", nombre: "Clientes nacionales", nivel: 3, naturaleza: "D", agrupador_sat: "105.01" },
  { codigo: "107", nombre: "Deudores diversos", nivel: 2, naturaleza: "D", agrupador_sat: "107" },
  { codigo: "108", nombre: "Estimación cuentas incobrables", nivel: 2, naturaleza: "A", agrupador_sat: "108" },
  { codigo: "113", nombre: "IVA acreditable pagado", nivel: 2, naturaleza: "D", agrupador_sat: "113" },
  { codigo: "114", nombre: "IVA acreditable pendiente de pago", nivel: 2, naturaleza: "D", agrupador_sat: "114" },
  { codigo: "115", nombre: "Inventarios", nivel: 2, naturaleza: "D", agrupador_sat: "115" },
  { codigo: "118", nombre: "Pagos provisionales ISR", nivel: 2, naturaleza: "D", agrupador_sat: "118" },
  { codigo: "120", nombre: "Anticipo a proveedores", nivel: 2, naturaleza: "D", agrupador_sat: "120" },
  { codigo: "151", nombre: "Terrenos", nivel: 2, naturaleza: "D", agrupador_sat: "151" },
  { codigo: "152", nombre: "Edificios", nivel: 2, naturaleza: "D", agrupador_sat: "152" },
  { codigo: "153", nombre: "Maquinaria y equipo", nivel: 2, naturaleza: "D", agrupador_sat: "153" },
  { codigo: "154", nombre: "Equipo de transporte", nivel: 2, naturaleza: "D", agrupador_sat: "154" },
  { codigo: "155", nombre: "Equipo de cómputo", nivel: 2, naturaleza: "D", agrupador_sat: "155" },
  { codigo: "156", nombre: "Equipo de oficina", nivel: 2, naturaleza: "D", agrupador_sat: "156" },
  { codigo: "165", nombre: "Depreciación acumulada", nivel: 2, naturaleza: "A", agrupador_sat: "165" },

  // PASIVO
  { codigo: "200", nombre: "PASIVO", nivel: 1, naturaleza: "A", agrupador_sat: "200" },
  { codigo: "201", nombre: "Proveedores", nivel: 2, naturaleza: "A", agrupador_sat: "201" },
  { codigo: "201.01", nombre: "Proveedores nacionales", nivel: 3, naturaleza: "A", agrupador_sat: "201.01" },
  { codigo: "203", nombre: "Acreedores diversos", nivel: 2, naturaleza: "A", agrupador_sat: "203" },
  { codigo: "205", nombre: "Anticipos de clientes", nivel: 2, naturaleza: "A", agrupador_sat: "205" },
  { codigo: "208", nombre: "Impuestos por pagar", nivel: 2, naturaleza: "A", agrupador_sat: "208" },
  { codigo: "208.01", nombre: "ISR por pagar", nivel: 3, naturaleza: "A", agrupador_sat: "208.01" },
  { codigo: "208.02", nombre: "IVA trasladado por pagar", nivel: 3, naturaleza: "A", agrupador_sat: "208.02" },
  { codigo: "208.03", nombre: "IVA trasladado cobrado", nivel: 3, naturaleza: "A", agrupador_sat: "208.03" },
  { codigo: "208.04", nombre: "ISR retenido por sueldos", nivel: 3, naturaleza: "A", agrupador_sat: "208.04" },
  { codigo: "208.05", nombre: "ISR retenido por honorarios", nivel: 3, naturaleza: "A", agrupador_sat: "208.05" },
  { codigo: "208.06", nombre: "IVA retenido", nivel: 3, naturaleza: "A", agrupador_sat: "208.06" },
  { codigo: "209", nombre: "Aportaciones de seguridad social por pagar", nivel: 2, naturaleza: "A", agrupador_sat: "209" },
  { codigo: "209.01", nombre: "IMSS por pagar", nivel: 3, naturaleza: "A", agrupador_sat: "209.01" },
  { codigo: "209.02", nombre: "INFONAVIT por pagar", nivel: 3, naturaleza: "A", agrupador_sat: "209.02" },
  { codigo: "210", nombre: "Préstamos bancarios CP", nivel: 2, naturaleza: "A", agrupador_sat: "210" },
  { codigo: "250", nombre: "Préstamos bancarios LP", nivel: 2, naturaleza: "A", agrupador_sat: "250" },

  // CAPITAL
  { codigo: "300", nombre: "CAPITAL CONTABLE", nivel: 1, naturaleza: "A", agrupador_sat: "300" },
  { codigo: "301", nombre: "Capital social", nivel: 2, naturaleza: "A", agrupador_sat: "301" },
  { codigo: "304", nombre: "Reserva legal", nivel: 2, naturaleza: "A", agrupador_sat: "304" },
  { codigo: "305", nombre: "Resultados de ejercicios anteriores", nivel: 2, naturaleza: "A", agrupador_sat: "305" },
  { codigo: "306", nombre: "Resultado del ejercicio", nivel: 2, naturaleza: "A", agrupador_sat: "306" },

  // INGRESOS
  { codigo: "400", nombre: "INGRESOS", nivel: 1, naturaleza: "A", agrupador_sat: "400" },
  { codigo: "401", nombre: "Ingresos por servicios", nivel: 2, naturaleza: "A", agrupador_sat: "401" },
  { codigo: "402", nombre: "Ingresos por venta de mercancías", nivel: 2, naturaleza: "A", agrupador_sat: "402" },
  { codigo: "403", nombre: "Devoluciones, descuentos y bonificaciones sobre ventas", nivel: 2, naturaleza: "D", agrupador_sat: "403" },
  { codigo: "404", nombre: "Otros ingresos", nivel: 2, naturaleza: "A", agrupador_sat: "404" },

  // COSTOS Y GASTOS
  { codigo: "500", nombre: "COSTOS Y GASTOS", nivel: 1, naturaleza: "D", agrupador_sat: "500" },
  { codigo: "501", nombre: "Costo de ventas", nivel: 2, naturaleza: "D", agrupador_sat: "501" },
  { codigo: "601", nombre: "Sueldos y salarios", nivel: 2, naturaleza: "D", agrupador_sat: "601" },
  { codigo: "602", nombre: "Aportaciones de seguridad social", nivel: 2, naturaleza: "D", agrupador_sat: "602" },
  { codigo: "603", nombre: "Honorarios", nivel: 2, naturaleza: "D", agrupador_sat: "603" },
  { codigo: "604", nombre: "Arrendamientos", nivel: 2, naturaleza: "D", agrupador_sat: "604" },
  { codigo: "605", nombre: "Mantenimiento", nivel: 2, naturaleza: "D", agrupador_sat: "605" },
  { codigo: "606", nombre: "Combustibles y lubricantes", nivel: 2, naturaleza: "D", agrupador_sat: "606" },
  { codigo: "607", nombre: "Viáticos y gastos de viaje", nivel: 2, naturaleza: "D", agrupador_sat: "607" },
  { codigo: "608", nombre: "Papelería", nivel: 2, naturaleza: "D", agrupador_sat: "608" },
  { codigo: "609", nombre: "Teléfonos e internet", nivel: 2, naturaleza: "D", agrupador_sat: "609" },
  { codigo: "610", nombre: "Energía eléctrica", nivel: 2, naturaleza: "D", agrupador_sat: "610" },
  { codigo: "611", nombre: "Publicidad y propaganda", nivel: 2, naturaleza: "D", agrupador_sat: "611" },
  { codigo: "612", nombre: "Depreciaciones y amortizaciones", nivel: 2, naturaleza: "D", agrupador_sat: "612" },
  { codigo: "613", nombre: "Otros gastos", nivel: 2, naturaleza: "D", agrupador_sat: "613" },

  // RESULTADO INTEGRAL DE FINANCIAMIENTO
  { codigo: "700", nombre: "RESULTADO INTEGRAL DE FINANCIAMIENTO", nivel: 1, naturaleza: "D", agrupador_sat: "700" },
  { codigo: "701", nombre: "Intereses pagados", nivel: 2, naturaleza: "D", agrupador_sat: "701" },
  { codigo: "702", nombre: "Intereses cobrados", nivel: 2, naturaleza: "A", agrupador_sat: "702" },
  { codigo: "703", nombre: "Pérdida cambiaria", nivel: 2, naturaleza: "D", agrupador_sat: "703" },
  { codigo: "704", nombre: "Utilidad cambiaria", nivel: 2, naturaleza: "A", agrupador_sat: "704" },

  // ISR DEL EJERCICIO
  { codigo: "800", nombre: "ISR DEL EJERCICIO", nivel: 1, naturaleza: "D", agrupador_sat: "800" },
  { codigo: "801", nombre: "ISR causado", nivel: 2, naturaleza: "D", agrupador_sat: "801" },
  { codigo: "802", nombre: "ISR diferido", nivel: 2, naturaleza: "D", agrupador_sat: "802" },
];

export const PLANTILLAS_IMCP = {
  pm_general: { nombre: "PM Régimen General (IMCP)", cuentas: PLANTILLA_IMCP_PM },
};
