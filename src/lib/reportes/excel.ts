import * as XLSX from "xlsx";

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
  XLSX.writeFile(wb, fname);
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
    triggerDownload(blob, `${tipo}_resumen.csv`);
    return;
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, `${tipo}_${cli.rfc ?? ""}_${periodo.desde ?? ""}.csv`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
