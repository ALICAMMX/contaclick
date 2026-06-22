## Objetivo

Que el lector de CSF deje de ser un "guardado suelto" y se convierta en la puerta de entrada al expediente:

1. **Cliente propio** del despacho → crear o actualizar su expediente.
2. **Tercero** (proveedor / acreedor del cliente) → crear su propio expediente y vincularlo al cliente activo.

## Cambios en base de datos

Agregar a la tabla `clientes`:

- `curp` (text, nullable) — sólo persona física.
- `domicilio_fiscal` (text, nullable) — domicilio completo armado.
- `codigo_postal` (text, nullable).
- `tipo_persona` (text, nullable) — `'fisica'` o `'moral'`.
- `tipo_relacion` (text, default `'cliente'`) — valores: `cliente`, `proveedor`, `acreedor`.
- `cliente_padre_id` (uuid, nullable, FK a `clientes.id`, ON DELETE SET NULL) — apunta al expediente del cliente al que pertenece el tercero. `NULL` cuando es un cliente propio del despacho.
- `csf_ultima_emision` (date, nullable) — fecha de emisión de la CSF más reciente cargada.

Índice en `(despacho_id, rfc)` para búsqueda rápida por RFC.

## Cambios en server functions (`src/lib/clientes.functions.ts`)

Nueva función `upsertFromCsf` (autenticada):

Entrada: todos los campos extraídos del CSF + `tipo_relacion` (`cliente` | `proveedor` | `acreedor`) + `cliente_padre_id` opcional.

Lógica:
1. Resolver `despacho_id` del usuario (igual que `createCliente`).
2. Buscar cliente existente por `(despacho_id, rfc, tipo_relacion, cliente_padre_id)`.
3. Si existe → `UPDATE` de razón social, régimen, domicilio, CP, CURP, tipo persona, `csf_ultima_emision`. Devolver `{ accion: 'actualizado', cliente, diferencias: [...] }` con lista de campos que cambiaron.
4. Si no existe → `INSERT`. Devolver `{ accion: 'creado', cliente }`.

## Cambios en `src/routes/app.tools.csf-parser.tsx`

Después de extraer la CSF, mostrar tres botones de acción (en lugar del "Guardar en expediente" actual):

1. **"Crear / actualizar expediente de este cliente"** — llama `upsertFromCsf` con `tipo_relacion = 'cliente'`, sin padre. Si hay cliente activo y su RFC coincide, actualiza ése; si no, busca por RFC en el despacho.
2. **"Agregar como proveedor del cliente activo"** — visible sólo si hay cliente activo. Llama `upsertFromCsf` con `tipo_relacion = 'proveedor'` y `cliente_padre_id = clienteActivo.id`.
3. **"Agregar como acreedor del cliente activo"** — igual que el anterior pero con `tipo_relacion = 'acreedor'`.

Tras la acción, mostrar banner verde con:
- Mensaje "Expediente creado" o "Expediente actualizado" + lista de campos cambiados.
- Botón "Abrir expediente" → `/app/clientes/$id`.

Se mantiene el `saveToolRun` actual como respaldo documental (queda el PDF + datos extraídos en el historial de herramientas del expediente correspondiente).

## Cambios en la vista del expediente (`src/routes/app.clientes.$id.tsx`)

Agregar dos secciones:

1. **Datos fiscales** — mostrar CURP, tipo de persona, domicilio fiscal, CP, fecha de última CSF (con badge "actualizado desde CSF el …").
2. **Terceros vinculados** — tabla con proveedores y acreedores cargados desde CSF, con link a cada expediente.

## Resumen de flujo para el usuario

- Despacho da de alta nuevo cliente → sube CSF en el lector → botón "Crear expediente de este cliente" → queda un expediente nuevo con todos los datos fiscales correctos, sin captura manual.
- Cliente entrega CSF de un proveedor suyo → con el cliente activo, sube CSF → botón "Agregar como proveedor" → se crea un expediente del proveedor vinculado al cliente, útil para validar facturas, retenciones y RFCs.
- Cliente cambia de domicilio o régimen → sube su nueva CSF → botón "Crear/actualizar" detecta que ya existe → actualiza y muestra qué cambió.
