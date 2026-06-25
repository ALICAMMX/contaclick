import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { SaludFiscal } from "./salud.functions";

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(Number(n) || 0);

const semColor = (s: string): [number, number, number] =>
  s === "verde" ? [34, 197, 94] : s === "amarillo" ? [234, 179, 8] : s === "naranja" ? [249, 115, 22] : [239, 68, 68];

export function descargarReporteSalud(salud: SaludFiscal) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, 90, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Dashboard de Salud Fiscal", 40, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("Reporte Ejecutivo · ContaClick IA", 40, 60);
  doc.setFontSize(9);
  doc.setTextColor(186, 200, 220);
  doc.text(`Generado ${new Date().toLocaleString("es-MX")}`, 40, 78);

  let y = 110;
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(salud.cliente.razon_social, 40, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80, 90, 110);
  doc.text(`RFC: ${salud.cliente.rfc}   ·   Periodo: ${salud.periodo}`, 40, y + 14);
  y += 36;

  // Score card
  const [r, g, b] = semColor(salud.semaforo);
  doc.setFillColor(r, g, b);
  doc.roundedRect(40, y, 180, 90, 8, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(36);
  doc.text(`${salud.score}`, 60, y + 50);
  doc.setFontSize(14);
  doc.text("/100", 130, y + 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Semáforo: ${salud.semaforo.toUpperCase()}`, 60, y + 70);
  doc.text(`Variación: ${salud.variacion_mes >= 0 ? "+" : ""}${salud.variacion_mes}`, 60, y + 84);

  // Subscores tabla
  autoTable(doc, {
    startY: y,
    margin: { left: 240, right: 40 },
    head: [["Área", "Score", "Peso"]],
    body: salud.subscores.map((s) => [s.label, `${s.score}/100`, `${s.peso}%`]),
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [30, 41, 59] },
  });

  y = (doc as any).lastAutoTable.finalY + 24;

  // Comparativo
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Comparativo mes actual vs anterior", 40, y);
  y += 8;
  const c = salud.comparativo;
  autoTable(doc, {
    startY: y,
    head: [["Concepto", "Actual", "Anterior", "Δ"]],
    body: [
      ["Ingresos", fmtMXN(c.ingresos.actual), fmtMXN(c.ingresos.anterior), fmtMXN(c.ingresos.actual - c.ingresos.anterior)],
      ["Egresos", fmtMXN(c.egresos.actual), fmtMXN(c.egresos.anterior), fmtMXN(c.egresos.actual - c.egresos.anterior)],
      ["Utilidad", fmtMXN(c.utilidad.actual), fmtMXN(c.utilidad.anterior), fmtMXN(c.utilidad.actual - c.utilidad.anterior)],
      ["ISR estimado", fmtMXN(c.isr_estimado.actual), fmtMXN(c.isr_estimado.anterior), fmtMXN(c.isr_estimado.actual - c.isr_estimado.anterior)],
      ["IVA trasladado", fmtMXN(c.iva_trasladado.actual), fmtMXN(c.iva_trasladado.anterior), fmtMXN(c.iva_trasladado.actual - c.iva_trasladado.anterior)],
      ["IVA acreditable", fmtMXN(c.iva_acreditable.actual), fmtMXN(c.iva_acreditable.anterior), fmtMXN(c.iva_acreditable.actual - c.iva_acreditable.anterior)],
      ["Margen %", `${c.margen_pct.actual.toFixed(1)}%`, `${c.margen_pct.anterior.toFixed(1)}%`, `${(c.margen_pct.actual - c.margen_pct.anterior).toFixed(1)} pp`],
    ],
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [30, 41, 59] },
  });
  y = (doc as any).lastAutoTable.finalY + 20;

  if (salud.alertas.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Alertas e incidencias", 40, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      head: [["Nivel", "Título", "Origen"]],
      body: salud.alertas.map((a) => [a.nivel.toUpperCase(), a.titulo, a.origen ?? "—"]),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [30, 41, 59] },
    });
    y = (doc as any).lastAutoTable.finalY + 20;
  }

  if (salud.hallazgos.length) {
    if (y > 700) { doc.addPage(); y = 60; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Hallazgos", 40, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      head: [["Tipo", "Hallazgo", "Detalle"]],
      body: salud.hallazgos.map((h) => [h.tipo, h.titulo, h.detalle]),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [30, 41, 59] },
      columnStyles: { 2: { cellWidth: 250 } },
    });
    y = (doc as any).lastAutoTable.finalY + 20;
  }

  if (salud.recomendaciones.length) {
    if (y > 700) { doc.addPage(); y = 60; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Recomendaciones accionables", 40, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      head: [["Acción", "Recomendación", "Detalle"]],
      body: salud.recomendaciones.map((r) => [r.accion.replace(/_/g, " "), r.titulo, r.detalle]),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [30, 41, 59] },
      columnStyles: { 2: { cellWidth: 250 } },
    });
  }

  doc.save(`salud-fiscal-${salud.cliente.rfc}-${salud.periodo}.pdf`);
}
