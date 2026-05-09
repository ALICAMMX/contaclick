
# Rediseño: ContaClick IA como Suite de Herramientas

Vamos a abandonar el patrón "dashboard con KPIs" y reemplazarlo por una **suite de herramientas independientes**, cada una funcionando como una mini-app especializada que opera sobre un **expediente/cliente (RFC)**.

## Concepto general

```text
[ Mis Clientes / Expedientes ]   ──►   [ Hub de Herramientas ]   ──►   [ Herramienta X ejecutándose sobre RFC Y ]
        (lista por RFC)                  (catálogo tipo grid)              (UI dedicada, autónoma)
```

- El usuario NO ve gráficas ni un panel central.
- Crea o selecciona un **expediente** (RFC + datos del cliente).
- Entra al **catálogo de herramientas** (estilo AbogaClick / Notion templates).
- Cada herramienta es **autónoma**: entra, hace una tarea concreta, devuelve resultado, se sale.

## 1. Modelo de datos (mínimo)

Tabla `clientes` (ya existe) la usamos como **expediente**:
- `rfc`, `razon_social`, `regimen_fiscal`, datos de contacto.

Nueva tabla `tool_runs` (historial de ejecuciones por herramienta y por cliente):
- `cliente_id`, `tool_key` (ej: `cfdi_validator`, `iva_calculator`), `input` (jsonb), `output` (jsonb), `status`, `created_at`.

Esto permite que cada herramienta:
- Guarde su entrada/salida ligada al RFC.
- Permita ver historial por cliente sin acoplarse a otras herramientas.

## 2. Nueva navegación

Reemplazamos el sidebar actual por dos secciones simples:

- **Expedientes** (`/app/clientes`) — alta de cliente con RFC, lista, búsqueda.
- **Herramientas** (`/app/tools`) — catálogo en grid de todas las herramientas.

Y un selector global de "Cliente activo" en el header (como un workspace switcher). Toda herramienta se ejecuta en el contexto del cliente activo. Si no hay cliente activo, la herramienta pide elegir uno antes de abrirse.

```text
/app/clientes                       Lista expedientes
/app/clientes/nuevo                 Alta (RFC + razón social + régimen)
/app/clientes/$rfc                  Ficha del expediente + historial de tool_runs
/app/tools                          Catálogo de herramientas
/app/tools/$toolKey                 Herramienta autónoma (recibe cliente activo)
```

## 3. Catálogo de herramientas (MVP)

Cada una es una **página independiente, autocontenida**, sin depender de las otras. Estilo "una pantalla, una tarea":

1. **Validador CFDI** — sube XML, valida estructura 4.0, RFC emisor/receptor, totales, UUID. Output limpio.
2. **Lector masivo de XML** — sube ZIP del SAT, extrae tabla (UUID, fecha, RFC, subtotal, IVA, total).
3. **Calculadora ISR / IVA mensual** — inputs manuales o desde XML del cliente, devuelve cálculo.
4. **Calculadora RESICO** — específica para personas físicas RESICO.
5. **Conciliador bancario** — sube estado de cuenta + CFDI, cruza.
6. **Constancia de Situación Fiscal (parser)** — sube PDF de la constancia, extrae régimen, obligaciones, domicilio.
7. **Generador de carta/oficio fiscal** — plantillas (aviso al SAT, respuesta a invitación) con datos del RFC.
8. **Verificador de CFDI ante SAT** — valida UUID contra el formato y estatus reportado.
9. **Auditor express** — sube CFDI emitidos del mes, detecta huecos, duplicados, NC sin relación.
10. **Asistente fiscal IA** (caja de chat aislada, no agente coordinador) — pregunta puntual sobre la legislación. Recibe el RFC y régimen como contexto.

Cada herramienta vive en `src/routes/app/tools/<tool>.tsx` y NO se comunica con otras herramientas. Pueden compartir helpers (parser XML, etc.) en `src/lib/tools/`.

## 4. UX por herramienta (patrón uniforme)

Todas las herramientas siguen la misma plantilla visual:

```text
┌─────────────────────────────────────────────────────┐
│  ← Volver a herramientas      Cliente activo: RFC   │
├─────────────────────────────────────────────────────┤
│  Título de la herramienta                           │
│  Descripción de 1 línea                             │
│                                                     │
│  [ Zona de input: subir, llenar, pegar ]            │
│                                                     │
│  [ Botón: Ejecutar ]                                │
├─────────────────────────────────────────────────────┤
│  Resultado (tabla / JSON / PDF / texto)             │
│  [ Descargar ]   [ Guardar en expediente ]          │
└─────────────────────────────────────────────────────┘
```

Esto da consistencia visual sin sentirse "dashboard".

## 5. Pasos de implementación

1. **Reestructurar rutas**: eliminar `dashboard.index.tsx` (KPIs/gráficas), crear `/app` como shell mínimo con header (logo + selector de cliente activo + logout).
2. **Expedientes funcionales**: conectar `clientes` real a Supabase (alta, lista, búsqueda por RFC). Cliente activo se guarda en `localStorage` + contexto React.
3. **Crear `/app/tools` (catálogo)**: grid de cards con icono, nombre, descripción, etiqueta de categoría (CFDI, Cálculo, Documentos, IA).
4. **Migración de las pantallas actuales**:
   - `dashboard.cfdi` → `app/tools/cfdi-validator` y `app/tools/xml-bulk-reader` (separar en 2).
   - `dashboard.conciliador` → `app/tools/bank-reconciler`.
   - `dashboard.auditor` → `app/tools/express-auditor`.
   - `dashboard.asistente` → `app/tools/fiscal-assistant` (sigue usando Lovable AI, pero como herramienta única, no como "asistente global").
   - `dashboard.reportes` → eliminar o mover a "exportar historial del expediente".
5. **Crear tabla `tool_runs`** con RLS por user_id; cada herramienta guarda su corrida.
6. **Nuevas herramientas (esqueletos primero)**: Calculadora ISR/IVA, RESICO, Constancia, Generador de oficios, Verificador CFDI. UI lista, lógica iterativa después.
7. **Borrar el dashboard de KPIs** y los componentes de gráficas (Recharts puede quedarse para reportes futuros, no lo desinstalamos).

## 6. Detalles técnicos (para revisión)

- Cliente activo: `ActiveClienteProvider` en `src/lib/active-cliente.tsx`, persistencia en `localStorage`, expone `{ cliente, setCliente }`.
- Server functions por herramienta: `src/lib/tools/<tool>.functions.ts` con `createServerFn` + `requireSupabaseAuth`. Cada una recibe `{ clienteId, input }` y devuelve `output`.
- Parser XML CFDI: `src/lib/tools/cfdi-parser.ts` (puro JS, sin dependencias nativas, compatible con Worker).
- Catálogo: declarado en `src/lib/tools/registry.ts` (`{ key, name, description, icon, category, route }`) — fuente única para el grid y para futuros buscadores.

## 7. Lo que queda fuera (por ahora)

- "Agentes" que coordinan herramientas → descartado por petición explícita.
- Dashboard analítico con gráficas → descartado.
- Multi-despacho / equipos → fuera del MVP, solo usuario único por ahora.

---

**¿Procedo con esta dirección?** Si confirmas, empiezo por: (a) crear el shell `/app` + selector de cliente activo, (b) catálogo `/app/tools`, (c) migrar CFDI y conciliador como primeras herramientas independientes, (d) tabla `tool_runs`. El resto de herramientas las construyo en iteraciones siguientes.
