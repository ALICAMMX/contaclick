import * as XLSX from "xlsx";

export type Sheet = {
  name: string;
  rows: Array<Record<string, string | number | null | undefined>>;
};

/** Export one or more sheets to an .xlsx file and trigger a browser download. */
export function exportXlsx(filename: string, sheets: Sheet[]) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ "(sin datos)": "" }]);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31) || "Hoja1");
  }
  const safe = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, safe);
}

export function buildFilename(prefix: string, rfc?: string | null) {
  const stamp = new Date().toISOString().slice(0, 10);
  const tail = rfc ? `-${rfc}` : "";
  return `${prefix}${tail}-${stamp}.xlsx`;
}
