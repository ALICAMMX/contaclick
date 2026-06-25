import * as XLSX from "xlsx";
import { safeFilename, triggerFileDownload } from "@/lib/download";

const fmt = (n: number) => Number(Number(n ?? 0).toFixed(2));

export function downloadReporteExcel(args: { tipo: string; payload: any }) {
  const { tipo, payload } = args;
  const wb = XLSX.utils.book_new();
  const meta = payload.meta ?? {};
  const cli = meta.cliente ?? {};
  const periodo = meta.periodo ?? {};

  // Resumen sheet
  const resumen = payload.resumen ?? {};
  const resumenRows = [
    ["ContaClick IA — Reporte"],
    ["Tipo", tipo],
    ["Cliente", cli.razon_social ?? ""],
    ["RFC", cli.rfc ?? ""],
    ["Periodo", `${periodo.desde ?? ""} al ${periodo.hasta ?? ""}`],
    ["Generado", new Date().toLocaleString("es-MX")],
    [],
    ["Resumen"],
    ...Object.entries(resumen).map(([k, v]) => [k, typeof v === "number" ? fmt(v as number) : (v as string)]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(resumenRows);
  ws["!cols"] = [{ wch: 28 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, ws, "Resumen");

  const addSheet = (name: string, rows: any[]) => {
    if (!rows?.length) return;
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, sheet, name.slice(0, 31));
  };

  if (tipo === "estado_resultados") addSheet("CFDI Emitidos", payload.detalle ?? []);
  if (tipo === "iva") {
    addSheet("Emitidos", payload.detalle_emitidos ?? []);
    addSheet("Recibidos", payload.detalle_recibidos ?? []);
  }
  if (tipo === "diferencias") {
    addSheet("CFDI sin pago", payload.cfdi_sin_pago ?? []);
    addSheet("Mov sin CFDI", payload.mov_sin_cfdi ?? []);
  }
  if (tipo === "xml_inconsistentes") addSheet("Inconsistencias", (payload.detalle ?? []).map((x: any) => ({ ...x, motivos: (x.motivos ?? []).join(" · ") })));
  if (tipo === "depositos_no_identificados") addSheet("Depósitos", payload.detalle ?? []);
  if (tipo === "balanza") {
    addSheet("Ingresos por cliente", payload.ingresos ?? []);
    addSheet("Egresos por proveedor", payload.egresos ?? []);
  }
  if (tipo === "balance_general") {
    addSheet("Activo", payload.activo ?? []);
    addSheet("Pasivo", payload.pasivo ?? []);
    addSheet("Capital", payload.capital ?? []);
  }
  if (tipo === "diot") addSheet("DIOT", payload.detalle ?? []);

  const fname = `${tipo}_${cli.rfc ?? "cliente"}_${periodo.desde ?? ""}_${periodo.hasta ?? ""}.xlsx`;
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  triggerFileDownload(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), safeFilename(fname, "reporte.xlsx"));
}

export function downloadReporteCSV(args: { tipo: string; payload: any }) {
  const { tipo, payload } = args;
  const meta = payload.meta ?? {};
  const cli = meta.cliente ?? {};
  const periodo = meta.periodo ?? {};
  const rows: any[] =
    payload.detalle ?? payload.detalle_emitidos ?? payload.cfdi_sin_pago ?? [];
  if (!rows.length) {
    const r = payload.resumen ?? {};
    const blob = new Blob([
      Object.entries(r).map(([k, v]) => `${k},${v}`).join("\n"),
    ], { type: "text/csv;charset=utf-8;" });
    triggerFileDownload(blob, safeFilename(`${tipo}_resumen.csv`, "reporte.csv"));
    return;
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  triggerFileDownload(blob, safeFilename(`${tipo}_${cli.rfc ?? ""}_${periodo.desde ?? ""}.csv`, "reporte.csv"));
}

// DIOT — formato batch SAT (campos separados por |). Versión simplificada nacionales.
export function downloadDIOTtxt(args: { payload: any }) {
  const { payload } = args;
  const meta = payload.meta ?? {};
  const cli = meta.cliente ?? {};
  const periodo = meta.periodo ?? {};
  const detalle: any[] = payload.detalle ?? [];
  const round = (n: number) => Math.round(Number(n ?? 0));
  const lines = detalle.map((x) => {
    return [
      x.tipo_tercero ?? "04",
      x.tipo_operacion ?? "85",
      x.rfc ?? "",
      "", // ID fiscal extranjero
      "", // Nombre extranjero
      "", // País
      "", // Nacionalidad
      round(x.iva16), // Valor actos pagados a tasa 16%
      round((x.iva16 ?? 0) * 0.16), // IVA pagado
      0, 0, 0, // Tasa 16% región fronteriza placeholders
      round(x.iva0), // Valor actos 0%
      round(x.exento), // Exento
      round(x.iva_ret), // IVA retenido por el contribuyente
    ].join("|");
  });
  const content = lines.join("\r\n");
  const blob = new Blob([content], { type: "text/plain;charset=utf-8;" });
  triggerFileDownload(blob, safeFilename(`DIOT_${cli.rfc ?? ""}_${periodo.desde ?? ""}_${periodo.hasta ?? ""}.txt`, "diot.txt"));
}

