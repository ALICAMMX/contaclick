// ─────────────────────────────────────────────────────────────────────────────
// CONCILIACIÓN INTEGRAL — detección pura (sin E/S, testeable).
//
// Reglas de honestidad para no generar falsas alarmas:
//  1. Sólo se acusa "CFDI sin póliza" cuando el periodo YA tiene contabilidad
//     registrada (al menos una póliza no rechazada). Si no hay pólizas, el
//     resultado es "sin datos suficientes", no 37 ingresos omitidos.
//  2. Sólo se cruza contra banco cuando hay movimientos validados en el rango.
//  3. Un cargo bancario se compara contra los CFDI RECIBIDOS antes de acusarlo
//     de "pago sin CFDI", y se excluye lo que el contador ya confirmó en la
//     conciliación bancaria.
//  4. El impacto de ISR se estima con la tasa del régimen y sobre la base sin
//     IVA. Si el régimen no permite una tasa razonable (PF con tarifa
//     progresiva), no se inventa un número.
// ─────────────────────────────────────────────────────────────────────────────

export type IncidenciaTipo =
  | "ingreso_sat_sin_poliza"
  | "gasto_sat_sin_poliza"
  | "pago_banco_sin_cfdi"
  | "cfdi_sin_movimiento"
  | "diferencia_monto"
  | "cfdi_duplicado"
  | "cfdi_cancelado_no_ajustado";

export type Gravedad = "critica" | "media" | "baja";

export type IncidenciaDraft = {
  tipo: IncidenciaTipo;
  gravedad: Gravedad;
  fecha: string | null;
  monto: number;
  cfdi_id?: string | null;
  poliza_id?: string | null;
  movimiento_id?: string | null;
  ref_hash: string;
  detalle: Record<string, unknown>;
  recomendacion: string;
  impacto_isr: number;
  impacto_iva: number;
};

export type CfdiIn = {
  id: string;
  uuid: string | null;
  tipo_cfdi: string | null;
  fecha: string | null;
  total: number | string | null;
  subtotal: number | string | null;
  iva_trasladado: number | string | null;
  rfc_emisor: string | null;
  rfc_receptor: string | null;
  estatus_sat: string | null;
  metodo_pago: string | null;
};

export type PolizaIn = {
  id: string;
  fecha: string | null;
  estado?: string | null;
  /** Columna legada; las pólizas canónicas la dejan vacía. */
  uuid_cfdi?: string | null;
  /** CFDI referenciados por los renglones (fuente canónica). */
  cfdi_ids: string[];
  monto: number;
};

export type MovIn = {
  id: string;
  fecha: string | null;
  descripcion: string | null;
  cargo: number | string | null;
  abono: number | string | null;
};

export type EntradaDeteccion = {
  rfcCliente: string;
  /** Clave(s) de régimen del expediente, p.ej. "612" o "601 · 626". */
  regimenFiscal: string | null;
  tipoPersona: "fisica" | "moral" | null;
  cfdi: CfdiIn[];
  polizas: PolizaIn[];
  movimientos: MovIn[];
  /** Movimientos ya confirmados por una persona en la conciliación bancaria. */
  movimientosConfirmados: Set<string>;
  /** CFDI ya confirmados por una persona en la conciliación bancaria. */
  cfdiConfirmados: Set<string>;
};

export type Suficiencia = {
  hay_contabilidad: boolean;
  hay_banco: boolean;
  isr_estimable: boolean;
  tasa_isr: number | null;
};

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const dia = (iso: string | null) => (iso ? String(iso).slice(0, 10) : null);
const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : NaN);
const dias = (a: string | null, b: string | null) => Math.abs(ms(a) - ms(b)) / 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Tasa de ISR razonable para ESTIMAR un impacto. No es un cálculo de
 * declaración: sólo dimensiona el riesgo.
 *  - Persona moral (Título II): 30 %.
 *  - RESICO PF (626): la tasa máxima de la tabla, 2.5 %, sobre ingresos.
 *  - PF con tarifa progresiva (612, 605, 606…): no se estima (null).
 */
export function tasaIsrEstimada(regimen: string | null, tipoPersona: "fisica" | "moral" | null): number | null {
  const claves: string[] = String(regimen ?? "").match(/\b6\d\d\b/g) ?? [];
  const esMoral =
    tipoPersona === "moral" ||
    claves.some((c) => ["601", "603", "620", "622", "623", "624"].includes(c));
  if (esMoral) return 0.3;
  if (claves.includes("626")) return 0.025;
  return null;
}

