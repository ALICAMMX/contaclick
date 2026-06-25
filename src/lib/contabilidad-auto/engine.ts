// Motor de contabilización automática a partir de CFDI.
// Genera asientos sugeridos en base devengada usando el catálogo SAT (Anexo 24).
// El catálogo es un default; cada despacho podrá sobrescribirlo (fase 5).

export type Asiento = {
  cuenta: string;
  nombre: string;
  debe: number;
  haber: number;
};

export type PolizaSugerida = {
  tipo: "ingreso" | "egreso" | "diario";
  concepto: string;
  monto: number;
  asientos: Asiento[];
  warnings: string[];
};

export type CfdiParaContabilizar = {
  uuid: string;
  tipo_cfdi: string;           // I, E, P, N, T
  rfc_emisor: string;
  rfc_receptor: string;
  nombre_emisor?: string | null;
  nombre_receptor?: string | null;
  fecha: string;
  subtotal: number;
  descuento: number;
  iva_trasladado: number;
  ieps_trasladado: number;
  iva_retenido: number;
  isr_retenido: number;
  total: number;
  rfc_cliente: string;         // RFC activo del cliente (para saber si es emitido/recibido)
};

const CTA = {
  CLIENTES: { c: "105-01", n: "Clientes" },
  PROVEEDORES: { c: "201-01", n: "Proveedores" },
  BANCOS: { c: "102-01", n: "Bancos" },
  INGRESOS: { c: "401-01", n: "Ingresos" },
  DEVOLUCIONES: { c: "402-01", n: "Devoluciones sobre ventas" },
  COMPRAS_GASTOS: { c: "601-01", n: "Gastos generales" },
  COMPRAS_INV: { c: "115-01", n: "Inventarios / Compras" },
  IVA_TRASLADADO_PEND: { c: "208-01", n: "IVA trasladado pendiente" },
  IVA_TRASLADADO_COB: { c: "209-01", n: "IVA trasladado cobrado" },
  IVA_ACREDITABLE_PEND: { c: "118-01", n: "IVA acreditable pendiente" },
  IVA_ACREDITABLE_PAG: { c: "113-01", n: "IVA acreditable pagado" },
  IEPS_TRASLADADO: { c: "208-02", n: "IEPS trasladado pendiente" },
  ISR_RETENIDO_FAVOR: { c: "120-01", n: "ISR retenido por terceros" },
  IVA_RETENIDO_FAVOR: { c: "118-02", n: "IVA retenido por terceros" },
  ISR_RETENIDO_CARGO: { c: "216-01", n: "ISR retenciones por enterar" },
  IVA_RETENIDO_CARGO: { c: "216-02", n: "IVA retenciones por enterar" },
  SUELDOS: { c: "601-02", n: "Sueldos y salarios" },
  ISR_NOMINA: { c: "216-03", n: "ISR nómina por enterar" },
  IMSS_PROV: { c: "213-01", n: "IMSS / Provisiones sociales" },
};

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

function ingresoEmitido(c: CfdiParaContabilizar): PolizaSugerida {
  const ingresoNeto = r2(c.subtotal - c.descuento);
  const total = r2(c.total);
  const asientos: Asiento[] = [];

  // Cargo: Clientes por el total a cobrar
  asientos.push({ ...wrap(CTA.CLIENTES), debe: total, haber: 0 });
  if (c.isr_retenido > 0) asientos.push({ ...wrap(CTA.ISR_RETENIDO_FAVOR), debe: r2(c.isr_retenido), haber: 0 });
  if (c.iva_retenido > 0) asientos.push({ ...wrap(CTA.IVA_RETENIDO_FAVOR), debe: r2(c.iva_retenido), haber: 0 });

  // Abono: ingreso + IVA trasladado pendiente
  asientos.push({ ...wrap(CTA.INGRESOS), debe: 0, haber: ingresoNeto });
  if (c.iva_trasladado > 0) asientos.push({ ...wrap(CTA.IVA_TRASLADADO_PEND), debe: 0, haber: r2(c.iva_trasladado) });
  if (c.ieps_trasladado > 0) asientos.push({ ...wrap(CTA.IEPS_TRASLADADO), debe: 0, haber: r2(c.ieps_trasladado) });

  return {
    tipo: "ingreso",
    concepto: `Ingreso CFDI · ${c.nombre_receptor ?? c.rfc_receptor} · ${c.uuid.slice(0, 8)}`,
    monto: total,
    asientos,
    warnings: validar(asientos),
  };
}

