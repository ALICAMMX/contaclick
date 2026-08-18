// Núcleo de ejecución de corridas SAT (SOLO servidor).
//
// Vive en un módulo `.server` porque carga el proveedor directo del SAT, que
// usa criptografía de Node (node:crypto/node-forge) y no puede formar parte
// del bundle del navegador. `runSyncNow` y el despachador de programaciones
// lo importan dinámicamente.
import { computeSaludFiscal } from "@/lib/salud/salud.functions";
import { computeRiesgoSAT } from "@/lib/riesgo/riesgo.functions";
import { runExpressAudit } from "@/lib/auditor/auditor.functions";
import { scanClienteEfos } from "@/lib/efos/efos.functions";
import { assertClienteScope } from "@/lib/despacho/scope";
import {
  assertSatRunPermitido,
  devolverReservaPac,
  registrarConsumoSat,
  type FrecuenciaSat,
} from "@/lib/usage/sat-quota";
import { PROVEEDORES } from "@/lib/sat/providers/contrato";
import { rangoValido } from "@/lib/sat/consumo";
import { resolverRangoSat } from "@/lib/sat/periodo";
import { llaveCorrida } from "@/lib/sat/idempotencia";
import { tieneFolioSat } from "@/lib/sat/saneamiento";
import {
  ESTADOS_ACTIVOS,
  resolverEstadoCorrida,
  type EstadoCorrida,
  type SolicitudRegistro,
} from "@/lib/sat/maquina-estados";
import {
  calcularEstado,
  calcularProxima,
  type FalloSatSync,
  type SalidaSatSync,
  type Frecuencia,
} from "@/lib/sat/sat-sync.functions";

export function fallo(e: FalloSatSync["error"]): FalloSatSync {
  return { ok: false, error: e };
}

/**
 * NÚCLEO ÚNICO DE EJECUCIÓN DE CORRIDAS SAT.
 *
 * `runSyncNow` (manual) y el despachador de programaciones usan EXACTAMENTE
 * esta función: mismo preflight, misma e.firma, mismo alcance, mismas cuotas,
 * mismo candado de idempotencia, mismo proveedor, mismos estados y misma
 * bitácora. No existe un segundo runner SAT.
 */