export function detectarIncidencias(e: EntradaDeteccion): {
  incidencias: IncidenciaDraft[];
  suficiencia: Suficiencia;
} {
  const rfc = e.rfcCliente.toUpperCase();
  const tasa = tasaIsrEstimada(e.regimenFiscal, e.tipoPersona);
  const isr = (base: number) => (tasa == null ? 0 : r2(base * tasa));

  const polizasVivas = e.polizas.filter((p) => (p.estado ?? "") !== "rechazada");
  const suficiencia: Suficiencia = {
    hay_contabilidad: polizasVivas.length > 0,
    hay_banco: e.movimientos.length > 0,
    isr_estimable: tasa != null,
    tasa_isr: tasa,
  };

  // Índices póliza ← CFDI (por renglón canónico y, de respaldo, por UUID legado).
  const polPorCfdiId = new Map<string, PolizaIn>();
  const polPorUuid = new Map<string, PolizaIn>();
  for (const p of polizasVivas) {
    for (const id of p.cfdi_ids) if (!polPorCfdiId.has(id)) polPorCfdiId.set(id, p);
    if (p.uuid_cfdi) polPorUuid.set(String(p.uuid_cfdi).toUpperCase(), p);
  }
  const polizaDe = (c: CfdiIn) =>
    polPorCfdiId.get(c.id) ?? (c.uuid ? polPorUuid.get(String(c.uuid).toUpperCase()) : undefined);

  const incidencias: IncidenciaDraft[] = [];
  const vigentes = e.cfdi.filter((c) => c.estatus_sat !== "cancelado");
  const esEmitido = (c: CfdiIn) => String(c.rfc_emisor ?? "").toUpperCase() === rfc;
  const esRecibido = (c: CfdiIn) => String(c.rfc_receptor ?? "").toUpperCase() === rfc;

  // 1 · Duplicados por UUID
  const porUuid = new Map<string, CfdiIn[]>();
  for (const c of e.cfdi) {
    if (!c.uuid) continue;
    const k = String(c.uuid).toUpperCase();
    porUuid.set(k, [...(porUuid.get(k) ?? []), c]);
  }
  for (const [uuid, arr] of porUuid) {
    if (arr.length < 2) continue;
    incidencias.push({
      tipo: "cfdi_duplicado",
      gravedad: "media",
      fecha: dia(arr[0].fecha),
      monto: num(arr[0].total),
      cfdi_id: arr[0].id,
      ref_hash: `dup:${uuid}`,
      detalle: { uuid, copias: arr.length },
      recomendacion: "Conserva un solo registro del CFDI y elimina las copias.",
      impacto_isr: 0,
      impacto_iva: 0,
    });
  }

  // 2 · Cancelado en el SAT pero contabilizado
  for (const c of e.cfdi) {
    if (c.estatus_sat !== "cancelado") continue;
    const p = polizaDe(c);
    if (!p) continue;
    incidencias.push({
      tipo: "cfdi_cancelado_no_ajustado",
      gravedad: "critica",
      fecha: dia(c.fecha),
      monto: num(c.total),
      cfdi_id: c.id,
      poliza_id: p.id,
      ref_hash: `canc:${String(c.uuid ?? c.id).toUpperCase()}`,
      detalle: { uuid: c.uuid, poliza: p.id },
      recomendacion: "El CFDI está cancelado en el SAT: reversa la póliza o registra el ajuste.",
      impacto_isr: esEmitido(c) ? isr(num(c.subtotal)) : 0,
      impacto_iva: num(c.iva_trasladado),
    });
  }

  // 3 · CFDI ↔ póliza (diferencias de monto) y 4 · CFDI sin póliza
  if (suficiencia.hay_contabilidad) {
    const usadas = new Set<string>();
    const sinPoliza: CfdiIn[] = [];
    for (const c of vigentes) {
      const p = polizaDe(c);
      if (!p) {
        sinPoliza.push(c);
        continue;
      }
      usadas.add(p.id);
      const dif = Math.abs(num(c.total) - num(p.monto));
      // Una póliza con varios CFDI no se compara contra el total de uno solo.
      if (p.cfdi_ids.length <= 1 && dif > 1) {
        incidencias.push({
          tipo: "diferencia_monto",
          gravedad: dif > 1000 ? "critica" : "media",
          fecha: dia(c.fecha),
          monto: r2(dif),
          cfdi_id: c.id,
          poliza_id: p.id,
          ref_hash: `dif:${String(c.uuid ?? c.id).toUpperCase()}`,
          detalle: { uuid: c.uuid, cfdi: num(c.total), poliza: num(p.monto), diff: r2(dif) },
          recomendacion: "Ajusta la póliza para que coincida con el CFDI vigente.",
          impacto_isr: 0,
          impacto_iva: 0,
        });
      }
    }
    // Respaldo: pólizas manuales sin referencia al CFDI (monto ±$1, fecha ±3 días).
    const libres = polizasVivas.filter((p) => !usadas.has(p.id) && p.cfdi_ids.length === 0 && !p.uuid_cfdi);
    for (const c of sinPoliza) {
      if (c.tipo_cfdi !== "I") continue;
      const emitido = esEmitido(c);
      if (!emitido && !esRecibido(c)) continue;
      const hit = libres.find(
        (p) => !usadas.has(p.id) && dias(p.fecha, c.fecha) <= 3 && Math.abs(num(p.monto) - num(c.total)) <= 1,
      );
      if (hit) {
        usadas.add(hit.id);
        continue;
      }
      const total = num(c.total);
      const tipo: IncidenciaTipo = emitido ? "ingreso_sat_sin_poliza" : "gasto_sat_sin_poliza";
      incidencias.push({
        tipo,
        gravedad: total > 50000 ? "critica" : total > 5000 ? "media" : "baja",
        fecha: dia(c.fecha),
        monto: total,
        cfdi_id: c.id,
        ref_hash: `${tipo}:${String(c.uuid ?? c.id).toUpperCase()}`,
        detalle: { uuid: c.uuid, contraparte: emitido ? c.rfc_receptor : c.rfc_emisor },
        recomendacion: emitido
          ? "Registra el ingreso en la contabilidad del periodo."
          : "Registra el gasto y valida su deducibilidad.",
        impacto_isr: emitido ? isr(num(c.subtotal)) : 0,
        impacto_iva: emitido ? num(c.iva_trasladado) : -num(c.iva_trasladado),
      });
    }
  }

  // 5 · Cruce contra banco (sólo si hay movimientos validados)
  if (suficiencia.hay_banco) {
    const movUsados = new Set<string>(e.movimientosConfirmados);
    const cfdiUsados = new Set<string>(e.cfdiConfirmados);
    const abonos = e.movimientos.filter((m) => num(m.abono) > 0);
    const cargos = e.movimientos.filter((m) => num(m.cargo) > 0);
    const empata = (m: MovIn, monto: number, c: CfdiIn, ventana: number) =>
      !movUsados.has(m.id) && dias(m.fecha, c.fecha) <= ventana && Math.abs(monto - num(c.total)) <= 1;

    // 5a · CFDI emitido PUE sin depósito
    for (const c of vigentes) {
      if (c.tipo_cfdi !== "I" || !esEmitido(c) || (c.metodo_pago ?? "") !== "PUE") continue;
      if (cfdiUsados.has(c.id)) continue;
      const hit = abonos.find((m) => empata(m, num(m.abono), c, 7));
      if (hit) {
        movUsados.add(hit.id);
        cfdiUsados.add(c.id);
        continue;
      }
      const total = num(c.total);
      incidencias.push({
        tipo: "cfdi_sin_movimiento",
        gravedad: total > 50000 ? "critica" : "media",
        fecha: dia(c.fecha),
        monto: total,
        cfdi_id: c.id,
        ref_hash: `nopay:${String(c.uuid ?? c.id).toUpperCase()}`,
        detalle: { uuid: c.uuid, metodo: c.metodo_pago },
        recomendacion: "Confirma el cobro: si se cobró, concílialo; si no, revisa si debió emitirse en PPD.",
        impacto_isr: 0,
        impacto_iva: 0,
      });
    }

    // 5b · Cargos: primero se buscan entre los CFDI recibidos (cualquier método).
    const recibidos = vigentes.filter((c) => esRecibido(c) && (c.tipo_cfdi === "I" || c.tipo_cfdi === "P"));
    for (const m of cargos) {
      if (movUsados.has(m.id)) continue;
      const monto = num(m.cargo);
      const hit = recibidos.find((c) => !cfdiUsados.has(c.id) && empata(m, monto, c, 7));
      if (hit) {
        movUsados.add(m.id);
        cfdiUsados.add(hit.id);
        continue;
      }
      if (monto < 500) continue; // micro-cargos: comisiones, IVA de comisiones
      const base = monto / 1.16;
      incidencias.push({
        tipo: "pago_banco_sin_cfdi",
        gravedad: monto > 50000 ? "critica" : monto > 5000 ? "media" : "baja",
        fecha: dia(m.fecha),
        monto,
        movimiento_id: m.id,
        ref_hash: `nocfdi:${m.id}`,
        detalle: { descripcion: m.descripcion },
        recomendacion:
          "Pide el CFDI al proveedor o documenta el cargo (traspaso propio, pago de impuestos, nómina, préstamo).",
        // Si no hay CFDI, lo que se arriesga es la deducción del gasto.
        impacto_isr: isr(base),
        impacto_iva: r2(monto - base),
      });
    }
  }

  return { incidencias, suficiencia };
}

/** KPIs a partir de las incidencias de UNA corrida. */
export function kpisDe(incidencias: IncidenciaDraft[]) {
  const n = (t: IncidenciaTipo) => incidencias.filter((i) => i.tipo === t).length;
  return {
    ingresos_omitidos: n("ingreso_sat_sin_poliza"),
    gastos_sin_registrar: n("gasto_sat_sin_poliza"),
    cfdi_sin_pago: n("cfdi_sin_movimiento"),
    pagos_sin_cfdi: n("pago_banco_sin_cfdi"),
    duplicados: n("cfdi_duplicado"),
    cancelados: n("cfdi_cancelado_no_ajustado"),
    diferencias: n("diferencia_monto"),
  };
}