function gastoRecibido(c: CfdiParaContabilizar): PolizaSugerida {
  const gastoNeto = r2(c.subtotal - c.descuento);
  const total = r2(c.total);
  const asientos: Asiento[] = [];

  asientos.push({ ...wrap(CTA.COMPRAS_GASTOS), debe: gastoNeto, haber: 0 });
  if (c.iva_trasladado > 0) asientos.push({ ...wrap(CTA.IVA_ACREDITABLE_PEND), debe: r2(c.iva_trasladado), haber: 0 });

  if (c.isr_retenido > 0) asientos.push({ ...wrap(CTA.ISR_RETENIDO_CARGO), debe: 0, haber: r2(c.isr_retenido) });
  if (c.iva_retenido > 0) asientos.push({ ...wrap(CTA.IVA_RETENIDO_CARGO), debe: 0, haber: r2(c.iva_retenido) });
  asientos.push({ ...wrap(CTA.PROVEEDORES), debe: 0, haber: total });

  return {
    tipo: "egreso",
    concepto: `Gasto CFDI · ${c.nombre_emisor ?? c.rfc_emisor} · ${c.uuid.slice(0, 8)}`,
    monto: total,
    asientos,
    warnings: validar(asientos),
  };
}

function pago(c: CfdiParaContabilizar, esEmitido: boolean): PolizaSugerida {
  const total = r2(c.total);
  const asientos: Asiento[] = [];
  if (esEmitido) {
    // Cobramos a un cliente
    asientos.push({ ...wrap(CTA.BANCOS), debe: total, haber: 0 });
    asientos.push({ ...wrap(CTA.CLIENTES), debe: 0, haber: total });
    // Reclasificación IVA pendiente → cobrado (si el CFDI trae traslados)
    if (c.iva_trasladado > 0) {
      asientos.push({ ...wrap(CTA.IVA_TRASLADADO_PEND), debe: r2(c.iva_trasladado), haber: 0 });
      asientos.push({ ...wrap(CTA.IVA_TRASLADADO_COB), debe: 0, haber: r2(c.iva_trasladado) });
    }
  } else {
    // Pagamos a un proveedor
    asientos.push({ ...wrap(CTA.PROVEEDORES), debe: total, haber: 0 });
    asientos.push({ ...wrap(CTA.BANCOS), debe: 0, haber: total });
    if (c.iva_trasladado > 0) {
      asientos.push({ ...wrap(CTA.IVA_ACREDITABLE_PAG), debe: r2(c.iva_trasladado), haber: 0 });
      asientos.push({ ...wrap(CTA.IVA_ACREDITABLE_PEND), debe: 0, haber: r2(c.iva_trasladado) });
    }
  }
  return {
    tipo: "diario",
    concepto: `Pago CFDI · ${esEmitido ? "cobrado" : "pagado"} · ${c.uuid.slice(0, 8)}`,
    monto: total,
    asientos,
    warnings: validar(asientos),
  };
}

function nomina(c: CfdiParaContabilizar): PolizaSugerida {
  const bruto = r2(c.subtotal);
  const isr = r2(c.isr_retenido);
  const neto = r2(c.total);
  const asientos: Asiento[] = [
    { ...wrap(CTA.SUELDOS), debe: bruto, haber: 0 },
    { ...wrap(CTA.ISR_NOMINA), debe: 0, haber: isr },
    { ...wrap(CTA.BANCOS), debe: 0, haber: neto },
  ];
  return {
    tipo: "diario",
    concepto: `Nómina CFDI · ${c.nombre_receptor ?? c.rfc_receptor} · ${c.uuid.slice(0, 8)}`,
    monto: neto,
    asientos,
    warnings: validar(asientos),
  };
}

function notaCredito(c: CfdiParaContabilizar, esEmitido: boolean): PolizaSugerida {
  // Invierte ingreso/gasto según corresponda
  const base = esEmitido ? ingresoEmitido(c) : gastoRecibido(c);
  const inv: Asiento[] = base.asientos.map((a) => ({ ...a, debe: a.haber, haber: a.debe }));
  return {
    tipo: esEmitido ? "egreso" : "ingreso",
    concepto: `Nota de crédito (E) · ${c.uuid.slice(0, 8)}`,
    monto: r2(c.total),
    asientos: inv,
    warnings: validar(inv),
  };
}

