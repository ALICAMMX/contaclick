## Objetivo

Transformar la app en una **maqueta navegable de impacto** que muestre cómo lucirá ContaClick "terminado" según el documento maestro v2, sin romper lo que ya funciona. Al entrar, el usuario debe sentir que está frente a una suite enterprise mexicana — no un MVP.

Estilo: **Navy Trust** (`#0f1b3d` base, `#1e3a5f` superficies, `#3b6fa0` acentos, `#e8edf3` foreground), tipografía editorial seria (Instrument Serif + Inter), con detalles de oro/ámbar como acento de "autoridad fiscal".

---

## 1) Nuevo shell con top tabs por módulo

Reemplazar el header actual de `AppLayout.tsx` por un shell de **dos niveles**:

- **Nivel 1 — Módulos** (tabs grandes, siempre visibles):
  - Contable-Fiscal
  - Administrativo
  - Inteligencia Legal
  - Cada tab cambia el color de acento sutilmente (azul / dorado / verde esmeralda) para reforzar identidad.
- **Nivel 2 — Nav contextual** (cambia según el módulo activo):
  - Cada módulo expone sus secciones (Dashboard, Herramientas, Agentes, Reportes, etc.) en una barra horizontal compacta debajo.
- **Side-rail derecho fijo**: selector de expediente activo + score de Riesgo SAT en mini-widget + atajo "Comando IA" (cmd+K visual, no funcional aún).

Estructura visual:

```text
┌─────────────────────────────────────────────────────────────┐
│ Logo  [ Contable-Fiscal | Administrativo | Legal ]   👤 ⚙ │
│ ── Dashboard · Herramientas · Agentes · Reportes ──────────│
└─────────────────────────────────────────────────────────────┘
```

---

## 2) Nuevo `/app` — Command Center hero

Reemplazar `app.index.tsx` por un dashboard tipo "torre de control":

- **Hero band**: Score Riesgo SAT 2026 grande (reutiliza datos reales del cálculo existente), semáforo, "12 criterios analizados", y CTA "Ver defensa →".
- **Grid de 8 agentes contables + 7 administrativos** como cards con avatar, estado (idle/working), última acción y métrica clave. La mayoría aparecen como "Standby" con datos demo.
- **3 columnas inferiores**:
  - Próximos vencimientos (DIOT, ISR, IMSS) — demo.
  - Buzón Tributario — feed simulado.
  - Flujo de caja 30 días — sparkline demo.

---

## 3) Módulo Contable-Fiscal — `/app/contable`

Tab activa por defecto. Sub-nav: **Dashboard · 12 Herramientas SAT · 8 Agentes · CFDI · Conciliación · Reportes · Riesgo**.

- **Catálogo de las 12 herramientas SAT** (cards grid): mapea las que ya existen (CFDI Validator, Verifier, Bulk Reader, ISR/IVA, RESICO, Auditor Express, Conciliador, CSF Parser, Oficio Generator, Asistente Fiscal → 10 reales) y agrega como cards "Pronto" con preview:
  - Validador de Precios de Importación
  - Detector de Nómina Oculta
  - Validador de Deducibilidad
  - Calculadora Transfer Pricing
  - Lector de Buzón Tributario
- **Vista de Agentes** (`/app/contable/agentes`): los 8 agentes del doc (CFDI, Fiscal-SAT, Conciliación, Auditor, Corporativo, Defensa, Materialidad, Cierre) como tarjetas con timeline simulado de acciones.

---

## 4) Módulo Administrativo — `/app/admin`

Sub-nav: **Dashboard · Nómina · RH · Tesorería · Activos · Inventarios · Trámites · Correspondencia**.

Crear **pantallas maqueta** (UI completa con datos demo, sin lógica real) para:

