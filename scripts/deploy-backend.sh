#!/usr/bin/env bash
# Deploy do backend na VM Oracle.
# Uso: ./scripts/deploy-backend.sh
# Requer: SSH configurado como "bacalhau-vm" em ~/.ssh/config

set -e

REMOTE="bacalhau-vm"
REMOTE_DIR="~/bacalhau"

echo "==> Build local..."
(cd "$(dirname "$0")/../backend" && ../node_modules/.bin/nest build)

echo "==> Sincronizando dist/ para a VM..."
rsync -az --delete \
  "$(dirname "$0")/../backend/dist/" \
  "$REMOTE:$REMOTE_DIR/backend/dist/"

echo "==> Gerando Prisma Client na VM..."
ssh "$REMOTE" "cd $REMOTE_DIR/backend && ../node_modules/.bin/prisma generate"

echo "==> Reiniciando backend..."
ssh "$REMOTE" "pm2 restart bacalhau-backend"

echo "==> Deploy concluído."
