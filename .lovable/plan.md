# Plan: Demo Showroom Completo de ContaClick

## Alcance

Sembrar en la **cuenta DEMO** (`demo@contaclick.mx`) un escenario completo con **5 expedientes diferenciados** por nivel de cumplimiento, más botones **"Cargar datos demo"** dentro de cada herramienta para que el usuario vea en vivo qué pasa con casos buenos y casos en riesgo.

---

## 1. Los 5 expedientes (perfiles diferenciados)

| # | Cliente | Régimen | Perfil | Semáforo | Score Salud |
|---|---|---|---|---|---|
| 1 | **Constructora Ejemplar SA de CV** | 601 General PM | Cumplido modelo: 100% CFDI conciliados, declaraciones al día, sin alertas | 🟢 Verde | 95/100 |
| 2 | **Ana García Rodríguez** | 626 RESICO PF | Buen contribuyente con detalles menores (1-2 CFDI sin conciliar) | 🟢 Verde | 82/100 |
| 3 | **Comercializadora Norte SA** | 601 General PM | Regular: declaración del mes pendiente, varios pagos sin complemento | 🟡 Amarillo | 65/100 |
| 4 | **Servicios López y Asociados** | 612 PF Act. Empresarial | En problemas: gastos no deducibles, nómina oculta detectada, CFDI con EFOS demo | 🟠 Naranja | 42/100 |
| 5 | **Transportes Riesgo Alto SA** | 601 General PM | Crítico: declaraciones omitidas, listas 69-B, opinión negativa, diferencias graves | 🔴 Rojo | 18/100 |

### Datos por cada cliente

