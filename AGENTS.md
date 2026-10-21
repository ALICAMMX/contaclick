# ContaClick — reglas para agentes de código (Codex, Claude, etc.)

## Qué es el producto
ContaClick **complementa** a CONTPAQi, Aspel y Siigo. No los sustituye. Su trabajo es el flujo mensual de un despacho con muchos RFC:

1. Descargar CFDI del SAT con e.firma (`/app/sat-sync`)
2. Revisar comprobantes (`/app/cfdi`)
3. Conciliar el banco (`/app/conciliacion`)
4. Pólizas y exportación a CONTPAQi / Aspel COI / XML del SAT (`/app/polizas`)
5. Cerrar el mes (`/app/cierre`)
6. Entregables (`/app/reportes`)

La ruta guiada (`/app/inicio-guiado`) y la cartera (`/app/despacho`) son la entrada.

## Reglas de alcance
- **No agregues pantallas nuevas al menú.** Lo que se muestra lo decide `src/lib/capabilities/enfoque.ts`. Para ocultar o mostrar algo, cambia ahí una bandera y no borres código.
- Los módulos Administrativo, Legal y Agentes están apagados (`MODULOS_ACTIVOS`). Sus rutas existen, pero no se anuncian.
- **Un solo generador de pólizas:** `generarBorradoresDelPeriodo` en `src/lib/polizas/polizas.functions.ts`. Nunca escribas en `polizas` / `poliza_renglones` desde otro lado; usa los RPC `poliza_generar_borrador`, `poliza_aprobar` y `poliza_rechazar`.
- **Una sola conciliación bancaria canónica:** `src/lib/conciliacion/motor.ts`. La "conciliación integral" es sólo una revisión cruzada y su lógica vive en `src/lib/conciliacion-integral/detectar.ts` (pura y probada).
- **No inventes alarmas:** si faltan datos (sin pólizas, sin banco), dilo como "datos insuficientes" y no conviertas la falta de datos en incidencias.

## Reglas de trabajo
- Un cambio = un problema = un commit pequeño, con su prueba.
- Antes de terminar: `npx vitest run`, `npx tsc --noEmit -p tsconfig.json` y `npx vite build` en verde.
- La lógica de negocio va en módulos **puros** (`*.ts` sin red ni base de datos) con su `*.test.ts`. Los `*.functions.ts` sólo leen, llaman a la lógica pura y escriben.
- Toda lectura por expediente pasa por `assertClienteScope`.
- Consultas a Supabase: revisa siempre `error` y pagina con `.range()` (el tope por página es de 1000 filas).
- Las columnas deben existir en `src/integrations/supabase/types.ts`. Si no están ahí, no existen.
- Migraciones: sólo agrega archivos nuevos en `supabase/migrations/`; no edites las anteriores.
- Nada de datos inventados en pantallas reales. Lo demo sólo aplica a expedientes con `clientes.es_demo = true`.
- Textos de la interfaz en español de México, claros y sin tecnicismos para el contador.

## Registro de correcciones
Documenta cada corrección importante en `docs/fixes-log.md`: síntoma, causa y corrección.
