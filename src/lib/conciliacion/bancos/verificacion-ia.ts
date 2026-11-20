// ─────────────────────────────────────────────────────────────────────────────
// VERIFICACIÓN DE UN ESTADO DE CUENTA LEÍDO CON IA — módulo PURO
//
// La IA lee el PDF de cualquier banco y devuelve renglones. La IA NO decide si
// un importe es cargo o abono: lo decide la aritmética de los saldos.
//
//   saldo anterior + abono − cargo = saldo del renglón
//
// Si un renglón trae saldo, el cambio de saldo dicta el sentido y el importe.
// Si la IA puso el importe del lado equivocado y los saldos lo demuestran, se
// corrige y se anota. Si la cadena de saldos no cierra, o el saldo final no
// coincide con el resumen del estado de cuenta, NO se importa nada.
// ─────────────────────────────────────────────────────────────────────────────

export type RenglonIA = {
  fecha: string;
  descripcion: string;
  referencia?: string | null;
  cargo: number | null;
  abono: number | null;
  saldo: number | null;
};

export type LecturaIA = {
  banco: string | null;
  periodo_inicio: string | null;
  periodo_fin: string | null;
  saldo_inicial: number | null;
  saldo_final: number | null;
  total_cargos?: number | null;
  total_abonos?: number | null;
  movimientos: RenglonIA[];
};

export type MovimientoVerificado = {
  fecha: string;
  descripcion: string;
  referencia: string | null;
  cargo: number;
  abono: number;
  saldo: number | null;
};

export type ProblemaVerificacion = {
  renglon: number | null;
  codigo:
    | "SIN_MOVIMIENTOS"
    | "SIN_SALDO_INICIAL"
    | "FECHA_INVALIDA"
    | "FECHA_FUERA_PERIODO"
    | "SIN_IMPORTE"
    | "DOBLE_SENTIDO"
    | "SALDO_NO_CIERRA"
    | "SALDO_FINAL_DISTINTO"
    | "TOTALES_DISTINTOS"
    | "POCOS_SALDOS";
  motivo: string;
};

export type ResultadoVerificacion = {
  ok: boolean;
  movimientos: MovimientoVerificado[];
  problemas: ProblemaVerificacion[];
  /** Renglones cuyo sentido se corrigió por la aritmética de saldos. */
  correcciones: { renglon: number; motivo: string }[];
  resumen: {
    saldo_inicial: number | null;
    saldo_final_calculado: number | null;
    saldo_final_estado: number | null;
    total_cargos: number;
    total_abonos: number;
    renglones_con_saldo: number;
  };
};

const c = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 100));
const pesos = (cent: number) => Math.round(cent) / 100;

function fechaValida(f: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f ?? "");
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/**
 * Verifica la lectura de la IA. Trabaja en centavos enteros.
 * `minimo_con_saldo`: fracción mínima de renglones que deben traer saldo para
 * poder demostrar el sentido de cada uno (por omisión, todos).
 */
