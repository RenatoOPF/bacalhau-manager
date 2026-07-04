#!/usr/bin/env bash
#
# Setup do PC do caixa (produção) — Bacalhau & Cia.
# Arquitetura: backend NestJS roda AQUI (PRINT_WORKER=on), Redis LOCAL,
# PostgreSQL no Supabase (nuvem), exposição via Cloudflare Tunnel.
#
# Roda NO PC do caixa, a partir da raiz do repositório:
#
#     bash scripts/setup-caixa.sh
#
# Automatiza o que dá; passos que exigem decisão/sudo interativo (pm2 startup,
# login/URL do Cloudflare, Vercel) são apenas IMPRIMIDOS no final.
# Detalhes completos em docs/deploy.md.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33m!!  %s\033[0m\n' "$*"; }

# 0. Node.js 20 LTS (se ausente ou muito antigo) -----------------------------
NEED_NODE=0
if ! command -v node >/dev/null 2>&1; then
  NEED_NODE=1
elif [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  NEED_NODE=1
fi
if [ "$NEED_NODE" -eq 1 ]; then
  say "Instalando Node.js 20 LTS (NodeSource)"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# 1. Redis LOCAL (a fila BullMQ) ---------------------------------------------
# Não instalamos PostgreSQL: o banco é o Supabase (nuvem).
say "Instalando Redis (apt) e habilitando no boot"
sudo apt-get update
sudo apt-get install -y redis-server
sudo systemctl enable --now redis-server
# IMPORTANTE: não configure maxmemory com despejo (eviction) — a fila guarda
# pedidos e despejar jobs perderia pedidos. O padrão do apt já serve.

# 2. Dependências do projeto -------------------------------------------------
say "Instalando dependências (npm ci)"
npm ci

# 3. backend/.env ------------------------------------------------------------
if [ ! -f backend/.env ]; then
  say "Criando backend/.env a partir do exemplo"
  cp backend/.env.example backend/.env
  warn "REVISE backend/.env antes de continuar:"
  echo "   - DATABASE_URL  → connection string do Supabase (com sslmode=require)"
  echo "   - PRINT_WORKER=on"
  echo "   - PRINTER_CASHIER_INTERFACE / PRINTER_KITCHEN_INTERFACE → impressoras"
  echo "   - CORS_ORIGINS  → URL do frontend na Vercel"
  echo "   - JWT_SECRET    → um segredo forte"
fi

# Guarda: sem um DATABASE_URL real (Supabase), as migrations falham. Paramos
# aqui para o operador preencher o .env e rodar o script de novo.
if ! grep -q '^DATABASE_URL=' backend/.env \
   || grep -q '<ref>\|<senha>\|localhost:5432/bacalhau' backend/.env; then
  warn "DATABASE_URL ainda não aponta para o Supabase."
  echo "Preencha DATABASE_URL em backend/.env com a connection string do"
  echo "Supabase (Project Settings → Database) e rode este script novamente."
  exit 1
fi

# 4. Banco (Supabase): client + migrações + seed -----------------------------
say "Gerando Prisma Client e aplicando migrações no Supabase"
npm run prisma:generate --workspace backend
npm run prisma:deploy --workspace backend

say "Seed inicial (admin + cardápio; idempotente)"
npm run db:seed --workspace backend || echo "(seed pulado — provavelmente já há dados)"

# 5. Build de produção -------------------------------------------------------
say "Build de produção do backend"
npm run build --workspace backend

# 6. PM2 ---------------------------------------------------------------------
if ! command -v pm2 >/dev/null 2>&1; then
  say "Instalando PM2 (global)"
  sudo npm install -g pm2
fi

say "Subindo o backend no PM2"
pm2 start ecosystem.config.js
pm2 save

# 7. cloudflared -------------------------------------------------------------
if ! command -v cloudflared >/dev/null 2>&1; then
  say "Instalando cloudflared"
  curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /tmp/cloudflared
  chmod +x /tmp/cloudflared
  sudo mv /tmp/cloudflared /usr/local/bin/cloudflared
fi

# 8. Passos manuais finais ----------------------------------------------------
cat <<'EOF'

========================================================================
Setup automático concluído. Faltam 3 passos manuais:

1) BOOT AUTOMÁTICO DO PM2 (precisa de sudo):
       pm2 startup
   (copie a linha "sudo env PATH=..." que ele mostrar e execute)

2) CLOUDFLARE TUNNEL (Quick Tunnel, sem domínio):
       cloudflared tunnel --url http://localhost:3001
   Anote a URL pública https://<algo>.trycloudflare.com.
   (Para produção fixa, migre para um tunnel nomeado — ver docs/deploy.md.)

3) VERCEL (frontend):
   - Root Directory = frontend
   - Env: NEXT_PUBLIC_API_URL = https://<url-tunnel>/api
          NEXT_PUBLIC_WS_URL  = https://<url-tunnel>
   - Em backend/.env, ajuste CORS_ORIGINS com a URL da Vercel e rode:
          pm2 restart bacalhau-backend

Confira: pm2 logs bacalhau-backend  → um pedido de teste deve imprimir.
Detalhes completos em docs/deploy.md
========================================================================
EOF
