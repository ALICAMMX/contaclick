// Regresión de interfaz: la pestaña Actividad de /app/sat-sync debe exponer
// SIEMPRE una columna "Acciones" con un botón "Ver detalle" que reciba el
// run_id y abra el detalle ya existente. Estas pruebas fallan si alguien
// elimina el botón, la columna o el cableado del run_id.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ruta = resolve(process.cwd(), "src/routes/app.sat-sync.tsx");
const fuente = readFileSync(ruta, "utf8");
const actividad = fuente.slice(
  fuente.indexOf("function ActividadTab"),
  fuente.indexOf("function NovedadesTab"),
);

describe("Actividad · acciones por corrida", () => {
  it("declara la columna Acciones", () => {
    expect(actividad).toContain(">Acciones<");
  });

  it("renderiza un botón Ver detalle identificable", () => {
    expect(actividad).toContain('data-testid="ver-detalle"');
    expect(actividad).toContain("Ver detalle");
  });

  it("pasa el run_id de la fila al detalle", () => {
    expect(actividad).toContain('data-run-id={r.id}');
    expect(actividad).toMatch(/setDetalleId\(r\.id\)/);
  });

  it("usa el detalle ya implementado, no uno nuevo", () => {
    expect(actividad).toContain("<CorridaDetalleDialog");
    expect(fuente.split("CorridaDetalleDialog runId=").length - 1).toBeGreaterThanOrEqual(2);
    expect(fuente).toContain('from "@/components/sat/CorridaDetalle"');
  });

  it("es accesible con teclado y la fila completa también abre", () => {
    expect(actividad).toContain("onKeyDown");
    expect(actividad).toContain('role="button"');
    expect(actividad).toContain("tabIndex={0}");
  });

  it("no condiciona la acción al estado de la corrida", () => {
    const botón = actividad.slice(actividad.indexOf('data-testid="ver-detalle"'));
    expect(botón.slice(0, 400)).not.toMatch(/estado\s*===/);
  });

  it("mantiene la tabla utilizable en móvil", () => {
    expect(actividad).toContain("overflow-x-auto");
  });
});