- **Nómina IA** (`/app/admin/nomina`): tabla de empleados demo, cálculo SDI/IMSS/ISR placeholder, botón "Generar prenómina con IA".
- **Cumplimiento Laboral** (`/app/admin/cumplimiento`): checklist IMSS/INFONAVIT/SAT con semáforos.
- **Activos Fijos** (`/app/admin/activos`): tabla con depreciación, MOI, fecha adquisición.
- **Inventarios** (`/app/admin/inventarios`): kardex demo derivado de CFDI.
- **Tesorería / Flujo de Caja** (`/app/admin/tesoreria`): gráfica 90 días, cuentas por cobrar/pagar.
- **Gestor de Trámites** (`/app/admin/tramites`): kanban con semáforo (verde/amarillo/rojo) por vencimiento.
- **Buzón Tributario** (`/app/admin/buzon`): feed estilo email con notificaciones SAT demo.
- **Correspondencia / Minutas** (`/app/admin/correspondencia`): generador de minutas y respuestas.

Todas comparten un componente `<ModuleScaffold>` con header consistente, badge "Demo · Próximamente funcional" y CTA "Notificarme cuando esté listo".

---

## 5) Módulo Inteligencia Legal — `/app/legal`

Sub-nav: **Lagunas Legales · TFJA/SCJN · DOF · Redactor de Escritos · Marketplace**.

- **Mapa de Lagunas Legales** (`/app/legal/lagunas`): grid de las lagunas del doc (Materialidad, Devoluciones IVA, etc.) con potencial de recuperación, % éxito TFJA, estrategia sugerida.
- **Redactor de Escritos** (`/app/legal/redactor`): wizard de 3 pasos maqueta.
- **Marketplace Legal** (`/app/legal/marketplace`): grid de despachos especializados (placeholder).

---

## 6) Sistema de diseño Navy Trust

En `src/styles.css`:

- Tokens nuevos: `--background: oklch(0.18 0.04 260)`, `--surface: oklch(0.24 0.05 260)`, `--primary: oklch(0.55 0.12 250)`, `--gold: oklch(0.78 0.13 85)`, gradientes y `--shadow-elegant`.
- Variantes nuevas de Button: `authority` (azul profundo + sombra interna), `gold` (acento dorado para acciones premium).
- Componentes nuevos:
  - `<ModuleTabs>` — top tabs grandes con indicador animado.
  - `<ContextNav>` — segunda fila de navegación.
  - `<AgentCard>` — card de agente con estado y métrica.
  - `<ToolCard>` — variante extendida con badge de estado (live / beta / soon).
  - `<ModuleScaffold>` — wrapper para vistas demo con header consistente.
- Tipografía: importar **Instrument Serif** (headings) + **Inter** (UI). Aplicar serif solo a H1/H2 de módulos.

---

## 7) Detalles técnicos

- Rutas nuevas (file-based, dots = slashes):
  - `app.contable.tsx` (layout con Outlet) + `app.contable.index.tsx` + sub-rutas.
  - `app.admin.tsx` + 8 sub-rutas demo.
  - `app.legal.tsx` + 3 sub-rutas.
- Reorganizar `app.tools.*` existentes para que sigan funcionando, pero también aparezcan listadas dentro del catálogo de Contable-Fiscal vía el registry existente (`src/lib/tools/registry.ts` extendido con `module: "contable" | "admin" | "legal"` y `status: "live" | "beta" | "soon"`).
- `AppLayout.tsx`: refactor para usar `<ModuleTabs>` + `<ContextNav>` derivado de la ruta activa.
- Mantener Riesgo SAT, CFDI, Conciliación, Reportes, Mensajes, Expedientes funcionando — solo cambian de ubicación dentro de los nuevos módulos.
- Sin cambios de backend, sin migraciones, sin nuevas server functions. Todo es UI + datos demo.

---

## 8) Resultado al final

Un usuario que entra ve:
1. Shell Navy Trust con 3 módulos arriba.
2. Command Center con score SAT real + 15 agentes demo + vencimientos.
3. Puede navegar a cualquier módulo y ver el catálogo completo de las ~25 herramientas del documento — unas funcionan (las actuales), otras son maquetas creíbles con datos demo.
4. Sensación clara de "esta plataforma ya existe completa, solo falta encender algunos módulos".

Estimado: **maqueta visual completa, 0 cambios de backend**. Lo que ya es funcional sigue siendo funcional dentro de la nueva navegación.