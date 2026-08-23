// ─────────────────────────────────────────────────────────────────────────────
// ADAPTADOR GENÉRICO POSICIONAL — fallback conservador.
// Nunca autoriza importación automática: como máximo entrega una vista previa
// para revisión humana, y ante cualquier ambigüedad devuelve "insuficiente".
// ─────────────────────────────────────────────────────────────────────────────
import type { AdaptadorBancario, ProblemaFila, ResultadoAdaptador } from "./tipos";
import { huellaFormato, normaliza } from "./posicional";

export const GENERICO_VERSION = "generico-2026.08.23";

export const adaptadorGenerico: AdaptadorBancario = {
  banco: "Genérico",
  adaptador: "generico",
  version: GENERICO_VERSION,
  encabezados_esperados: ["Fecha", "Descripción", "Cargo/Retiro", "Abono/Depósito", "Saldo"],
  limitaciones: [
    "No se importa automáticamente: exige revisión humana o CSV/XLSX.",
    "Bloquea la lectura ante cualquier fila cuyo sentido no pueda demostrarse.",
  ],
  detectar() {
    return 1; // siempre disponible como último recurso
  },
  extraer(renglones, texto): ResultadoAdaptador {
    const problemas: ProblemaFila[] = [
      {
        codigo: "FORMATO_NO_RECONOCIDO",
        pagina: null,
        fila_visual: null,
        texto: "",
        motivo:
          "El formato del PDF no corresponde a ningún adaptador bancario verificado. Descarga el estado de cuenta en CSV o Excel desde tu banca en línea.",
      },
    ];
    return {
      banco: "Genérico",
      adaptador: "generico",
      version: GENERICO_VERSION,
      huella: huellaFormato(["generico", String(renglones.length), normaliza(texto).slice(0, 40)]),
      periodo: null,
      periodo_inicio: null,
      periodo_fin: null,
      confianza: "insuficiente",
      auto: false,
      movimientos: [],
      problemas,
      totales_resumen: { cargos: null, abonos: null, saldo_inicial: null, saldo_final: null },
      calculado: {
        filas: 0, cargos: 0, abonos: 0, saldo_inicial: null, saldo_final: null,
        diferencia: 0, orden: "desconocido",
      },
      limitaciones: adaptadorGenerico.limitaciones,
    };
  },
};
