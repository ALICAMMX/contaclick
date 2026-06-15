// Lista DEMO 69-B EFOS — datos de muestra para el MVP.
// La integración real con el archivo oficial del SAT
// (http://omawww.sat.gob.mx/cifras_sat/Paginas/datos/vinculo.html?page=ListCompleta69B.html)
// se conecta vía cron/edge fn y reemplaza esta semilla.
//
// Situación posible:
//   - "definitivo"          : presunción confirmada, deducciones improcedentes
//   - "presunto"            : presunto, plazo de defensa abierto
//   - "desvirtuado"         : desvirtuó la presunción
//   - "sentencia_favorable" : sentencia favorable al contribuyente
//   - "cancelado"           : eliminado del listado

export type EfosSituacion =
  | "definitivo"
  | "presunto"
  | "desvirtuado"
  | "sentencia_favorable"
  | "cancelado";

export type EfosRecord = {
  rfc: string;
  nombre: string;
  situacion: EfosSituacion;
  publicacion_dof: string; // YYYY-MM-DD
  oficio?: string;
};

export const EFOS_DEMO: EfosRecord[] = [
  { rfc: "ABC120101AB1", nombre: "Servicios Integrales Apolo SA de CV", situacion: "definitivo", publicacion_dof: "2024-03-15", oficio: "500-05-2024-1234" },
  { rfc: "FAC150620XY9", nombre: "Facturación Express del Bajío SA de CV", situacion: "definitivo", publicacion_dof: "2024-08-02", oficio: "500-05-2024-5678" },
  { rfc: "COM180214J45", nombre: "Comercializadora Triángulo Norte SA de CV", situacion: "definitivo", publicacion_dof: "2025-01-22" },
  { rfc: "SOL200115QW8", nombre: "Soluciones Operativas del Pacífico SA de CV", situacion: "presunto", publicacion_dof: "2026-02-10" },
  { rfc: "GIN170503MN3", nombre: "Grupo Industrial Nueva Era SAPI de CV", situacion: "presunto", publicacion_dof: "2026-04-05" },
  { rfc: "TRA160812LK4", nombre: "Transportes y Logística Aurora SA de CV", situacion: "definitivo", publicacion_dof: "2023-11-30" },
  { rfc: "ASE190228TR6", nombre: "Asesores Estratégicos Mexicanos SC", situacion: "desvirtuado", publicacion_dof: "2024-06-18" },
  { rfc: "CON210907YH2", nombre: "Constructora del Norte Río Bravo SA de CV", situacion: "definitivo", publicacion_dof: "2025-05-14" },
  { rfc: "MAR140422PL5", nombre: "Marketing Digital Latino SA de CV", situacion: "sentencia_favorable", publicacion_dof: "2025-09-01" },
  { rfc: "DIS220301BN7", nombre: "Distribuidora Mercantil Centro SA de CV", situacion: "definitivo", publicacion_dof: "2026-01-12" },
  { rfc: "INM180605CV4", nombre: "Inmobiliaria Costa Verde SA de CV", situacion: "presunto", publicacion_dof: "2026-05-20" },
  { rfc: "PRO150311ZX8", nombre: "Promotora de Negocios del Sureste SA de CV", situacion: "cancelado", publicacion_dof: "2022-07-05" },
];

const INDEX = new Map(EFOS_DEMO.map((r) => [r.rfc.toUpperCase(), r] as const));

export function lookupEfos(rfc: string): EfosRecord | null {
  return INDEX.get(rfc.trim().toUpperCase()) ?? null;
}

export function efosBatch(rfcs: string[]): EfosRecord[] {
  const seen = new Set<string>();
  const out: EfosRecord[] = [];
  for (const r of rfcs) {
    const hit = lookupEfos(r);
    if (hit && !seen.has(hit.rfc)) {
      seen.add(hit.rfc);
      out.push(hit);
    }
  }
  return out;
}

export const EFOS_META = {
  fuente: "Lista demo. Sustituir por sincronización oficial 69-B SAT.",
  total_registros: EFOS_DEMO.length,
  actualizado_al: "2026-06-15",
};
