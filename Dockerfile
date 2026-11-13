# syntax=docker/dockerfile:1
# ─── Etapa 1: compilación ─────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY tsconfig.json ./
COPY scripts ./scripts
COPY public ./public
COPY src ./src
RUN npm run build

# ─── Etapa 2: ejecución ───────────────────────────────────────────────────────
# El servidor compilado no tiene dependencias npm en tiempo de ejecución (solo módulos node:*; incluye su propio cliente PostgreSQL),
# y la interfaz ya está empaquetada en dist/public: no se copia node_modules.
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    PUBLIC_DIR=/app/dist/public
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
# Carpeta para SQLite (solo si DATABASE_URL=sqlite:…; con PostgreSQL no se usa)
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Con DB_AUTO_MIGRATE=true (por defecto) el servidor aplica las migraciones al iniciar.
# Con roles separados use DB_AUTO_MIGRATE=false y ejecute dist/cli/migrate.js con el rol propietario.
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/server.js"]
