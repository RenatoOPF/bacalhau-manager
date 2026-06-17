#!/usr/bin/env bash
#
# Setup do notebook-servidor (produção) — Bacalhau & Cia, Fase 1+.
# Alvo: Ubuntu Server (headless), instalação NATIVA (sem Docker),
# pensado para hardware modesto (ex.: Atom + 4GB RAM).
#
# Roda NO notebook do restaurante, a partir da raiz do repositório:
#
#     bash scripts/setup-server.sh
#
# Faz o que dá pra automatizar; os passos que exigem decisão/sudo interativo
# (pm2 startup, login do Cloudflare) são apenas IMPRIMIDOS no final.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

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

# 1. PostgreSQL + Redis nativos ----------------------------------------------
say "Instalando PostgreSQL e Redis (apt)"
sudo apt-get update
sudo apt-get install -y postgresql redis-server

say "Habilitando serviços no boot"
sudo systemctl enable --now postgresql redis-server

# Usuário e banco (idempotente). Casa com o DATABASE_URL padrão do .env.example.
say "Criando usuário/banco 'bacalhau' (se não existirem)"
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='bacalhau'" \
  | grep -q 1 \
  || sudo -u postgres psql -c "CREATE USER bacalhau WITH PASSWORD 'bacalhau';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='bacalhau'" \
  | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE bacalhau OWNER bacalhau;"

# 2. Swap de segurança (4GB de RAM) ------------------------------------------
if [ "$(swapon --show | wc -l)" -eq 0 ]; then
  say "Criando swapfile de 2GB (sem swap detectado)"
  sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

# 3. Dependências do projeto -------------------------------------------------
say "Instalando dependências (npm install)"
npm install

# 4. Backend: env, banco e build ---------------------------------------------
if [ ! -f backend/.env ]; then
  say "Criando backend/.env a partir do exemplo"
  cp backend/.env.example backend/.env
  echo "REVISE backend/.env: troque JWT_SECRET, a senha do admin e ajuste"
  echo "CORS_ORIGINS com a URL da Vercel antes de ir para produção."
fi

say "Gerando Prisma Client e aplicando migrações"
npm run prisma:generate --workspace backend
npm run prisma:deploy --workspace backend

say "Seed inicial (admin + cardápio; idempotente)"
npm run db:seed --workspace backend || echo "(seed pulado — provavelmente já há dados)"

say "Build de produção do backend"
npm run build --workspace backend

# 5. PM2 ----------------------------------------------------------------------
if ! command -v pm2 >/dev/null 2>&1; then
  say "Instalando PM2 (global)"
  sudo npm install -g pm2
fi

say "Subindo o backend no PM2"
pm2 start ecosystem.config.js
pm2 save

# 6. cloudflared --------------------------------------------------------------
if ! command -v cloudflared >/dev/null 2>&1; then
  say "Instalando cloudflared"
  curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /tmp/cloudflared
  chmod +x /tmp/cloudflared
  sudo mv /tmp/cloudflared /usr/local/bin/cloudflared
fi

# 7. Passos manuais finais ----------------------------------------------------
cat <<'EOF'

========================================================================
Setup automático concluído. Faltam 3 passos manuais:

1) BOOT AUTOMÁTICO DO PM2 (precisa de sudo):
       pm2 startup
   (copie a linha "sudo env PATH=..." que ele mostrar e execute)

2) CLOUDFLARE TUNNEL (Quick Tunnel, sem domínio):
       cloudflared tunnel --url http://localhost:3001
   Anote a URL pública https://<algo>.trycloudflare.com.

3) VERCEL (frontend):
   - Root Directory = frontend
   - Env: NEXT_PUBLIC_API_URL = https://<url-tunnel>/api
          NEXT_PUBLIC_WS_URL  = https://<url-tunnel>
   - Em backend/.env, ajuste CORS_ORIGINS com a URL da Vercel e rode:
          pm2 restart bacalhau-backend

Detalhes completos em docs/deploy.md
========================================================================
EOF
