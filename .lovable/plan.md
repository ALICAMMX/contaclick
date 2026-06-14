
# Análisis del documento ContaClick Maestro v2.0

## Veredicto: 100% viable sobre lo que ya tenemos. NO hay que empezar de cero.

La plataforma actual ya cubre ~35–40% del documento maestro (núcleo del Módulo 1 + base de Módulo 2). El documento es una **expansión natural** de lo que ya construimos, no un proyecto distinto.

### Lo que el documento pide vs. lo que ya tenemos

| Componente del doc | Estado actual |
|---|---|
| Ingesta SAT (CIEC/e.firma) | ✅ `sat.functions.ts` |
| Validador CFDI 4.0 / UUID / 69-B | ✅ `cfdi-validator`, `cfdi-verifier`, `risk.ts` |
| Conciliador bancario (PDF+OCR) | ✅ `bank-reconciler` + `conciliacion/` |
| Calculadora ISR/IVA/RESICO | ✅ 3 calculadoras |
| Auditor / inconsistencias | ✅ `express-auditor` + reporte `xml_inconsistentes` |
| Reportes (ER, IVA, ISR, diferencias, balanza, balance, DIOT) | ✅ 8 tipos con PDF/Excel/CSV + resumen IA |
| Multi-cliente / multi-RFC / equipo / mensajes | ✅ |
| Lector CSF, Generador de oficios | ✅ |
| Asistente fiscal IA | ✅ `fiscal-assistant` |
| Validador EFOS (lista 69-B) | ⚠️ parcial (en `risk.ts`); falta sync diaria |
| 12 herramientas de defensa SAT 2026 | ⚠️ 5 de 12 hechas |
| Los 8 agentes contables orquestados | ⚠️ tenemos herramientas, falta orquestador |
| Módulo RH/Nómina/IMSS | ❌ |
| Inventarios / Activos fijos | ❌ |
| Tesorería / Flujo de caja | ❌ |
| Gestor de Trámites con semáforo | ❌ |
| Lector Buzón Tributario | ❌ |
| Transfer Pricing | ❌ |
| Agente de Lagunas Legales (5 capas) | ❌ (el gran diferenciador) |
| Marketplace de validación legal | ❌ |
| Dashboard de Riesgo SAT 0–100 | ❌ (datos sí existen, falta vista) |

**Conclusión técnica:** el stack que tenemos (TanStack Start + Lovable Cloud + AI Gateway + tabla `tool_runs`/`reportes`/`clientes`) es el correcto para todo lo que pide el doc. El documento propone Python/FastAPI/AWS, pero eso es solo una recomendación — nuestro stack actual ya está corriendo en producción y cubre el mismo caso de uso.

---

## Hoja de ruta sugerida (alineada al roadmap del doc)

### Bloque A — Cerrar MVP del doc (lo que ya casi tenemos) — **Esfuerzo bajo**
1. Dashboard de Riesgo SAT 0–100 (agrega los datos que ya calculamos)
2. Sync diaria lista 69-B EFOS + alertas en clientes
3. Completar las 12 herramientas de defensa SAT (faltan ~7)
4. Orquestador básico de los 8 agentes contables (router por intent sobre las tools que ya existen)

### Bloque B — Módulo Administrativo (parte de v1.0) — **Esfuerzo medio**
5. Gestor de Trámites con semáforo de avance + vencimientos
6. Lector de Buzón Tributario (PDF/captura → extracción + plazos)
7. Generador de Minutas con transcripción (Lovable AI multimodal)
8. Mesa de Ayuda interna (tickets)
9. Proyector de Flujo de Caja + Analizador de Gastos

### Bloque C — RH y Nómina (v2.0) — **Esfuerzo alto**
10. Calculadora de Nómina (SDI, IMSS, ISR, recibos)
11. Gestor de Cumplimiento Laboral (IMSS/INFONAVIT/SAT)
12. Detector de Nómina Oculta (cruce RFC vs IMSS)
13. Calculadora IMSS/SUA
14. Gestor de Vacaciones y Permisos

### Bloque D — Inventarios y Tesorería (v2.0–v3.0) — **Esfuerzo medio**
15. Activos fijos con depreciación + QR
16. Inventario administrativo (ingesta desde CFDI de compra)
17. Tesorería: cobranza, pagos programados, escenarios

### Bloque E — Diferenciador estratégico — **Esfuerzo muy alto**
18. Agente de Lagunas Legales (5 capas): identificación → mapeo → estrategia → redacción → monitoreo
19. Buscador TFJA/SCJN/DOF en tiempo real
20. Redactor de Escritos (recursos de revocación, juicio de nulidad)
21. Marketplace de validación legal (multi-tenant + revenue share)

### Bloque F — Pulido para venta (cualquier momento) — **Esfuerzo bajo**
22. Plan de precios (Inicia/Despacho/Pro/Pyme) + Stripe + límites
23. Onboarding piloto (academia ALICAM → cuenta gratis 3 meses)
24. Roles/permisos finos para Despacho Pro
25. API/MCP público para integración

---

## Estimación de créditos

**Importante y honesto:** el modo build de Lovable es **usage-based**, el costo real depende de complejidad, iteraciones, debugging y validación visual. No puedo darte un número exacto, pero sí rangos de magnitud por bloque basados en su alcance (asumiendo trabajo limpio, sin reescrituras grandes):

| Bloque | Alcance | Rango orientativo |
|---|---|---|
| A — Cerrar MVP doc | Dashboard riesgo + 7 herramientas SAT + orquestador + sync 69-B | ~60–120 créditos |
| B — Administrativo | 5 módulos nuevos con UI + serverFns + tablas | ~120–220 créditos |
| C — RH y Nómina | 5 módulos, lógica IMSS/SDI/ISR delicada + recibos timbrados | ~200–350 créditos |
| D — Inventarios y Tesorería | 3 módulos con ingesta y escenarios | ~120–200 créditos |
| E — Lagunas Legales + Marketplace | Diferenciador, mucha IA, jurisprudencia, multi-tenant marketplace | ~250–450 créditos |
| F — Pulido / monetización | Stripe, planes, MCP, onboarding | ~60–120 créditos |
| **Total para dejar 100% funcional** | Todo el doc | **~810–1,460 créditos** |

Variables que mueven el número arriba o abajo:
- **Suben costo:** APIs externas que cambian, debugging fiscal complejo (nómina, transfer pricing), iteraciones de diseño, datos de prueba reales, integraciones con timbrado PAC.
- **Bajan costo:** entregas por bloque (medimos y ajustamos), reutilizar componentes ya hechos (PDF/Excel, tablas, reportes), no rehacer UI ya validada.

### Recomendación de orden de ejecución
1. **Bloque A primero** (cerrar lo que casi está) → ya podemos vender plan Inicia/Despacho.
2. **Bloque F mínimo** (Stripe + plan Despacho) → ingresos desde mes 1.
3. **Bloque B** → habilita plan Despacho Pro.
4. **Bloque C** → habilita Pyme Integral (precio más alto del doc).
5. **Bloque D** → completa la suite.
6. **Bloque E** → el diferenciador para escalar.

¿Quieres que arranque por **Bloque A** (dashboard de riesgo SAT + completar las 12 herramientas) y dejemos la plataforma alineada al MVP del documento?
