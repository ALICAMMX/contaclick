
# Plan de integración — Mejoras UX/UI sin romper diseño

Aprovecharé todo lo que ya existe: `AppLayout` (header sticky), `Tour.tsx`, tablas `alertas`, `tool_runs`, `audit_logs`, `semaforo_fiscal`, `obligaciones_fiscales`, `despachos.trial_ends_at`, `cuentas_bancarias`, `conciliaciones`. Cero cambios al sistema de diseño (tokens, tipografía, paleta) y cero cambios al esquema fiscal existente.

El **#6 (descarga CFDI vía e.firma)** se excluye: requiere manejar la FIEL (archivos .cer/.key + contraseña), firmar mensajes XML, llamar SOAP del SAT, jobs programados, almacenamiento cifrado y disclaimers legales. Es un proyecto dedicado; lo planeamos aparte cuando quieras.

---

## Fase 1 — Quick wins de UI (1, 2, 3, 9)

Todo frontend; sin migraciones. Sólo lecturas a tablas existentes.

### 1. Onboarding overlay al primer login
- Reutilizar `Tour.tsx` (ya define 6 pasos).
- En `AppLayout.tsx`, al montar comprobar `localStorage["cc.tour.seen.v1"]` y `user.created_at` del último día. Si es nuevo y no lo ha visto, abrir `<Tour open />` automáticamente.
- Mantener el botón manual en Configuración.
- Cambio mínimo: 1 `useEffect` + flag.

### 2. Centro de notificaciones (campana en header)
- Componente nuevo `src/components/NotificationsBell.tsx` colocado en el header de `AppLayout` antes de `ThemeToggle`.
- Server fn nueva `src/lib/alertas/alertas.functions.ts` con `requireSupabaseAuth`:
  - `listAlertas({ limit: 20 })` → `select * from alertas where despacho_id = ... and estatus = 'abierta' order by created_at desc`.
  - `marcarLeida(id)` → `update alertas set estatus='leida', resuelta_por=auth.uid(), resuelta_at=now()`.
- UI: ícono `Bell` con badge numérico (cuenta abiertas), popover (`@/components/ui/popover` ya existe en shadcn) con lista compacta: nivel (color), título, fecha relativa, link al cliente.
- Polling cada 60s con `useQuery({ refetchInterval })`.
- Diseño: hereda colores del header, badge con `bg-destructive` para `nivel='alto'`.

### 3. Búsqueda global (⌘K / Ctrl+K)
- Componente nuevo `src/components/CommandPalette.tsx` usando `@/components/ui/command` (cmdk, ya viene con shadcn).
- Catálogo estático: lista de las 22 herramientas + módulos + expedientes (estos últimos cargados con un query ligero a `clientes`).
- Atajo global: `useEffect` con listener `keydown` para `⌘K`/`Ctrl+K`.
- Trigger visual en el header: input fantasma `Buscar herramientas… ⌘K` (estilo Linear), oculto en móvil.
- Al seleccionar, `navigate({ to })`.

### 9. Banner de estado del trial
- Componente nuevo `src/components/TrialBanner.tsx` montado en `AppLayout` justo bajo el header.
- Lee `despacho.estado` y `despacho.trial_ends_at` desde `useDespacho()` (ya existe).
- Mostrar sólo si `estado === 'trial'` y faltan ≤ 7 días o ya expiró:
  - Banner suave (`bg-warning/5 border-warning/30`) con copy + CTA "Ver planes" → `/app/configuracion`.
  - Dismiss persistido por sesión (`sessionStorage`) para no molestar en cada navegación.
- Si `trial_ends_at < now()` → variante `bg-destructive/5` y no se puede ocultar.

**Archivos Fase 1:**
- `src/components/AppLayout.tsx` (slot para campana, búsqueda y banner; useEffect del tour)
- `src/components/NotificationsBell.tsx` (nuevo)
- `src/components/CommandPalette.tsx` (nuevo)
- `src/components/TrialBanner.tsx` (nuevo)
- `src/lib/alertas/alertas.functions.ts` (nuevo)

---

## Fase 2 — Dashboard del despacho e historial (4, 5)

### 4. Dashboard unificado del despacho
- Ruta nueva `src/routes/app.despacho.tsx` (entrada en sidebar/home como "Panel del despacho").
- Server fn `getPanelDespacho()` (con `requireSupabaseAuth`) que devuelve por cliente activo:
  - Datos base de `clientes`.
  - Último color de `semaforo_fiscal` (LEFT JOIN del periodo más reciente).
  - Próximas obligaciones de `obligaciones_fiscales` (`proximo_vencimiento` en los próximos 30 días, `estatus='pendiente'`).
  - Conteo de CFDI emitidos/recibidos del mes desde `cfdi_xml`.
  - Conteo de alertas abiertas por cliente.
- UI: tabla densa con columnas: Cliente · RFC · Semáforo (chip color) · Vencimiento próximo · CFDI mes · Alertas. Filtros por color de semáforo. Click en fila → expediente. Mismo patrón visual que `app.clientes.tsx`.
- Link agregado en `app.index.tsx` (tarjeta destacada arriba) y en breadcrumb LABELS.

### 5. Historial de acciones por expediente
- En `src/routes/app.clientes.$id.tsx`, agregar pestaña/sección "Historial":
  - Server fn `getHistorialCliente({ cliente_id, limit })` que une `tool_runs` (filtrado por `cliente_id`) y `audit_logs` (eventos relevantes del expediente), ordenado por fecha.
  - Render como timeline: icono según `tool_key`, hora relativa, usuario, resumen del `input/output` (solo campos legibles).
  - Filtro por tipo de herramienta y rango de fechas.