export function verificarLecturaIA(l: LecturaIA, opciones: { minimo_con_saldo?: number } = {}): ResultadoVerificacion {
  const problemas: ProblemaVerificacion[] = [];
  const correcciones: { renglon: number; motivo: string }[] = [];
  const movimientos: MovimientoVerificado[] = [];
  const minimo = opciones.minimo_con_saldo ?? 1;

  const inicial = c(l.saldo_inicial);
  if (!l.movimientos?.length) problemas.push({ renglon: null, codigo: "SIN_MOVIMIENTOS", motivo: "No se encontraron movimientos en el estado de cuenta." });
  if (inicial === null) problemas.push({ renglon: null, codigo: "SIN_SALDO_INICIAL", motivo: "No se encontró el saldo inicial del periodo: sin él no se puede comprobar la lectura." });

  let corrido = inicial;
  let cargos = 0;
  let abonos = 0;
  let conSaldo = 0;

  (l.movimientos ?? []).forEach((r, i) => {
    const n = i + 1;
    if (!fechaValida(r.fecha)) {
      problemas.push({ renglon: n, codigo: "FECHA_INVALIDA", motivo: `Renglón ${n}: la fecha «${r.fecha}» no es válida.` });
    } else if ((l.periodo_inicio && r.fecha < l.periodo_inicio) || (l.periodo_fin && r.fecha > l.periodo_fin)) {
      problemas.push({ renglon: n, codigo: "FECHA_FUERA_PERIODO", motivo: `Renglón ${n}: la fecha ${r.fecha} queda fuera del periodo del estado de cuenta.` });
    }

    let cargo = c(r.cargo) ?? 0;
    let abono = c(r.abono) ?? 0;
    if (cargo < 0) { abono += -cargo; cargo = 0; }
    if (abono < 0) { cargo += -abono; abono = 0; }
    const saldo = c(r.saldo);

    if (cargo > 0 && abono > 0) {
      problemas.push({ renglon: n, codigo: "DOBLE_SENTIDO", motivo: `Renglón ${n}: trae cargo y abono a la vez.` });
    }
    if (cargo === 0 && abono === 0) {
      problemas.push({ renglon: n, codigo: "SIN_IMPORTE", motivo: `Renglón ${n}: no trae importe.` });
    }

    if (saldo !== null && corrido !== null) {
      conSaldo += 1;
      const delta = saldo - corrido;
      const importe = Math.max(cargo, abono);
      if (delta === abono - cargo) {
        // Cuadra tal cual.
      } else if (importe > 0 && Math.abs(delta) === importe) {
        // El importe es correcto pero la IA lo puso del lado equivocado: el
        // saldo demuestra el sentido.
        correcciones.push({ renglon: n, motivo: `Renglón ${n}: el saldo demuestra que es ${delta > 0 ? "un abono" : "un cargo"}; se corrigió el sentido.` });
        abono = delta > 0 ? importe : 0;
        cargo = delta < 0 ? importe : 0;
      } else {
        problemas.push({
          renglon: n,
          codigo: "SALDO_NO_CIERRA",
          motivo: `Renglón ${n}: con el saldo anterior ${pesos(corrido).toFixed(2)} y este movimiento el saldo debería ser ${pesos(corrido + abono - cargo).toFixed(2)}, pero el estado de cuenta dice ${pesos(saldo).toFixed(2)}.`,
        });
      }
      corrido = saldo;
    } else if (corrido !== null) {
      corrido = corrido + abono - cargo;
    }

    cargos += cargo;
    abonos += abono;
    movimientos.push({
      fecha: r.fecha,
      descripcion: (r.descripcion ?? "").replace(/\s+/g, " ").trim() || "(sin descripción)",
      referencia: r.referencia?.trim() || null,
      cargo: pesos(cargo),
      abono: pesos(abono),
      saldo: saldo === null ? null : pesos(saldo),
    });
  });

  const total = movimientos.length;
  const finalEstado = c(l.saldo_final);
  // Un renglón sin saldo propio se comprueba con el siguiente saldo impreso o,
  // al final, con el saldo final del resumen. Sin ninguno de los dos no hay
  // forma de demostrar el sentido.
  if (total > 0 && conSaldo / total < minimo && finalEstado === null) {
    problemas.push({
      renglon: null,
      codigo: "POCOS_SALDOS",
      motivo: `Sólo ${conSaldo} de ${total} renglones traen saldo: no se puede demostrar el sentido de cada movimiento.`,
    });
  }

  const finalCalc = inicial === null ? null : inicial + abonos - cargos;
  if (finalEstado !== null && finalCalc !== null && finalCalc !== finalEstado) {
    problemas.push({
      renglon: null,
      codigo: "SALDO_FINAL_DISTINTO",
      motivo: `El saldo final calculado (${pesos(finalCalc).toFixed(2)}) no coincide con el del estado de cuenta (${pesos(finalEstado).toFixed(2)}): falta o sobra algún movimiento.`,
    });
  }
  const tc = c(l.total_cargos ?? null);
  const ta = c(l.total_abonos ?? null);
  if ((tc !== null && tc !== cargos) || (ta !== null && ta !== abonos)) {
    problemas.push({
      renglon: null,
      codigo: "TOTALES_DISTINTOS",
      motivo: `Los totales leídos (cargos ${pesos(cargos).toFixed(2)}, abonos ${pesos(abonos).toFixed(2)}) no coinciden con el resumen del estado de cuenta.`,
    });
  }

  return {
    ok: problemas.length === 0,
    movimientos,
    problemas,
    correcciones,
    resumen: {
      saldo_inicial: inicial === null ? null : pesos(inicial),
      saldo_final_calculado: finalCalc === null ? null : pesos(finalCalc),
      saldo_final_estado: finalEstado === null ? null : pesos(finalEstado),
      total_cargos: pesos(cargos),
      total_abonos: pesos(abonos),
      renglones_con_saldo: conSaldo,
    },
  };
}

/** Une las lecturas de varios bloques de páginas en una sola, en orden. */
export function unirLecturas(partes: LecturaIA[]): LecturaIA {
  const conInicial = partes.find((p) => p.saldo_inicial !== null && p.saldo_inicial !== undefined);
  const conFinal = [...partes].reverse().find((p) => p.saldo_final !== null && p.saldo_final !== undefined);
  const primero = (k: keyof LecturaIA) => partes.map((p) => p[k]).find((v) => v !== null && v !== undefined) ?? null;
  return {
    banco: primero("banco") as string | null,
    periodo_inicio: primero("periodo_inicio") as string | null,
    periodo_fin: [...partes].reverse().map((p) => p.periodo_fin).find((v) => !!v) ?? null,
    saldo_inicial: conInicial?.saldo_inicial ?? null,
    saldo_final: conFinal?.saldo_final ?? null,
    total_cargos: primero("total_cargos") as number | null,
    total_abonos: primero("total_abonos") as number | null,
    movimientos: partes.flatMap((p) => p.movimientos ?? []),
  };
}