export async function ejecutarCorridaSat(args: {
  supabase: any;
  userId: string;
  cliente_id: string;
  origen: "manual" | "expediente" | "cron";
  cascade?: boolean;
  /** Ventana forzada por una programación; si falta se usa la del expediente. */
  rangoOverride?: { desde: string; hasta: string } | null;
}): Promise<SalidaSatSync> {
  {
    const { supabase, userId } = args;
    const data = {
      cliente_id: args.cliente_id,
      origen: args.origen,
      cascade: args.cascade ?? true,
    };
    const inicio = Date.now();

    const scope = await assertClienteScope(supabase as any, userId, data.cliente_id);

    const { data: cli } = await supabase
      .from("clientes")
      .select("id, rfc, razon_social, despacho_id")
      .eq("id", scope.cliente_id)
      .maybeSingle();
    if (!cli?.despacho_id || !cli.rfc) {
      return fallo({
        etapa: "preflight",
        codigo: "expediente_incompleto",
        mensaje: "El expediente no existe o no tiene RFC capturado.",
        accion: "Captura el RFC del expediente antes de descargar comprobantes.",
        corrida_creada: false,
        solicitud_enviada: false,
        run_id: null,
      });
    }

    // 1) PREFLIGHT COMPLETO. Incluye verificar que la e.firma se puede DESCIFRAR
    //    con su AAD y su versión de llave: si aquí falla, no se crea corrida,
    //    no se consume cuota, no queda candado y no se contacta al SAT.
    const estado = await calcularEstado(supabase, userId, scope, { verificarDescifrado: true });
    // 1.a) Rango: se detecta LOCALMENTE. Una FechaFinal futura provoca el
    //      rechazo 301 del SAT; jamás debe crearse una corrida por eso.
    if (estado.rango_error) {
      return fallo({
        etapa: "preflight",
        codigo: "rango_sat_invalido",
        mensaje: estado.rango_error.motivo,
        accion: estado.rango_error.accion,
        corrida_creada: false,
        solicitud_enviada: false,
        run_id: null,
      });
    }
    if (!estado.puede_ejecutar) {
      return fallo({
        etapa: "preflight",
        codigo: estado.causa === "sin_credencial" ? estado.credencial.motivo : estado.causa,
        mensaje: estado.motivo ?? "La descarga SAT no está disponible en este momento.",
        accion: estado.accion ?? "Revisa la configuración del expediente.",
        corrida_creada: false,
        solicitud_enviada: false,
        run_id: null,
      });
    }


    const { data: cfg } = await supabase
      .from("sat_sync_config")
      .select("*")
      .eq("cliente_id", scope.cliente_id)
      .maybeSingle();

    const proveedor = estado.proveedor;
    const meta = PROVEEDORES[proveedor];
    // La programación puede forzar la ventana; el resto del preflight (cuota,
    // e.firma, candado, proveedor) es idéntico al de la ejecución manual.
    const ventana =
      args.rangoOverride && rangoValido(args.rangoOverride.desde, args.rangoOverride.hasta)
        ? args.rangoOverride
        : estado.rango;
    const { desde, hasta } = ventana;
    const direcciones = estado.direcciones;

    // Candado final ANTES de insertar la corrida, reservar cuota, firmar o
    // contactar al SAT: el rango efectivo (incluida la ventana forzada por una
    // programación) debe terminar en un día completo de la hora del centro.
    const rangoEfectivo = resolverRangoSat({
      periodo: "personalizado",
      fechaDesde: desde,
      fechaHasta: hasta,
    });
    if (!rangoEfectivo.ok) {
      return fallo({
        etapa: "preflight",
        codigo: "rango_sat_invalido",
        mensaje: rangoEfectivo.motivo,
        accion: rangoEfectivo.accion,
        corrida_creada: false,
        solicitud_enviada: false,
        run_id: null,
      });
    }

    // 2) Idempotencia: una sola corrida activa por proveedor+expediente+ventana.
    const idem = llaveCorrida({
      proveedor,
      clienteId: scope.cliente_id,
      direcciones,
      tipo: "CFDI",
      desde,
      hasta,
    });

    const { data: runIns, error: runErr } = await supabase
      .from("sat_sync_runs")
      .insert({
        despacho_id: cli.despacho_id,
        cliente_id: cli.id,
        origen: data.origen,
        proveedor,
        tipo: direcciones.length === 2 ? "ambos" : (direcciones[0] ?? "recibidos"),
        desde,
        hasta,
        estado: "solicitando",
        estatus: "en_curso",
        idempotency_key: idem,
        triggered_by: userId,
      })
      .select("id")
      .single();

    if (runErr || !runIns) {
      // El índice único parcial rechazó una segunda corrida simultánea.
      if ((runErr as any)?.code === "23505") {
        const { data: viva } = await supabase
          .from("sat_sync_runs")
          .select("id, estado")
          .eq("idempotency_key", idem)
          .in("estado", ESTADOS_ACTIVOS)
          .maybeSingle();
        return {
          ok: true,
          duplicada: true,
          run_id: (viva as any)?.id ?? null,
          estado: ((viva as any)?.estado ?? "esperando_sat") as EstadoCorrida,
          mensaje:
            "Ya hay una corrida en proceso para este mismo periodo. El SAT es asíncrono: " +
            "la descarga continúa en segundo plano.",
          nuevos: 0,
          duplicados: 0,
          rechazados: 0,
          errores: [] as { fase: string; mensaje: string }[],
        };
      }
      throw new Error(runErr?.message ?? "No se pudo registrar la corrida.");
    }
    const runId = runIns.id as string;

    // 3) Cuota del plan (siempre) y saldo del proveedor (sólo PAC).
    let reservaKey: string | null = null;
    try {
      const res = await assertSatRunPermitido({
        supabase,
        despachoId: cli.despacho_id,
        frecuencia: (cfg?.frecuencia ?? "manual") as FrecuenciaSat,
        previstas: estado.previstas,
        runId,
        esMock: estado.es_sandbox,
        usaSaldoProveedor: meta.consumeSaldoProveedor,
      });
      reservaKey = res.reservaKey;
    } catch (e: any) {
      const mensaje = String(e?.message ?? e).slice(0, 300);
      await supabase
        .from("sat_sync_runs")
        .update({
          estado: "error",
          estatus: "error",
          cobertura: "nula",
          finalizado_at: new Date().toISOString(),
          duracion_ms: Date.now() - inicio,
          errores: [{ fase: "cuota", mensaje }] as any,
          detalle: mensaje,
        })
        .eq("id", runId);
      return fallo({
        etapa: "cuota",
        codigo: "cuota_o_saldo",
        mensaje,
        accion: "Revisa el límite de solicitudes de tu plan o espera al siguiente periodo.",
        corrida_creada: true,
        solicitud_enviada: false,
        run_id: runId,
      });

    }

    const errores: { fase: string; mensaje: string }[] = [];
    let solicitudes: SolicitudRegistro[] = [];
    let resumen = resolverEstadoCorrida([]);

    try {
      if (estado.es_sandbox) {
        // Cuenta demo: NO se contacta al SAT y se etiqueta con claridad.
        const { simularCorridaDemo } = await import("@/lib/sat/demo-sat.server");
        const sim = await simularCorridaDemo({
          supabase,
          despachoId: cli.despacho_id,
          clienteId: cli.id,
          runId,
          direcciones,
          desde,
          hasta,
        });
        solicitudes = sim.solicitudes;
        resumen = sim.resumen;
      } else {
        const { solicitarDescargas, cosecharCorrida } = await import(
          "@/lib/sat/sat-directo-runner.server"
        );
        const envio = await solicitarDescargas({
          supabase,
          clienteId: cli.id,
          despachoId: cli.despacho_id,
          rfc: cli.rfc,
          desde,
          hasta,
          direcciones,
        });
        for (const m of envio.errores) errores.push({ fase: "solicitud", mensaje: m });
        solicitudes = envio.solicitudes;

        // Persistir antes de cosechar: si algo falla, la corrida no se pierde.
        await supabase
          .from("sat_sync_runs")
          .update({ solicitudes: solicitudes as any, estado: "esperando_sat" })
          .eq("id", runId);

        const cosecha = await cosecharCorrida({
          supabase,
          despachoId: cli.despacho_id,
          clienteId: cli.id,
          rfc: cli.rfc,
          // CANDADO DE LINAJE: sin `runId` los comprobantes se guardan sin
          // vínculo con la corrida y el detalle muestra "0 de N". Es
          // obligatorio en TODAS las rutas de cosecha.
          runId,
          solicitudes,
        });
        solicitudes = cosecha.solicitudes;
        resumen = cosecha.resumen;
      }
    } catch (e: any) {
      // NINGUNA excepción puede dejar la corrida viva: se cierra aquí mismo,
      // se libera el candado y se devuelve la reserva no consumida.
      const mensaje = String(e?.message ?? e).slice(0, 300);
      const conFolio = tieneFolioSat(solicitudes);
      await supabase
        .from("sat_sync_runs")
        .update({
          estado: "error",
          estatus: "error",
          cobertura: "nula",
          solicitudes: solicitudes as any,
          finalizado_at: new Date().toISOString(),
          duracion_ms: Date.now() - inicio,
          errores: [...errores, { fase: "solicitud", mensaje }] as any,
          detalle: mensaje,
        })
        .eq("id", runId);
      if (reservaKey && !conFolio) {
        await devolverReservaPac(supabase, reservaKey, "Corrida abortada antes de enviar al SAT");
      }
      return fallo({
        etapa: "solicitud",
        codigo: "fallo_solicitud",
        mensaje,
        accion: conFolio
          ? "El SAT ya recibió la solicitud. Usa Reintentar para consultar el avance."
          : "No se envió nada al SAT ni se consumió cuota. Corrige el problema y vuelve a intentar.",
        corrida_creada: true,
        solicitud_enviada: conFolio,
        run_id: runId,
      });
    }


    const { guardarAvanceCorrida } = await import("@/lib/sat/sat-directo-runner.server");
    const terminal = await guardarAvanceCorrida(supabase, runId, solicitudes, resumen);
    await supabase
      .from("sat_sync_runs")
      .update({ duracion_ms: Date.now() - inicio, errores: errores as any })
      .eq("id", runId);

    // 4) Liquidación: sólo se cobran las solicitudes efectivamente enviadas.
    const enviadas = solicitudes.filter((s) => !!s.id_solicitud).length;
    if (enviadas === 0) {
      if (reservaKey) await devolverReservaPac(supabase, reservaKey, "Ninguna solicitud enviada");
    } else {
      try {
        await registrarConsumoSat({
          supabase,
          despachoId: cli.despacho_id,
          solicitudes: enviadas,
          esMock: estado.es_sandbox,
          reservaKey,
          runId,
        });
      } catch (e: any) {
        console.warn("[sat-sync] registrar consumo falló:", e?.message ?? e);
      }
    }

    if (cfg) {
      await supabase
        .from("sat_sync_config")
        .update({
          ultima_corrida_at: new Date().toISOString(),
          proxima_corrida_at: calcularProxima((cfg.frecuencia ?? "manual") as Frecuencia),
        })
        .eq("cliente_id", cli.id);
    }

    await supabase
      .from("sat_credenciales")
      .update({
        last_sync_at: new Date().toISOString(),
        // El error de una CORRIDA no es un error del certificado: la e.firma
        // sigue conectada y su tarjeta no debe mostrar el rechazo del request.
        last_error: null,
        estatus: "activo",
      })
      .eq("cliente_id", cli.id);

    if (resumen.xml_nuevos > 0) {
      await supabase.from("alertas").insert({
        despacho_id: cli.despacho_id,
        cliente_id: cli.id,
        nivel: "bajo",
        tipo: "sat_sync",
        titulo: `${resumen.xml_nuevos} CFDI nuevos descargados`,
        descripcion: `Descarga masiva ${desde} → ${hasta} (${cli.rfc})`,
      });
    }
    if (resumen.advertencia) {
      await supabase.from("alertas").insert({
        despacho_id: cli.despacho_id,
        cliente_id: cli.id,
        nivel: "medio",
        tipo: "sat_sync_parcial",
        titulo: "Descarga SAT con cobertura parcial",
        descripcion: resumen.advertencia,
      });
    }

    await supabase.from("audit_logs").insert({
      user_id: userId,
      despacho_id: cli.despacho_id,
      accion: "sat_sync.run",
      entidad: "cliente",
      entidad_id: cli.id,
      payload: {
        run_id: runId,
        proveedor,
        estado: resumen.estado,
        cobertura: resumen.cobertura,
        solicitudes_enviadas: enviadas,
        nuevos: resumen.xml_nuevos,
        duplicados: resumen.duplicados,
        rechazados: resumen.rechazados,
        errores,
      },
    });

    // 5) Cascada SOLO si la corrida terminó y trajo comprobantes nuevos.
    if (data.cascade && terminal && resumen.xml_nuevos > 0) {
      await recalcularYCerrar({
        supabase,
        clienteId: cli.id,
        despachoId: cli.despacho_id,
        runId,
        resumen: {
          xml_nuevos: resumen.xml_nuevos,
          duplicados: resumen.duplicados,
          rechazados: resumen.rechazados,
        },
      });
    }

    // CONTRATO DISCRIMINADO: una corrida terminada en error NUNCA se devuelve
    // como éxito, y ninguna salida `ok:false` puede carecer de `error`.
    if (resumen.estado === "error") {
      const motivoSat =
        errores.find((x) => !!x?.mensaje)?.mensaje ??
        resumen.advertencia ??
        "El SAT no completó la descarga de esta corrida.";
      return fallo({
        etapa: "cosecha",
        codigo: "respuesta_sat_no_completada",
        mensaje: String(motivoSat).slice(0, 300),
        accion:
          "Revisa el detalle de la corrida y usa Reintentar para volver a consultar el avance en el SAT.",
        corrida_creada: true,
        solicitud_enviada: enviadas > 0 || tieneFolioSat(solicitudes),
        run_id: runId,
      });
    }

    return {
      ok: true as const,
      duplicada: false,
      run_id: runId,
      estado: resumen.estado,
      cobertura: resumen.cobertura,
      advertencia: resumen.advertencia,
      nuevos: resumen.xml_nuevos,
      duplicados: resumen.duplicados,
      rechazados: resumen.rechazados,
      mensaje: terminal
        ? `Descarga terminada: ${resumen.xml_nuevos} nuevos, ${resumen.duplicados} duplicados, ${resumen.rechazados} rechazados.`
        : "Solicitud enviada al SAT. La descarga continúa en segundo plano; puedes cerrar esta pantalla.",
      errores,
    };

  }
}