- Sin nuevas tablas (todo ya existe).

**Archivos Fase 2:**
- `src/routes/app.despacho.tsx` (nuevo)
- `src/lib/despacho/panel.functions.ts` (nuevo)
- `src/lib/clientes/historial.functions.ts` (nuevo)
- `src/routes/app.clientes.$id.tsx` (sección Historial)
- `src/routes/app.index.tsx` (CTA al panel)
- `src/components/AppLayout.tsx` (LABELS: `despacho: "Panel del despacho"`)

---

## Fase 3 — Mejoras a herramientas fiscales (7, 8, 10)

### 7. Calculadora ISR/IVA para Personas Morales (Régimen 601)
- Ruta nueva `src/routes/app.tools.isr-iva-pm.tsx` espejando el patrón de `isr-iva-calculator.tsx` (mismo `ToolShell`, mismos inputs).
- Lógica PM: ISR a tasa fija 30 % sobre utilidad fiscal (ingresos acumulables − deducciones autorizadas − PTU − pérdidas), pago provisional con coeficiente de utilidad. IVA igual que PF (trasladado vs acreditable).
- Inputs adicionales: coeficiente de utilidad, PTU pagada, pérdidas amortizables.
- Importar resumen del mes con la misma `getResumenFiscalMes`.
- Aviso visible: "Cálculo orientativo. El contador debe validar coeficiente y pérdidas vigentes."
- Registrar entrada en `tool_runs` (`tool_key='isr-iva-pm'`).
- Sumar a tarjetas en `app.tools.index.tsx`, `app.contable.herramientas.tsx`, contadores del home (actualizar el "X en vivo").

### 8. Exportación a Excel en herramientas clave
- Helper compartido `src/lib/export/xlsx.ts` usando `xlsx` (SheetJS, ya disponible o `bun add xlsx`).
- API mínima: `exportToXlsx(filename, sheets: { name, rows: object[] }[])`.
- Botones "Exportar a Excel" agregados con el mismo estilo `Button variant="outline"` ya usado en reportes en:
  - `app.riesgo.tsx` (resultado del cálculo de riesgo).
  - `app.tools.express-auditor.tsx` (los 12 criterios).
  - `app.conciliacion.index.tsx` (movimientos + matches).
- Sin tocar la lógica de cálculo; sólo serialización de los datos ya renderizados.

### 10. Multi-cuenta bancaria por expediente
- El esquema ya soporta varias cuentas (`cuentas_bancarias` con FK a `cliente`); el bloqueo está sólo en la UI.
- En `app.conciliacion.index.tsx`:
  - Cargar todas las cuentas del cliente activo.
  - Selector de cuenta (`Tabs` o `Select`) arriba de la tabla; "Todas" como opción.
  - Filtrar `movimientos_bancarios` por `cuenta_id` seleccionada.
  - Al importar estado de cuenta, asociar al `cuenta_id` elegido (o crear cuenta nueva con modal: banco, alias, últimos 4 dígitos).
- Pantalla simple de gestión de cuentas en `src/routes/app.clientes.$id.tsx` (sección "Cuentas bancarias"): CRUD básico vía server fns nuevas (`listCuentas`, `crearCuenta`, `eliminarCuenta`).
- En `app.conciliacion.historial.tsx`, mostrar `cuenta.alias` en cada fila.

**Archivos Fase 3:**
- `src/routes/app.tools.isr-iva-pm.tsx` (nuevo)
- `src/lib/export/xlsx.ts` (nuevo) + `bun add xlsx` si falta
- `src/routes/app.riesgo.tsx`, `app.tools.express-auditor.tsx`, `app.conciliacion.index.tsx` (botón export + selector cuenta)
- `src/routes/app.clientes.$id.tsx` (sección cuentas)
- `src/lib/cuentas/cuentas.functions.ts` (nuevo)
- `src/routes/app.tools.index.tsx`, `app.contable.herramientas.tsx`, `app.contable.index.tsx`, `app.index.tsx` (contadores y tarjeta de la nueva calculadora)

---

## Orden de entrega sugerido

1. **Fase 1** primero (impacto alto, riesgo bajo, no toca lógica fiscal).
2. **Fase 3** después (valor para el contador, cambios localizados por herramienta).
3. **Fase 2** al final (es la más nueva en superficie y conviene tener ya el centro de notificaciones y la búsqueda para enlazar desde la tabla).

## Riesgos y mitigaciones

- **Header saturado**: la búsqueda en desktop es un input compacto (≈220px); en móvil queda sólo el ícono lupa. Campana + tema + avatar caben sin reflow.
- **Polling de alertas**: 60s con `staleTime: 30s` para no presionar la BD.
- **Tour automático**: sólo si `created_at` del user es del día actual, evitamos abrirlo a usuarios viejos por error.
- **Export Excel**: `xlsx` pesa ~400KB; lo importamos dinámicamente (`await import('xlsx')`) sólo al hacer click, no afecta bundle inicial.
- **Multi-cuenta**: requiere migrar UI sin perder conciliaciones existentes; el `cuenta_id` ya está en `movimientos_bancarios`, así que es retrocompatible.

## Nota sobre #6 (CFDI masivo del SAT)

Si quieres avanzarlo, lo trato como proyecto aparte: necesito antes que decidas (a) si los usuarios subirán FIEL o si usaremos un proveedor tercero tipo Facturama/SW Sapien, (b) dónde almacenamos los .cer/.key cifrados, y (c) frecuencia de descarga. Dímelo y armo un plan dedicado.
