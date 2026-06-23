# ContaClick Desktop (Electron)

Esta guía empaqueta ContaClick como aplicación de escritorio que guarda **todos los datos fiscales en la PC del despacho** (SQLite local). La IA y consultas SAT siguen usando internet, pero con anonimización.

## Estado actual (Fase 1)

✅ Scaffolding Electron + IPC bridge
✅ Esquema SQLite local (`electron/db/schema.sql`)
✅ Adaptador local (`src/integrations/local/client.ts`)
✅ Capa polimórfica de datos (`src/integrations/data/index.ts`)
✅ Anonimizador para prompts de IA (`src/lib/privacy/anonymizer.ts`)

⏳ Fases 2-5: migración de herramientas, IA con anonimización, integración SAT, distribución firmada.

## Requisitos

- Node.js 20+ / Bun 1.x
- Compilador C++ (Windows: Visual Studio Build Tools; Mac: Xcode CLI; Linux: build-essential)

## Instalación en tu máquina

```bash
# 1. Instalar dependencias nativas (NO se instalan en el sandbox de Lovable)
npm install --save-dev electron @electron/packager
npm install better-sqlite3

# 2. Ajuste para que Vite emita rutas relativas (Electron usa file://)
#    Edita vite.config.ts y agrega:  vite: { base: './' }
```

## Scripts a agregar en `package.json`

```json
{
  "scripts": {
    "dev:desktop": "VITE_TARGET=desktop vite dev",
    "build:desktop": "VITE_TARGET=desktop vite build --mode production",
    "electron:dev": "VITE_DEV_SERVER_URL=http://localhost:8080 OPEN_DEVTOOLS=1 electron electron/main.cjs",
    "electron:pack": "npm run build:desktop && electron-packager . ContaClick --platform=win32 --arch=x64 --out=electron-release --overwrite --ignore='^/src' --ignore='^/electron-release'"
  },
  "main": "electron/main.cjs"
}
```

## Probar en desarrollo

```bash
# Terminal 1
npm run dev:desktop

# Terminal 2
npm run electron:dev
```

## Empaquetar `.exe`, `.dmg`, `.AppImage`

```bash
# Windows
npx electron-packager . ContaClick --platform=win32 --arch=x64 --out=electron-release --overwrite

# macOS
npx electron-packager . ContaClick --platform=darwin --arch=x64 --out=electron-release --overwrite

# Linux
npx electron-packager . ContaClick --platform=linux --arch=x64 --out=electron-release --overwrite
```

## Dónde se guardan los datos

| SO       | Ruta                                                              |
| -------- | ----------------------------------------------------------------- |
| Windows  | `%APPDATA%\ContaClick\contaclick.db`                              |
| macOS    | `~/Library/Application Support/ContaClick/contaclick.db`          |
| Linux    | `~/.config/ContaClick/contaclick.db`                              |

Los XMLs, CFDIs, conciliaciones y reportes viven aquí. **Nada se sube a la nube.**

## Backups

Desde la UI: menú **Configuración → Respaldar base de datos** (llama a `window.contaclick.app.backup()`).

## Próximos pasos

Cuando confirmes que el scaffold compila y abre, arranco con **Fase 2**: migrar las herramientas (Lector CFDI, Conciliador, Auditor, etc.) para que lean/escriban en `localDb` cuando `dataTarget === "desktop"`.
