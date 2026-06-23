
# Plan: ContaClick Desktop (modo híbrido local)

Convertir ContaClick en una aplicación de escritorio donde los **datos fiscales sensibles nunca salen de la PC**, pero la **IA y catálogos legales** sí usan internet (sin enviar datos de clientes).

---

## Arquitectura propuesta

```text
┌─────────────────────────────────────────────────┐
│  ContaClick Desktop (Electron .exe / .dmg)      │
│                                                 │
│  ┌──────────────────┐   ┌──────────────────┐    │
│  │  UI (React)      │   │  Núcleo local    │    │
│  │  = código actual │◄──┤  SQLite cifrado  │    │
│  └──────────────────┘   │  (better-sqlite3)│    │
│           │             └──────────────────┘    │
│           │                                     │
│           ▼ solo prompts anonimizados           │
│  ┌──────────────────────────────────────────┐   │
│  │ Internet (opcional)                      │   │
│  │  • Lovable AI (chat, agentes)            │   │
│  │  • SAT (validación CFDI, EFOS, LCO)      │   │
│  │  • Catálogos legales (referencias.ts)    │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

**Lo que cambia vs versión nube:**
- Supabase → SQLite local (`better-sqlite3`) con cifrado AES por contraseña maestra del despacho.
- Server functions de TanStack → handlers IPC de Electron al mismo motor SQLite.
- Auth → login local (bcrypt) + opcional sincronización de licencia con servidor.
- IA → sigue llamando a Lovable AI Gateway pero con **capa de anonimización** que reemplaza RFCs, nombres y montos por tokens antes de enviar.

---

## Fases (entregables incrementales)

### Fase 1 — Base Electron + SQLite (semana 1)
- Configurar Electron con `@electron/packager`, `vite.config.ts` con `base: './'`.
- `electron/main.cjs` con BrowserWindow + IPC bridge.
- Esquema SQLite espejo de las 31 tablas Supabase actuales.
- Capa de adaptador `src/integrations/local/client.ts` con la misma API que el cliente Supabase (drop-in).
- Login local con contraseña maestra + cifrado de DB.

### Fase 2 — Migración de herramientas core (semana 2)
- Lector/Validador CFDI offline (parser XML ya es local).
- Carga masiva de XMLs → SQLite local.
- Conciliación bancaria (parsers ya son locales).
- Auditor Express, Deducibilidad, Nómina Oculta, Precios Importación.
- Exportes Excel/PDF (ya son locales).

### Fase 3 — IA con anonimización (semana 3)
- Módulo `src/lib/privacy/anonymizer.ts`:
  - Reemplaza RFC → `RFC_001`, razón social → `EMPRESA_A`, montos → rangos.
  - Mantiene mapa local para "des-anonimizar" la respuesta.
- Agente Auditor, Agente CFDI, Asistente Fiscal envían prompts anonimizados.
- Banner visible: "Esta consulta enviará datos anonimizados a la IA".
- Toggle por despacho: "Modo paranoia" (deshabilita IA por completo).

### Fase 4 — SAT y validaciones (semana 4)
- Validación CFDI contra SAT desde el cliente local (CORS via Electron).
- Descarga masiva SAT con e.firma → guarda XMLs en `%APPDATA%/ContaClick/xmls/` cifrados.
- EFOS: descarga periódica de la lista oficial y cachea local.

### Fase 5 — Empaquetado y distribución (semana 5)
- `.exe` (Windows), `.dmg` (Mac), `.AppImage` (Linux) firmados.
- Auto-updater (electron-updater) apuntando a servidor de releases.
- Sistema de licencias: el ejecutable valida licencia 1x/mes contra servidor.
- Backups automáticos del SQLite a carpeta local elegida por el usuario.

---

## Detalles técnicos clave

**Reuso del código actual:** ~80% del frontend (`src/components`, `src/routes`, parsers, lógica de risk/referencias) se reutiliza sin cambios. Solo cambia la capa de datos.

**Capa de datos polimórfica:** crear `src/integrations/data/index.ts` que exponga `getClient()` y devuelva Supabase (web) o el adaptador SQLite (Electron) según `import.meta.env.VITE_TARGET`.

**Build dual:**
- `bun run build` → versión web (actual).
- `bun run build:desktop` → versión Electron.

Mismo repo, dos targets.

**Anonimización IA:** el `Anonymizer` extrae entidades con regex (RFC: `[A-Z&Ñ]{3,4}\d{6}[A-Z\d]{3}`), genera tokens estables por sesión, sustituye en el prompt, y revierte en la respuesta. La IA nunca ve RFCs ni nombres reales.

**Cumplimiento legal MX:**
- Cumple LFPDPPP (datos quedan en posesión del titular del despacho).
- El aviso de privacidad del producto baja a "no tratamos datos personales de tus clientes — solo viven en tu equipo".

---

## Out of scope

- Sincronización entre múltiples PCs del despacho (sería Fase 6, requiere servidor de sync).
- Mobile (iOS/Android).
- IA 100% offline con Ollama (rechazada por el usuario).

---

## Primer paso si apruebas

Arranco con **Fase 1** completa: Electron + SQLite + login local + adaptador que ya permite abrir la app de escritorio y ver el dashboard leyendo de la DB local vacía. Eso te lo entrego en una iteración y a partir de ahí migramos herramientas una por una.

¿Procedo con Fase 1?