function wrap(x: { c: string; n: string }) { return { cuenta: x.c, nombre: x.n }; }

function validar(as: Asiento[]): string[] {
  const w: string[] = [];
  const td = r2(as.reduce((s, a) => s + a.debe, 0));
  const th = r2(as.reduce((s, a) => s + a.haber, 0));
  if (Math.abs(td - th) > 0.05) w.push(`Asiento descuadrado: cargos ${td} vs abonos ${th}`);
  return w;
}

export type ReglaContable = {
  id: string;
  nombre: string;
  prioridad: number;
  activa: boolean;
  cuenta_cargo: string;
  cuenta_abono: string;
  condicion: {
    tipo_cfdi?: string | null;
    rfc_emisor?: string | null;
    rfc_receptor?: string | null;
    keyword?: string | null;
    min_monto?: number | null;
    max_monto?: number | null;
  };
};

function matchRegla(c: CfdiParaContabilizar, conceptoText: string, reglas: ReglaContable[]): ReglaContable | null {
  const sorted = [...reglas].filter((r) => r.activa).sort((a, b) => b.prioridad - a.prioridad);
  for (const r of sorted) {
    const cd = r.condicion ?? {};
    if (cd.tipo_cfdi && cd.tipo_cfdi.toUpperCase() !== (c.tipo_cfdi || "").toUpperCase()) continue;
    if (cd.rfc_emisor && cd.rfc_emisor.toUpperCase() !== c.rfc_emisor.toUpperCase()) continue;
    if (cd.rfc_receptor && cd.rfc_receptor.toUpperCase() !== c.rfc_receptor.toUpperCase()) continue;
    if (cd.keyword && !conceptoText.toLowerCase().includes(cd.keyword.toLowerCase())) continue;
    if (cd.min_monto != null && c.total < cd.min_monto) continue;
    if (cd.max_monto != null && c.total > cd.max_monto) continue;
    return r;
  }
  return null;
}

export function contabilizarCfdi(c: CfdiParaContabilizar, reglas: ReglaContable[] = []): PolizaSugerida {
  const esEmitido = c.rfc_emisor.toUpperCase() === c.rfc_cliente.toUpperCase();
  const tipo = (c.tipo_cfdi || "I").toUpperCase();

  let base: PolizaSugerida;
  switch (tipo) {
    case "I":
      base = esEmitido ? ingresoEmitido(c) : gastoRecibido(c);
      break;
    case "E":
      base = notaCredito(c, esEmitido);
      break;
    case "P":
      base = pago(c, esEmitido);
      break;
    case "N":
      base = nomina(c);
      break;
    case "T":
      return {
        tipo: "diario",
        concepto: `Traslado CFDI · ${c.uuid.slice(0, 8)}`,
        monto: 0,
        asientos: [],
        warnings: ["CFDI de traslado no genera asiento contable automático."],
      };
    default:
      return {
        tipo: "diario",
        concepto: `CFDI tipo ${tipo} · ${c.uuid.slice(0, 8)}`,
        monto: r2(c.total),
        asientos: [],
        warnings: [`Tipo de CFDI no soportado: ${tipo}. Requiere clasificación manual.`],
      };
  }

  // Aplicar regla: reemplaza la cuenta principal de cargo o abono según el tipo de póliza.
  const regla = matchRegla(c, base.concepto, reglas);
  if (regla) {
    const isIngreso = base.tipo === "ingreso";
    const asientos = base.asientos.map((a) => {
      // Sustituir la cuenta principal: en gasto/egreso la primera de DEBE; en ingreso la primera de HABER
      if (!isIngreso && a.debe > 0 && (a.cuenta === CTA.COMPRAS_GASTOS.c || a.cuenta === CTA.COMPRAS_INV.c)) {
        return { ...a, cuenta: regla.cuenta_cargo, nombre: `${a.nombre} · ${regla.nombre}` };
      }
      if (isIngreso && a.haber > 0 && a.cuenta === CTA.INGRESOS.c) {
        return { ...a, cuenta: regla.cuenta_abono, nombre: `${a.nombre} · ${regla.nombre}` };
      }
      return a;
    });
    base = { ...base, asientos, warnings: [...base.warnings, `Regla aplicada: ${regla.nombre}`] };
  }
  return base;
}
