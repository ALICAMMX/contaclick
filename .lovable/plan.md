# Justificación legal y motivo en cada alerta

Hoy las herramientas muestran hallazgos en rojo / ámbar / verde pero sin explicar **por qué** ese color ni en qué **artículo/regla** del SAT se basan. Vamos a estandarizar esto en toda la plataforma.

## Qué cambia para el usuario

Cada hallazgo (en CFDI, Auditor Express, Nómina Oculta, Deducibilidad, Precios de Importación, etc.) mostrará tres cosas nuevas, siempre visibles:

1. **Motivo del color** — frase corta del tipo *"Rojo porque el SAT puede rechazar la deducción y multar (~$400–$600 por CFDI)"*.
2. **Fundamento legal** — artículo y ley vigente: *"Art. 29-A fracc. VII inciso b) CFF · RMF 2026 regla 2.7.1.32"*, con la fecha en que se verificó la vigencia.
3. **Qué hacer** — acción concreta (emitir REP, cancelar con motivo 02, etc.).

Ejemplo visual en cada finding:

```text
🔴 PPD sin Complemento de Pago timbrado
   Por qué rojo: El SAT considera el ingreso no acumulado y aplica multa
                 de $400–$600 por CFDI (Art. 81-82 CFF).
   Fundamento:  Art. 29-A CFF · RMF 2026 regla 2.7.1.32 · Guía REP SAT v3.3
   Acción:      Emite el Complemento de Pago dentro de los 5 días naturales
                del mes siguiente al cobro.
```

## Alcance (qué herramientas se actualizan)

- Lector / Validador CFDI (`risk.ts` + `app.cfdi.$id.tsx`)
- Auditor Express (`auditor.functions.ts` + `app.tools.express-auditor.tsx`)
- Nómina Oculta (`nomina-oculta.functions.ts` + `app.tools.shadow-payroll.tsx`)
- Deducibilidad (`deducibilidad.functions.ts` + `app.tools.deducibility-checker.tsx`)
- Precios de Importación (`precios-importacion.functions.ts` + `app.tools.import-prices.tsx`)
- Agentes Auditor y CFDI (heredan del mismo modelo)

## Detalles técnicos

1. **Extender el tipo `RiskFinding`** en `src/lib/cfdi/risk.ts`:
   ```ts
   type RiskFinding = {
     code: string;
     level: "bajo" | "medio" | "alto";
     message: string;
     why: string;           // por qué este color
     legal: LegalRef[];     // fundamentos
     action?: string;       // qué hacer
   };
   type LegalRef = {
     ley: "CFF" | "LISR" | "LIVA" | "RMF" | "CFDI" | "Guía SAT";
     cita: string;          // "Art. 29-A fracc. VII"
     vigencia: string;      // "2026"
     url?: string;          // link oficial cuando exista
   };
   ```

2. **Catálogo central de referencias** en nuevo archivo `src/lib/legal/referencias.ts` (single source of truth, con la fecha de última revisión). Esto evita que cada regla repita texto legal y permite actualizar la legislación en un solo lugar cuando cambia la RMF.

3. **Mismo patrón** para los demás módulos: cada función que produce hallazgos (`buildAuditoria`, `detectNominaOculta`, `evaluarDeducibilidad`, `analizarPreciosImportacion`) devuelve findings con `why` + `legal` + `action`.

4. **Componente `<FindingCard />`** reutilizable que renderiza: badge de color, mensaje, panel colapsable "¿Por qué este color?" y chips con cada referencia legal (clickeables al DOF/SAT cuando hay URL).

5. **Semáforo justificado a nivel reporte**: el resumen general (ej. "Riesgo Alto") también explica *"Alto porque hay 3 hallazgos rojos con fundamento en Art. X CFF"*.

## Consideraciones

- **Vigencia**: el catálogo legal lleva campo `vigencia` y una constante `LEGISLACION_VERIFICADA_AL = "2026-06-22"` visible en el pie de cada reporte, para que el contador sepa con qué versión de la ley se evaluó.
- **No cambia la lógica de detección**, solo enriquece la salida. Las reglas que ya existen siguen disparándose igual.
- **Exportaciones (CSV/Excel/PDF)**: se añaden columnas "Motivo" y "Fundamento" para que el contador pueda entregar el reporte al cliente con sustento legal.

## Fuera de alcance

- Validador en línea contra la base oficial del SAT (eso requiere conexión SAT, lo dejamos para cuando esté la descarga masiva).
- Re-clasificación de niveles existentes (rojo/ámbar/verde se mantienen como están hoy; solo se justifican).

¿Procedo así o quieres que arranque solo por una herramienta (ej. CFDI) como piloto antes de propagarlo?
