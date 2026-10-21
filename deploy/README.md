# ContaClick en VPS (entorno de pruebas)

Servidor Node (TanStack Start + Nitro, preset `node-server`) detrás de Nginx. La base de datos es un proyecto de Supabase aparte.

## Compilar
```bash
npm ci   # o: bun install
NITRO_PRESET=node-server npx vite build
```
El resultado queda en `.output/`. Se ejecuta con `node .output/server/index.mjs`.

## Variables de entorno (archivo `/etc/contaclick/pruebas.env`, permisos 600)
Ver `env.example`. Las variables `VITE_*` se leen **al compilar**: deben estar exportadas antes de `vite build`.

## Servicio
- `contaclick-pruebas.service` (systemd), puerto 3100.
- `nginx-pruebas.contaclick.cloud.conf`: proxy y SSL (certbot).

## Tareas programadas (pg_cron en Supabase)
Al crear el proyecto de pruebas, re-apunta los jobs `sat-sync-hourly` y `sat-programaciones-cada-minuto` a `https://pruebas.contaclick.cloud` (ver `cron-pruebas.sql`).
