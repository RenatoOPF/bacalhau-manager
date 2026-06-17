#!/usr/bin/env bash
#
# Setup do notebook-servidor (produção) — Bacalhau & Cia, Fase 1.
# Roda NO notebook do restaurante, a partir da raiz do repositório:
#
#     bash scripts/setup-server.sh
#
# Faz o que dá pra automatizar; os passos que exigem decisão/sudo interativo
# (pm2 startup, login do Cloudflare) são apenas IMPRIMIDOS no final.
#
# Pré-requisitos: Node.js 18.18+, git e o repositório já clonado.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

# 1. Docker (Postgres + Redis) ------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  say "Instalando Docker (vai pedir sua senha)"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  echo "IMPORTANTE: faça logout/login para usar docker sem sudo e rode este script de novo."
  exit 0
fi

say "Subindo PostgreSQL + Redis (docker compose)"
docker compose up -d

# 2. Dependências -------------------------------------------------------------
say "Instalando dependências (npm install)"
npm install

# 3. Backend: env, banco e build ---------------------------------------------
if [ ! -f backend/.env ]; then
  say "Criando backend/.env a partir do exemplo"
  cp backend/.env.example backend/.env
  echo "Revise backend/.env (CORS_ORIGINS com a URL da Vercel, etc.) antes de produção."
fi

say "Gerando Prisma Client e aplicando migrações"
npm run prisma:generate --workspace backend
npm run prisma:deploy --workspace backend

# Popula o cardápio só se ainda não houver categorias.
say "Seed do cardápio (apenas se o banco estiver vazio)"
npm run db:seed --workspace backend || echo "(seed pulado — provavelmente já há dados)"

say "Build de produção do backend"
npm run build --workspace backend

# 4. PM2 ----------------------------------------------------------------------
if ! command -v pm2 >/dev/null 2>&1; then
  say "Instalando PM2 (vai pedir sua senha)"
  sudo npm install -g pm2
fi

say "Subindo o backend no PM2"
pm2 start ecosystem.config.js
pm2 save

# 5. cloudflared --------------------------------------------------------------
if ! command -v cloudflared >/dev/null 2>&1; then
  say "Instalando cloudflared (vai pedir sua senha)"
  curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /tmp/cloudflared
  chmod +x /tmp/cloudflared
  sudo mv /tmp/cloudflared /usr/local/bin/cloudflared
fi

# 6. Passos manuais finais ----------------------------------------------------
cat <<'EOF'

========================================================================
Setup automático concluído. Faltam 3 passos manuais:

1) BOOT AUTOMÁTICO DO PM2 (precisa de sudo):
   Rode o comando que este comando imprimir:
       pm2 startup
   (copie a linha "sudo env PATH=..." que ele mostrar e execute)

2) CLOUDFLARE TUNNEL (Quick Tunnel, sem domínio):
       cloudflared tunnel --url http://localhost:3001
   Anote a URL pública https://<algo>.trycloudflare.com que aparecer.
   (Ela muda a cada reinício — para URL fixa, use tunnel nomeado com domínio.)

3) VERCEL (frontend):
   - Root Directory = frontend
   - Env: NEXT_PUBLIC_API_URL = https://<url-tunnel>/api
          NEXT_PUBLIC_WS_URL  = https://<url-tunnel>
   - Em backend/.env, ajuste CORS_ORIGINS com a URL da Vercel e rode:
          pm2 restart bacalhau-backend

Detalhes completos em docs/deploy.md
========================================================================
EOF
