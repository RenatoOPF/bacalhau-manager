# Deploy do backend NestJS (Bacalhau Manager) — build a partir da RAIZ do repo,
# pois o projeto usa npm workspaces com um único package-lock.json na raiz.
#
#   flyctl deploy   (usa fly.toml -> build.dockerfile = backend/Dockerfile)
#
# Base Debian slim (openssl 3) — casa com o binário "native" do Prisma.

FROM node:20-slim AS base
WORKDIR /app
# openssl é necessário para o Prisma Engine em runtime.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# ---------- Build ----------
FROM base AS build
ENV NODE_ENV=development
# Copia só os manifestos primeiro para aproveitar o cache de camadas.
# Todos os workspaces precisam existir para o `npm ci` bater com o lockfile.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci

# Código do backend + schema do Prisma.
COPY backend ./backend
RUN npm run prisma:generate --workspace backend \
  && npm run build --workspace backend

# ---------- Runtime ----------
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=8080
# node_modules (raiz hoisted + do workspace) já com @prisma/client gerado.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/node_modules ./backend/node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/prisma ./backend/prisma
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/package.json ./package.json

WORKDIR /app/backend
EXPOSE 8080
CMD ["node", "dist/main"]
