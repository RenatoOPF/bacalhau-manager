<#
  Setup do PC do caixa (Windows 10) — Bacalhau & Cia.
  Equivalente Windows do scripts/setup-caixa.sh.

  Arquitetura: backend NestJS roda AQUI (PRINT_WORKER=on), Redis LOCAL
  (Memurai), PostgreSQL no Supabase (nuvem), exposição via Cloudflare Tunnel.

  Rode num PowerShell COMO ADMINISTRADOR, a partir da raiz do repositório:

      powershell -ExecutionPolicy Bypass -File scripts\setup-caixa.ps1

  Automatiza o que dá; passos que exigem decisão manual (impressoras,
  cloudflared, Vercel) são apenas IMPRIMIDOS no final.
  Detalhes completos em docs/deploy-windows.md.
#>

$ErrorActionPreference = 'Stop'

function Say($m)  { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Warn($m) { Write-Host "`n!!  $m" -ForegroundColor Yellow }

# Passo que precisa terminar com sucesso (checa o exit code de comando nativo).
function Step($desc, [scriptblock]$block) {
  Say $desc
  & $block
  if ($LASTEXITCODE -ne 0) { throw "Falhou: $desc (exit $LASTEXITCODE)" }
}

function Winget-Install($id) {
  winget install --id $id -e --accept-source-agreements --accept-package-agreements
}

# Raiz do repo = pasta pai deste script.
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

# 0. Node.js 20 LTS ----------------------------------------------------------
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Say "Instalando Node.js 20 LTS"
  Winget-Install "OpenJS.NodeJS.LTS"
  Warn "Feche e reabra o PowerShell (Admin) para o Node entrar no PATH, e rode o script de novo."
  exit 1
}

# 1. Redis local via Memurai (serviço do Windows) ----------------------------
# Não instalamos PostgreSQL: o banco é o Supabase (nuvem).
if (-not (Get-Command memurai-cli -ErrorAction SilentlyContinue)) {
  Say "Instalando Memurai (Redis compatível para Windows)"
  Winget-Install "Memurai.MemuraiDeveloper"
}

# 2. Dependências do projeto -------------------------------------------------
Step "Instalando dependências (npm ci)" { npm ci }

# 3. backend\.env ------------------------------------------------------------
if (-not (Test-Path backend\.env)) {
  Say "Criando backend\.env a partir do exemplo"
  Copy-Item backend\.env.example backend\.env
  Warn "REVISE backend\.env antes de continuar:"
  Write-Host "   - DATABASE_URL  -> Session pooler do Supabase (porta 5432, sslmode=require)"
  Write-Host "   - PRINT_WORKER=on"
  Write-Host "   - PRINTER_CASHIER_INTERFACE / PRINTER_KITCHEN_INTERFACE -> impressoras"
  Write-Host "   - CORS_ORIGINS  -> URL do frontend na Vercel"
  Write-Host "   - JWT_SECRET    -> um segredo forte"
}

# Guarda: sem um DATABASE_URL real (Supabase), as migrations falham.
$envText = Get-Content backend\.env -Raw
if (($envText -notmatch '(?m)^DATABASE_URL=') -or ($envText -match '<ref>|<senha>|localhost:5432/bacalhau')) {
  Warn "DATABASE_URL ainda não aponta para o Supabase."
  Write-Host "Preencha DATABASE_URL em backend\.env com a Session pooler do Supabase"
  Write-Host "(porta 5432) e rode este script novamente."
  exit 1
}

# 4. Banco (Supabase): client + migrações + seed -----------------------------
Step "Prisma generate"        { npm run prisma:generate --workspace backend }
Step "Aplicando migrações no Supabase" { npm run prisma:deploy --workspace backend }

Say "Seed inicial (admin + cardápio; idempotente)"
npm run db:seed --workspace backend
if ($LASTEXITCODE -ne 0) { Write-Host "(seed pulado — provavelmente já há dados)" }

# 5. Build de produção -------------------------------------------------------
Step "Build de produção do backend" { npm run build --workspace backend }

# 6. PM2 + auto-start no boot ------------------------------------------------
if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
  Step "Instalando PM2 + pm2-windows-startup" { npm install -g pm2 pm2-windows-startup }
  Say "Configurando PM2 para subir no login do Windows"
  pm2-startup install
}
Step "Subindo o backend no PM2" { pm2 start ecosystem.config.js }
pm2 save

# 7. cloudflared -------------------------------------------------------------
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Say "Instalando cloudflared"
  Winget-Install "Cloudflare.cloudflared"
}

# 8. Passos manuais finais ----------------------------------------------------
Write-Host @"

========================================================================
Setup automático concluído. Faltam os passos manuais:

1) IMPRESSORAS (backend\.env):
   - USB compartilhada:  //localhost/NomeDaImpressora
   - Rede (IP):          tcp://192.168.0.50
   Ajuste PRINTER_CASHIER_INTERFACE / PRINTER_KITCHEN_INTERFACE e rode:
       pm2 restart bacalhau-backend

2) LOGIN AUTOMÁTICO DO WINDOWS:
   o PM2 sobe no LOGIN do usuário — configure o PC para logar automaticamente
   no usuário do caixa, senão o backend não sobe sozinho após reiniciar.

3) CLOUDFLARE TUNNEL (URL pública, sem domínio):
       cloudflared tunnel --url http://localhost:3001
   Anote a URL https://<algo>.trycloudflare.com.

4) VERCEL (frontend):
   - NEXT_PUBLIC_API_URL = https://<url-tunnel>/api
   - NEXT_PUBLIC_WS_URL  = https://<url-tunnel>
   - Em backend\.env, ajuste CORS_ORIGINS com a URL da Vercel e rode:
       pm2 restart bacalhau-backend

Confira:  pm2 logs bacalhau-backend  -> um pedido de teste deve imprimir.
Detalhes completos em docs/deploy-windows.md
========================================================================
"@
