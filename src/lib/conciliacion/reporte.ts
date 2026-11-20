// ─────────────────────────────────────────────────────────────────────────────
// REPORTE FORMAL DE CONCILIACIÓN — módulo PURO
//
// Explica cada peso del estado de cuenta del periodo y cada CFDI del periodo:
//
//   Banco:  conciliado con CFDI + en revisión + sin factura clasificado
//           + depósitos sin identificar + cargos sin comprobante = total del banco
//   CFDI:   cobrados/pagados en banco + pendientes de cobro/pago (PUE)
//           + a crédito (PPD, esperan complemento) + cancelados
//
// Si la suma de los renglones no da el total del banco, el reporte lo dice
// (cuadra=false): nunca se maquilla una diferencia.
// Todo se calcula en centavos enteros.
// ─────────────────────────────────────────────────────────────────────────────

export type MovReporte = {
  id: string;
  fecha: string;
  descripcion: string | null;
  referencia?: string | null;
  cargo: number;
  abono: number;
  saldo: number | null;
  cuenta_id: string;
  no_fiscal?: boolean | null;
  ignorado_at?: string | null;
  ignorado_motivo?: string | null;
  categoria_sin_cfdi?: string | null;
};

export type CfdiReporte = {
  id: string;
  uuid: string | null;
  fecha: string;
  total: number;
  direccion: string | null; // "emitido" | "recibido"
  tipo_cfdi: string | null; // I, E, P, N, T
  metodo_pago: string | null; // PUE | PPD
  estatus_sat: string | null;
  contraparte: string | null;
};

export type GrupoReporte = {
  id: string;
  estado: string; // confirmado | propuesto | rechazado | ignorado
  diferencia_centavos: number | null;
};

export type MiembroReporte = {
  grupo_id: string;
  movimiento_id: string | null;
  cfdi_id: string | null;
};

export type CuentaReporte = { id: string; banco: string | null; alias: string | null; numero_cuenta_mask: string | null };

export type Renglon = { concepto: string; movimientos: number; abonos: number; cargos: number };

export type ResumenCuenta = {
  cuenta_id: string;
  nombre: string;
  saldo_inicial: number | null;
  saldo_final: number | null;
  saldo_final_calculado: number | null;
  /** El saldo final impreso coincide con inicial + abonos − cargos. */
  saldos_cuadran: boolean | null;
  abonos: number;
  cargos: number;
  movimientos: number;
};

export type Excepcion = {
  tipo:
    | "deposito_sin_identificar"
    | "cargo_sin_comprobante"
    | "propuesta_pendiente"
    | "cfdi_sin_cobro"
    | "cfdi_sin_pago"
    | "cfdi_cancelado_conciliado"
    | "diferencia_en_conciliado";
  prioridad: "alta" | "media" | "baja";
  fecha: string;
  descripcion: string;
  importe: number;
  movimiento_id?: string;
  cfdi_id?: string;
};

export type ReporteConciliacion = {
  periodo: string;
  cuentas: ResumenCuenta[];
  banco: {
    renglones: Renglon[];
    total_abonos: number;
    total_cargos: number;
    cuadra: boolean;
  };
  sin_factura_por_categoria: Renglon[];
  cfdi: {
    renglones: (Renglon & { direccion: "emitido" | "recibido" | "otro" })[];
    emitidos_total: number;
    recibidos_total: number;
  };
  excepciones: Excepcion[];
  avance: {
    /** % de movimientos del banco que ya tienen explicación confirmada por una persona. */
    movimientos_explicados_pct: number;
    pendientes: number;
  };
};

export const NOMBRE_CATEGORIA: Record<string, string> = {
  comision_bancaria: "Comisiones bancarias",
  iva_comision: "IVA de comisiones",
  traspaso_propio: "Traspasos entre cuentas propias",
  pago_impuestos: "Pago de impuestos",
  pago_imss_infonavit: "IMSS / INFONAVIT",
  nomina: "Nómina",
  intereses_ganados: "Intereses ganados",
  isr_retenido_banco: "ISR retenido por el banco",
  prestamo: "Préstamos",
  aportacion_retiro_socios: "Aportaciones / retiros de socios",
  retiro_efectivo: "Retiros de efectivo",
  otro_sin_cfdi: "Otros sin factura",
};

