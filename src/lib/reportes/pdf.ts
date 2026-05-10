import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(Number(n) || 0);

const TIPO_LABEL: Record<string, string> = {
  estado_resultados: "Estado de Resultados",
  iva: "Reporte de IVA",
  isr: "Reporte de ISR (Pago provisional)",
  diferencias: "Diferencias Fiscales",
  xml_inconsistentes: "XML Inconsistentes",
  depositos_no_identificados: "Depósitos no Identificados",
};

export function downloadReportePDF(args: {
  tipo: string;
  payload: any;
  resumenIA?: string;
}) {
  const { tipo, payload, resumenIA } = args;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const meta = payload.meta ?? {};
  const cli = meta.cliente ?? {};
  const periodo = meta.periodo ?? {};

  // Header band
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, W, 90, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("ContaClick IA", 40, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(TIPO_LABEL[tipo] ?? tipo, 40, 60);
  doc.setFontSize(9);
  doc.setTextColor(186, 200, 220);
  doc.text(`Generado ${new Date().toLocaleString("es-MX")}`, 40, 78);

  // Cliente card
  let y = 110;
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(cli.razon_social ?? "—", 40, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80, 90, 110);
  doc.text(`RFC: ${cli.rfc ?? "—"}    Régimen: ${cli.regimen_fiscal ?? "—"}`, 40, y + 14);
  doc.text(`Periodo: ${periodo.desde ?? ""} al ${periodo.hasta ?? ""}`, 40, y + 28);
  y += 50;

  // KPI band
  const kpis = buildKpis(tipo, payload.resumen ?? {});
  if (kpis.length) {
    const colW = (W - 80) / kpis.length;
    kpis.forEach((k, i) => {
      const x = 40 + i * colW;
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(x, y, colW - 8, 56, 6, 6, "F");
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(k.label.toUpperCase(), x + 12, y + 18);
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(k.value, x + 12, y + 40);
    });
    y += 72;
  }

  // AI summary
  if (resumenIA) {
    doc.setFillColor(245, 247, 252);
    doc.roundedRect(40, y, W - 80, 0.1, 6, 6, "F");
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Resumen ejecutivo", 40, y + 14);
    y += 22;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(resumenIA.replace(/[#*_]/g, ""), W - 80);
    doc.text(lines, 40, y);
    y += lines.length * 12 + 12;
  }

  // Tables
  const tables = buildTables(tipo, payload);
  for (const t of tables) {
    if (y > 720) { doc.addPage(); y = 60; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(t.title, 40, y);
    autoTable(doc, {
      startY: y + 6,
      head: [t.head],
      body: t.body,
      styles: { fontSize: 8.5, cellPadding: 4, textColor: [30, 41, 59] },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 40, right: 40 },
    });
    y = (doc as any).lastAutoTable.finalY + 18;
  }

  // Footer
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(120, 130, 150);
    doc.text(`ContaClick IA · ${cli.razon_social ?? ""}`, 40, 820);
    doc.text(`Página ${p} de ${pages}`, W - 80, 820);
  }

  const fname = `${tipo}_${cli.rfc ?? "cliente"}_${periodo.desde ?? ""}_${periodo.hasta ?? ""}.pdf`;
  doc.save(fname);
}

function buildKpis(tipo: string, r: any): Array<{ label: string; value: string }> {
  if (tipo === "estado_resultados") return [
    { label: "Ingresos", value: fmtMXN(r.ingresos) },
    { label: "Egresos", value: fmtMXN(r.egresos) },
    { label: "Utilidad", value: fmtMXN(r.utilidad) },
    { label: "Margen", value: `${(r.margen_pct ?? 0).toFixed(1)}%` },
  ];
  if (tipo === "iva") return [
    { label: "IVA Trasladado", value: fmtMXN(r.iva_trasladado) },
    { label: "IVA Acreditable", value: fmtMXN(r.iva_acreditable) },
    { label: "IVA por Pagar", value: fmtMXN(r.iva_por_pagar) },
    { label: "A Favor", value: fmtMXN(r.a_favor) },
  ];
  if (tipo === "isr") return [
    { label: "Ingresos", value: fmtMXN(r.ingresos) },
    { label: "Deducciones", value: fmtMXN(r.deducciones) },
    { label: "Utilidad Fiscal", value: fmtMXN(r.utilidad_fiscal) },
    { label: "ISR por Pagar", value: fmtMXN(r.isr_por_pagar) },
  ];
  if (tipo === "diferencias") return [
    { label: "CFDI sin pago", value: String(r.cfdi_sin_pago ?? 0) },
    { label: "Mov. sin CFDI", value: String(r.movimientos_sin_cfdi ?? 0) },
    { label: "Monto CFDI", value: fmtMXN(r.monto_cfdi_sin_pago) },
    { label: "Monto Mov.", value: fmtMXN(r.monto_mov_sin_cfdi) },
  ];
  if (tipo === "xml_inconsistentes") return [
    { label: "Total CFDI", value: String(r.total_cfdi ?? 0) },
    { label: "Inconsistentes", value: String(r.inconsistentes ?? 0) },
  ];
  if (tipo === "depositos_no_identificados") return [
    { label: "Depósitos", value: String(r.total_depositos ?? 0) },
    { label: "Monto total", value: fmtMXN(r.monto_total) },
  ];
  return [];
}

function buildTables(tipo: string, p: any): Array<{ title: string; head: string[]; body: any[][] }> {
  const out: Array<{ title: string; head: string[]; body: any[][] }> = [];
  const fmtDate = (d: string) => (d ? d.slice(0, 10) : "");
  if (tipo === "estado_resultados" && p.detalle?.length) {
    out.push({
      title: "CFDI emitidos (top 100)",
      head: ["Fecha", "UUID", "Cliente", "Subtotal", "Total"],
      body: p.detalle.map((x: any) => [fmtDate(x.fecha), (x.uuid ?? "").slice(0, 8), x.cliente ?? "—", fmtMXN(x.subtotal), fmtMXN(x.total)]),
    });
  }
  if (tipo === "iva") {
    if (p.detalle_emitidos?.length) out.push({
      title: "IVA Trasladado (Emitidos)",
      head: ["Fecha", "UUID", "Receptor", "Subtotal", "IVA"],
      body: p.detalle_emitidos.slice(0, 100).map((x: any) => [fmtDate(x.fecha), (x.uuid ?? "").slice(0, 8), x.receptor ?? "—", fmtMXN(x.subtotal), fmtMXN(x.iva)]),
    });
    if (p.detalle_recibidos?.length) out.push({
      title: "IVA Acreditable (Recibidos)",
      head: ["Fecha", "UUID", "Emisor", "Subtotal", "IVA"],
      body: p.detalle_recibidos.slice(0, 100).map((x: any) => [fmtDate(x.fecha), (x.uuid ?? "").slice(0, 8), x.emisor ?? "—", fmtMXN(x.subtotal), fmtMXN(x.iva)]),
    });
  }
  if (tipo === "diferencias") {
    if (p.cfdi_sin_pago?.length) out.push({
      title: "CFDI sin movimiento bancario",
      head: ["Fecha", "Tipo", "Contraparte", "UUID", "Total"],
      body: p.cfdi_sin_pago.map((x: any) => [fmtDate(x.fecha), x.tipo ?? "", x.contra ?? "—", (x.uuid ?? "").slice(0, 8), fmtMXN(x.total)]),
    });
    if (p.mov_sin_cfdi?.length) out.push({
      title: "Movimientos sin CFDI",
      head: ["Fecha", "Descripción", "Cargo", "Abono"],
      body: p.mov_sin_cfdi.map((x: any) => [fmtDate(x.fecha), (x.descripcion ?? "").slice(0, 60), fmtMXN(x.cargo), fmtMXN(x.abono)]),
    });
  }
  if (tipo === "xml_inconsistentes" && p.detalle?.length) {
    out.push({
      title: "Inconsistencias detectadas",
      head: ["Fecha", "UUID", "Contraparte", "Total", "Motivos"],
      body: p.detalle.map((x: any) => [fmtDate(x.fecha), (x.uuid ?? "").slice(0, 8), x.contra ?? "—", fmtMXN(x.total), (x.motivos ?? []).join(" · ")]),
    });
  }
  if (tipo === "depositos_no_identificados" && p.detalle?.length) {
    out.push({
      title: "Depósitos por aclarar",
      head: ["Fecha", "Descripción", "Referencia", "Monto"],
      body: p.detalle.map((x: any) => [fmtDate(x.fecha), (x.descripcion ?? "").slice(0, 60), x.referencia ?? "", fmtMXN(x.abono)]),
    });
  }
  return out;
}