- **CFDI**: 20-50 emitidos + 10-30 recibidos (CFDI 4.0 bien formados, sello dummy, marcados como demo).
- **Complementos de Pago**: 3-8 por cliente (excepto #5 que tiene faltantes intencionales).
- **Notas de crédito**: 1-3.
- **Nómina**: 1-2 CFDI (excepto #4 con "nómina oculta" detectable).
- **Movimientos bancarios**: 60-100 por cliente, distribución de match calibrada al perfil:
  - #1: 100% conciliado.
  - #2: 95% conciliado.
  - #3: 70% (huérfanos visibles).
  - #4: 50% (muchos sin CFDI).
  - #5: 30% (caos bancario).
- **Conciliación Integral**: snapshot con score histórico de 3 meses.
- **Pólizas contables**: 30-60 generadas con catálogo estándar.
- **Salud Fiscal**: snapshot con findings específicos al perfil.
- **Alertas**: niveles graduados según perfil (#1 ninguna → #5 múltiples críticas).
- **Mensajes WhatsApp/email**: hilos demo (recordatorios, reportes enviados, alertas).
- **Reportes Ejecutivos IA**: pre-generados como texto fijo (sin gastar tokens).
- **Tareas Kanban**: 3-8 por cliente.
- **CxC / CxP**: pendientes diferenciados.
- **Defensa fiscal**: #4 y #5 con casos abiertos.
- **Trámites**: 1-2 en curso por cliente.
- **Calendario**: vencimientos próximos.

---

## 2. Botones "Cargar datos demo" por herramienta

En cada herramienta principal, agregar (solo visible si el usuario es la cuenta `demo@contaclick.mx`) un botón que precarga un caso de muestra **bueno** y otro **en riesgo** para mostrar el output de la herramienta.

| Herramienta | Botón "Caso OK" | Botón "Caso en riesgo" |
|---|---|---|
| Validador CFDI | XML perfectamente válido | XML con sello inválido / RFC ajeno |
| Verificador SAT | CFDI Vigente | CFDI Cancelado |
| Validador EFOS | RFC limpio | RFC en lista 69-B demo |
| Auditor Express | Cliente #1 (todo OK) | Cliente #5 (múltiples findings) |
| Deducibilidad | Gasto deducible típico | Comida/gasolina sin requisitos |
| Conciliador Bancario | Match 100% | 40% huérfanos |
| Conciliación Integral | Score 95 | Score 22 con incidencias |
| Salud Fiscal | Cliente #1 | Cliente #5 |
| Calculadora ISR/IVA | Periodo estándar | Periodo con diferencias |
| Nómina Oculta | Sin hallazgos | Patrón sospechoso detectado |
| Lagunas Legales | Defensa sólida | Posición vulnerable |
| Importador CFDI | Lote limpio | Lote con duplicados + RFC ajeno |
| Contabilidad Auto | Genera pólizas correctas | Detecta CFDI sin clasificar |
| Reporte Ejecutivo IA | Reporte favorable | Reporte con recomendaciones urgentes |

Todos los botones llaman a un nuevo helper `loadDemoCase(toolKey, variant)` que rellena el formulario de la herramienta con datos de muestra. **Cero costo real** (no consume PAC, no llama a IA, no envía mensajes).

---

## 3. UX

- **Banner global** en la cuenta demo: "Estás en modo DEMO — todos los datos son ficticios."
- **En `/app/configuracion`** (solo cuenta demo y admin del despacho demo):
  - Botón **"Cargar showroom completo"** → siembra los 5 expedientes.
  - Botón **"Restablecer demo"** → borra y vuelve a sembrar.
- **Etiqueta visible** en cada cliente demo: badge "DEMO" junto al nombre.
- **En selector de expediente**: agrupar los 5 demo bajo la sección "Expedientes demo".

---

## 4. Detalles técnicos

### Backend
- Ampliar `src/lib/demo/demo.functions.ts`:
  - `seedDemoShowroom`: nuevo serverFn que crea los 5 clientes con sus datasets calibrados por perfil. Usa tag `__DEMO__` + `perfil:n` en `notas` para limpieza limpia.
  - `clearDemoShowroom`: reutiliza la lógica existente extendida a las tablas nuevas (pólizas, salud, defensa, tareas, cxc/cxp, trámites, reportes ejecutivos, conciliación integral).
  - `loadDemoCase({ toolKey, variant })`: devuelve payload sintético sin escribir a BD (solo para precargar la UI de la herramienta).

### Generación de XMLs ficticios
- Helper `src/lib/demo/cfdi-generator.server.ts`: template CFDI 4.0 parametrizado (Emisor/Receptor/Conceptos/Impuestos/TFD) con sello y certificado dummy claramente marcados (`SELLO_DEMO_NO_VALIDO`). UUID generado con `crypto.randomUUID()`. Hash SHA-256 real para evitar duplicados.
- Distribuciones aleatorias **deterministas** (seed por RFC) para que la demo sea reproducible.

### Restricción de acceso
- `seedDemoShowroom` valida que `auth.email() = 'demo@contaclick.mx'` **o** que el caller sea super-admin. Cualquier otro usuario recibe error.
- Los botones de "Cargar caso demo" en herramientas solo se renderizan si `useAuth().user?.email === DEMO_EMAIL`.

### Reportes pre-generados
- Texto markdown estático por perfil en `src/lib/demo/reportes-precargados.ts` para evitar llamadas reales a Gemini.

### Datos sensibles
- Todos los RFC son ficticios con patrón visible (`DEMO______`).
- Bancos: "BBVA Demo", "Banorte Demo", etc.
- Sin emails ni teléfonos reales (todos `@correo.demo` / `555-DEMO-xxx`).

### Tablas tocadas (insert-only, sin schema changes)
clientes, rfcs, cfdi_xml, cfdi_conceptos, cfdi_relaciones, cuentas_bancarias, movimientos_bancarios, conciliaciones, conciliacion_integral_runs, conciliacion_incidencias, conciliacion_score_historico, alertas, mensajes, reportes, reportes_ejecutivos, obligaciones_fiscales, tareas, polizas, catalogo_cuentas, salud_fiscal_snapshots, semaforo_fiscal, defensas, tramites, cxc, cxp, recomendaciones_ia, sat_sync_runs, sat_sync_eventos.

### Volumen estimado
~3,500-5,000 filas en total. Tiempo de carga: 10-20s. Reversible 100%.

---

## 5. Lo que NO incluye

- No timbra CFDI reales (sello dummy — el validador los marcará como "no verificable contra SAT", que es lo esperado en demo).
- No consume saldo PAC.
- No llama a APIs externas (SW Sapien, Lovable AI).
- No envía mensajes reales (WhatsApp/email quedan en estado "simulado").
- No modifica el schema de la BD.

---

## Confirmación

¿Apruebo y procedo? ¿O quieres ajustar algo (más/menos clientes, otros perfiles, distinto set de herramientas con botones demo)?