const cent = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? 0 : Math.round(Number(v) * 100));
const pesos = (c: number) => Math.round(c) / 100;
const cancelado = (e: string | null) => (e ?? "").toLowerCase().startsWith("cancel");

function nuevo(concepto: string): { concepto: string; movimientos: number; abonos: number; cargos: number } {
  return { concepto, movimientos: 0, abonos: 0, cargos: 0 };
}

export function construirReporte(entrada: {
  periodo: string;
  cuentas: CuentaReporte[];
  movimientos: MovReporte[];
  cfdi: CfdiReporte[];
  grupos: GrupoReporte[];
  miembros: MiembroReporte[];
}): ReporteConciliacion {
  const grupoPorId = new Map(entrada.grupos.map((g) => [g.id, g]));
  const estadoMov = new Map<string, "confirmado" | "propuesto">();
  const estadoCfdi = new Map<string, "confirmado" | "propuesto">();
  const gruposDeCfdi = new Map<string, string[]>();
  for (const m of entrada.miembros) {
    const g = grupoPorId.get(m.grupo_id);
    if (!g) continue;
    const e = g.estado === "confirmado" ? "confirmado" : g.estado === "propuesto" ? "propuesto" : null;
    if (!e) continue;
    for (const [id, mapa] of [
      [m.movimiento_id, estadoMov],
      [m.cfdi_id, estadoCfdi],
    ] as const) {
      if (!id) continue;
      if (mapa.get(id) !== "confirmado") mapa.set(id, e);
    }
    if (m.cfdi_id && g.estado === "confirmado") gruposDeCfdi.set(m.cfdi_id, [...(gruposDeCfdi.get(m.cfdi_id) ?? []), g.id]);
  }

  // ── Banco ────────────────────────────────────────────────────────────────
  const r = {
    conciliado: nuevo("Conciliados con CFDI (confirmados)"),
    revision: nuevo("Con propuesta pendiente de revisar"),
    sinFactura: nuevo("Sin factura, clasificados"),
    noFiscal: nuevo("No fiscales / descartados"),
    depositos: nuevo("Depósitos sin identificar"),
    cargos: nuevo("Cargos sin comprobante"),
  };
  const porCategoria = new Map<string, Renglon>();
  const excepciones: Excepcion[] = [];
  let totalAbonos = 0;
  let totalCargos = 0;

  const suma = (x: Renglon, ab: number, ca: number) => {
    x.movimientos += 1;
    x.abonos += ab;
    x.cargos += ca;
  };

  for (const m of entrada.movimientos) {
    const ab = cent(m.abono);
    const ca = cent(m.cargo);
    totalAbonos += ab;
    totalCargos += ca;
    const est = estadoMov.get(m.id);
    if (est === "confirmado") suma(r.conciliado, ab, ca);
    else if (m.categoria_sin_cfdi) {
      suma(r.sinFactura, ab, ca);
      const k = m.categoria_sin_cfdi;
      const fila = porCategoria.get(k) ?? nuevo(NOMBRE_CATEGORIA[k] ?? k);
      suma(fila, ab, ca);
      porCategoria.set(k, fila);
    } else if (m.ignorado_at || m.no_fiscal) suma(r.noFiscal, ab, ca);
    else if (est === "propuesto") {
      suma(r.revision, ab, ca);
      excepciones.push({
        tipo: "propuesta_pendiente",
        prioridad: "baja",
        fecha: m.fecha,
        descripcion: m.descripcion ?? "(sin descripción)",
        importe: pesos(ab || -ca),
        movimiento_id: m.id,
      });
    } else if (ab > 0) {
      suma(r.depositos, ab, ca);
      excepciones.push({
        tipo: "deposito_sin_identificar",
        prioridad: "alta",
        fecha: m.fecha,
        descripcion: m.descripcion ?? "(sin descripción)",
        importe: pesos(ab),
        movimiento_id: m.id,
      });
    } else {
      suma(r.cargos, ab, ca);
      excepciones.push({
        tipo: "cargo_sin_comprobante",
        prioridad: ca >= 200000 ? "alta" : "media",
        fecha: m.fecha,
        descripcion: m.descripcion ?? "(sin descripción)",
        importe: pesos(-ca),
        movimiento_id: m.id,
      });
    }
  }

  const renglonesBanco = [r.conciliado, r.sinFactura, r.noFiscal, r.revision, r.depositos, r.cargos];
  const sumaAb = renglonesBanco.reduce((a, x) => a + x.abonos, 0);
  const sumaCa = renglonesBanco.reduce((a, x) => a + x.cargos, 0);

  // ── Cuentas: saldos ─────────────────────────────────────────────────────
  const cuentas: ResumenCuenta[] = entrada.cuentas
    .map((c) => {
      const movs = entrada.movimientos
        .filter((m) => m.cuenta_id === c.id)
        .map((m, i) => ({ m, i }))
        .sort((a, b) => (a.m.fecha === b.m.fecha ? a.i - b.i : a.m.fecha < b.m.fecha ? -1 : 1))
        .map((x) => x.m);
      if (!movs.length) return null;
      const ab = movs.reduce((a, m) => a + cent(m.abono), 0);
      const ca = movs.reduce((a, m) => a + cent(m.cargo), 0);
      const primero = movs[0];
      const ultimoConSaldo = [...movs].reverse().find((m) => m.saldo !== null && m.saldo !== undefined);
      const inicial = primero.saldo === null || primero.saldo === undefined ? null : cent(primero.saldo) - cent(primero.abono) + cent(primero.cargo);
      const final = ultimoConSaldo && ultimoConSaldo === movs[movs.length - 1] ? cent(ultimoConSaldo.saldo) : null;
      const calculado = inicial === null ? null : inicial + ab - ca;
      return {
        cuenta_id: c.id,
        nombre: [c.banco, c.alias, c.numero_cuenta_mask].filter(Boolean).join(" · ") || "Cuenta",
        saldo_inicial: inicial === null ? null : pesos(inicial),
        saldo_final: final === null ? null : pesos(final),
        saldo_final_calculado: calculado === null ? null : pesos(calculado),
        saldos_cuadran: final === null || calculado === null ? null : final === calculado,
        abonos: pesos(ab),
        cargos: pesos(ca),
        movimientos: movs.length,
      } satisfies ResumenCuenta;
    })
    .filter((x): x is ResumenCuenta => x !== null);

  // ── CFDI ─────────────────────────────────────────────────────────────────
  const fc = {
    cobrados: { ...nuevo("Emitidos cobrados en banco"), direccion: "emitido" as const },
    porCobrar: { ...nuevo("Emitidos PUE sin cobro en banco"), direccion: "emitido" as const },
    credito: { ...nuevo("Emitidos PPD (a crédito, esperan complemento)"), direccion: "emitido" as const },
    pagados: { ...nuevo("Recibidos pagados en banco"), direccion: "recibido" as const },
    porPagar: { ...nuevo("Recibidos PUE sin pago en banco"), direccion: "recibido" as const },
    creditoR: { ...nuevo("Recibidos PPD (a crédito, esperan complemento)"), direccion: "recibido" as const },
    otros: { ...nuevo("Complementos de pago, nómina, traslado y cancelados"), direccion: "otro" as const },
  };
  let emitidos = 0;
  let recibidos = 0;
  for (const c of entrada.cfdi) {
    const t = cent(c.total);
    const emit = c.direccion === "emitido";
    const tipo = (c.tipo_cfdi ?? "I").toUpperCase();
    const est = estadoCfdi.get(c.id);
    if (cancelado(c.estatus_sat)) {
      suma(fc.otros, emit ? t : 0, emit ? 0 : t);
      if (est === "confirmado") {
        excepciones.push({
          tipo: "cfdi_cancelado_conciliado",
          prioridad: "alta",
          fecha: c.fecha,
          descripcion: `CFDI cancelado en el SAT conciliado contra el banco: ${c.contraparte ?? c.uuid ?? ""}`.trim(),
          importe: pesos(t),
          cfdi_id: c.id,
        });
      }
      continue;
    }
    if (tipo !== "I" && tipo !== "E") {
      suma(fc.otros, emit ? t : 0, emit ? 0 : t);
      continue;
    }
    if (emit) emitidos += t;
    else recibidos += t;
    const ppd = (c.metodo_pago ?? "").toUpperCase() === "PPD";
    const fila = est === "confirmado" ? (emit ? fc.cobrados : fc.pagados) : ppd ? (emit ? fc.credito : fc.creditoR) : emit ? fc.porCobrar : fc.porPagar;
    suma(fila, emit ? t : 0, emit ? 0 : t);
    if (est !== "confirmado" && !ppd && tipo === "I") {
      excepciones.push({
        tipo: emit ? "cfdi_sin_cobro" : "cfdi_sin_pago",
        prioridad: "media",
        fecha: c.fecha,
        descripcion: `${emit ? "Factura emitida PUE sin cobro" : "Factura recibida PUE sin pago"}: ${c.contraparte ?? c.uuid ?? ""}`.trim(),
        importe: pesos(t),
        cfdi_id: c.id,
      });
    }
  }

  for (const g of entrada.grupos) {
    if (g.estado === "confirmado" && g.diferencia_centavos && Math.abs(g.diferencia_centavos) > 0) {
      excepciones.push({
        tipo: "diferencia_en_conciliado",
        prioridad: Math.abs(g.diferencia_centavos) > 100 ? "media" : "baja",
        fecha: "",
        descripcion: "Conciliación confirmada con diferencia entre banco y CFDI",
        importe: pesos(g.diferencia_centavos),
      });
    }
  }

  const ordenPrioridad = { alta: 0, media: 1, baja: 2 } as const;
  excepciones.sort(
    (a, b) =>
      ordenPrioridad[a.prioridad] - ordenPrioridad[b.prioridad] ||
      // Un CFDI cancelado conciliado es un riesgo fiscal: siempre arriba.
      Number(b.tipo === "cfdi_cancelado_conciliado") - Number(a.tipo === "cfdi_cancelado_conciliado") ||
      Math.abs(b.importe) - Math.abs(a.importe),
  );

  const aPesos = <T extends Renglon>(x: T): T => ({ ...x, abonos: pesos(x.abonos), cargos: pesos(x.cargos) });
  const totalMov = entrada.movimientos.length;
  const explicados = r.conciliado.movimientos + r.sinFactura.movimientos + r.noFiscal.movimientos;

  return {
    periodo: entrada.periodo,
    cuentas,
    banco: {
      renglones: renglonesBanco.filter((x) => x.movimientos > 0).map(aPesos),
      total_abonos: pesos(totalAbonos),
      total_cargos: pesos(totalCargos),
      cuadra: sumaAb === totalAbonos && sumaCa === totalCargos,
    },
    sin_factura_por_categoria: [...porCategoria.values()].sort((a, b) => b.abonos + b.cargos - (a.abonos + a.cargos)).map(aPesos),
    cfdi: {
      renglones: Object.values(fc).filter((x) => x.movimientos > 0).map(aPesos),
      emitidos_total: pesos(emitidos),
      recibidos_total: pesos(recibidos),
    },
    excepciones,
    avance: {
      movimientos_explicados_pct: totalMov ? Math.round((explicados / totalMov) * 100) : 0,
      pendientes: totalMov - explicados,
    },
  };
}
