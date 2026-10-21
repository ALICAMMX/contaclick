# ContaClick — imagen para VPS (pruebas/producción). Nitro preset node-server.
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json ./
# bun.lock apunta a la caché privada de Lovable: se instala desde el registro público.
RUN bun install --no-save
COPY . .
RUN rm -f bun.lock
# Variables públicas que Vite incrusta al compilar.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ARG VITE_AUTH_PROVIDER=supabase
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID \
    VITE_AUTH_PROVIDER=$VITE_AUTH_PROVIDER \
    NITRO_PRESET=node-server
RUN bunx vite build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
COPY --from=build /app/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