/**
 * Recálculos posteriores a una descarga.
 *
 * Cada módulo deja un EVENTO con su resultado (ok o fallo) ligado a la corrida:
 * el detalle de la corrida debe poder responder "qué se recalculó y cuándo",
 * y una corrida no se declara completada sin esa evidencia.
 */
export async function ejecutarCascada(
  clienteId: string,
  ctx?: {
    supabase: any;
    despachoId?: string | null;
    runId?: string | null;
    /** Si se indica, sólo se ejecutan estos módulos (recuperación selectiva). */
    soloModulos?: string[];
  },
) {
  // Con corrida: se usa el ejecutor con bitácora por módulo (fuente única).
  if (ctx?.supabase && ctx.runId) {
    const { ejecutarProcesamientoPosterior } = await import("./procesamiento.server");
    const executionId = crypto.randomUUID();
    const { resultados } = await ejecutarProcesamientoPosterior({
      supabase: ctx.supabase,
      runId: ctx.runId,
      clienteId,
      despachoId: (ctx.despachoId ?? null) as string,
      nuevos: 1,
      executionId,
      soloModulos: ctx.soloModulos,
    });
    return resultados.map((r) => ({
      modulo: r.module_id,
      ok: r.estado === "completado" || r.estado === "omitido" || r.estado === "recuperado",
      mensaje: r.motivo ?? undefined,
      ms: 0,
    }));
  }

  // Sin corrida (recálculo suelto): se ejecuta sin bitácora de corrida.
  const resultados: Array<{ modulo: string; ok: boolean; mensaje?: string; ms: number }> = [];
  const filtro = ctx?.soloModulos;
  const safe = async (fn: () => Promise<any>, modulo: string) => {
    if (filtro && !filtro.includes(modulo)) return;
    const t0 = Date.now();
    try {
      await fn();
      resultados.push({ modulo, ok: true, ms: Date.now() - t0 });
    } catch (e: any) {
      const mensaje = String(e?.message ?? e).slice(0, 250);
      console.warn(`[sat-sync cascada] ${modulo} falló:`, mensaje);
      resultados.push({ modulo, ok: false, mensaje, ms: Date.now() - t0 });
    }
  };
  await safe(() => computeSaludFiscal({ data: { cliente_id: clienteId } }), "salud_fiscal");
  await safe(() => computeRiesgoSAT({ data: { cliente_id: clienteId } }), "riesgo_sat");
  await safe(() => runExpressAudit({ data: { cliente_id: clienteId } }), "auditor_cfdi");
  await safe(() => scanClienteEfos({ data: { cliente_id: clienteId } }), "efos");
  return resultados;
}


/** Ejecuta los recálculos y cierra la corrida que quedó en `recalculando`. */
export async function recalcularYCerrar(args: {
  supabase: any;
  clienteId: string;
  despachoId?: string | null;
  runId: string;
  resumen: { xml_nuevos: number; duplicados: number; rechazados: number };
}) {
  await ejecutarCascada(args.clienteId, {
    supabase: args.supabase,
    despachoId: args.despachoId,
    runId: args.runId,
  });
  const { cerrarTrasRecalculo } = await import("@/lib/sat/sat-directo-runner.server");
  await cerrarTrasRecalculo(args.supabase, args.runId, args.resumen);
}
