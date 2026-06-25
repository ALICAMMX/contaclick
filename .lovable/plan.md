## Respuesta corta
Sí, es técnicamente viable y ya tenemos ~70% de la infraestructura. Lo que falta es el "puente" entre los XML descargados y las pólizas contables.

## Lo que YA existe hoy
- **Descarga automática SAT** (`src/lib/sat/sat-sync.functions.ts` + cron `api/public/hooks/sat-sync`): baja CFDI emitidos/recibidos diario por cliente con credenciales guardadas.
- **CFDI parser** (`src/lib/tools/cfdi-parser.ts`): extrae UUID, fecha, emisor, receptor, total, impuestos, conceptos.
- **Tabla `polizas`** + módulo manual/CSV (`src/routes/app.polizas.tsx`).
- **Motor de conciliación** que ya cruza CFDI vs pólizas vs banco.

## Lo que hay que construir: "Contabilidad Automática"

### 1. Motor de contabilización automática (nuevo)
`src/lib/contabilidad-auto/contabilizar.functions.ts`
- Input: CFDI descargado del SAT (ya en `cfdi_xml`).
- Output: póliza generada en `polizas` con asientos sugeridos.
- Reglas base:
  - CFDI **emitido tipo I** → Póliza de Ingreso (Clientes / Ventas / IVA trasladado).
  - CFDI **recibido tipo I** → Póliza de Egreso o Compra (Gasto/Inventario / IVA acreditable / Proveedores).
  - CFDI **tipo P (pago)** → Póliza de Diario (Bancos / Clientes o Proveedores / IVA cobrado-pagado).
  - CFDI **tipo N (nómina)** → Póliza de Diario (Sueldos / ISR retenido / IMSS / Bancos).
  - CFDI **tipo E (egreso/nota crédito)** → Póliza inversa.

### 2. Catálogo de cuentas por cliente
Nueva tabla `catalogo_cuentas` (cliente_id, codigo, nombre, naturaleza, tipo_sat) + seed con catálogo SAT estándar agrupador. Permite que cada despacho ajuste cuentas.

### 3. Reglas de mapeo configurable
Nueva tabla `reglas_contables` (cliente_id, condicion JSON, cuenta_cargo, cuenta_abono, prioridad). Ejemplo: "uso CFDI = G03 + clave SAT 78101800 → cuenta 601-01 Combustibles".

### 4. Pipeline automático
Extender el cron `sat-sync` para que tras descargar:
1. Parsee cada CFDI nuevo.
2. Aplique reglas y genere póliza con `origen='auto_sat'` y `estado='borrador'`.
3. Marque para revisión humana las que no machearon ninguna regla.

### 5. UI de revisión
`src/routes/app.contabilidad-auto.tsx`:
- Bandeja de pólizas autogeneradas pendientes de aprobar.
- Edición rápida de asiento + botón "aprobar" (cambia a `estado='confirmada'`).
- "Aprender de esta corrección" → crea regla automática.

### 6. Exportación
- Reutilizar `src/lib/reportes/excel.ts` para exportar pólizas en formato XML SAT contabilidad electrónica (Anexo 24) o CSV para CONTPAQi/Aspel.

## Limitaciones honestas
- **No reemplaza al contador**: clasificación automática acierta ~70–85% en gastos comunes; el resto requiere criterio humano (deducibilidad, prorrateos, activo vs gasto).
- **Bancos**: el cruce contra movimientos bancarios sigue requiriendo subir estado de cuenta (ya soportado en conciliación).
- **Nómina y provisiones**: las pólizas de ajuste mensual (depreciaciones, devengados) seguirán siendo manuales o vía plantillas.
- **Costo PAC**: cada descarga consume cuota SAT/PAC ya controlada por `sat-quota.ts`.

## Orden sugerido de implementación
1. Catálogo de cuentas + seed SAT (1 migración).
2. Motor de contabilización con reglas hardcoded para los 4 tipos de CFDI.
3. Hook al cron sat-sync para generar pólizas borrador.
4. UI bandeja de revisión/aprobación.
5. Reglas configurables + "aprender de correcciones".
6. Export Anexo 24 / CONTPAQi.

## Pregunta antes de avanzar
¿Empezamos por las **fases 1–3** (motor + generación automática de borradores)? Esto ya te daría el "elabora la contabilidad" para el 70% de los casos. Fases 4–6 las afinamos después con usuarios reales.
