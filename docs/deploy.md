# Deploy — produção (monolito, LEGADO)

> ⚠️ **Arquitetura antiga.** Este guia descreve o monolito (backend inteiro no
> PC do caixa + Redis local + Cloudflare Tunnel). A arquitetura atual roda a API
> na **nuvem** e só o **agente de impressão** no caixa — use
> [`deploy-cloud.md`](deploy-cloud.md) (nuvem) e
> [`deploy-windows.md`](deploy-windows.md) (agente). Mantido só como referência.

> **Arquitetura (custo ~zero):** o backend roda **no PC do caixa**, dentro do
> restaurante. Uma única instância serve a API/WebSocket, enfileira os pedidos
> **e** imprime (`PRINT_WORKER=on`) — as impressoras estão na mesma rede local.
> O **PostgreSQL** fica no **Supabase** (grátis), o **Redis** roda **local** no
> PC, a exposição para a internet é via **Cloudflare Tunnel** (grátis) e o
> frontend na **Vercel** (grátis).

> ℹ️ Não há script de setup para Linux — a produção roda em Windows
> (ver [`deploy-windows.md`](deploy-windows.md), que tem o `setup-caixa.ps1`).
> Em Linux, siga os passos manuais abaixo.

## Arquitetura de produção

```
Cliente → Vercel (frontend Next.js)
                ↓ HTTPS / WebSocket
        Cloudflare Tunnel (URL pública, grátis)
                ↓
        PC do caixa (rede local do restaurante):
          backend NestJS (PM2, PRINT_WORKER=on)
            ├── Redis local (fila BullMQ)
            └── Supabase (PostgreSQL gerenciado, na nuvem)
                ↓ rede local
          Impressoras térmicas (caixa + cozinha)
```

- **Único processo**: o mesmo backend serve a API, mantém o WebSocket, consome
  a fila e imprime. Sem serviço separado.
- **Custo**: Supabase (free tier), Cloudflare Tunnel (grátis), Vercel (grátis).
  Só o PC do caixa (que já existe) e a luz.

---

## 1. Banco de dados no Supabase

1. Crie um projeto em <https://supabase.com> (free tier). Escolha uma região
   próxima (ex.: `sa-east-1` / São Paulo).
2. Em **Connect** (ou **Project Settings → Database → Connection string**),
   copie a **Session pooler** — host `aws-<n>-<regiao>.pooler.supabase.com`,
   **porta 5432**, usuário `postgres.<ref>`.
   - É IPv4 (alcançável de qualquer rede) e suporta as migrations do Prisma.
   - **Não** use a *Transaction pooler* (6543): é para serverless e quebra
     `prisma migrate deploy` sem um `directUrl` separado (que este schema não
     tem). A *Direct connection* costuma ser IPv6-only e não conecta do PC.
   - Troque `[YOUR-PASSWORD]` pela senha do banco e mantenha `sslmode=require`.
     Se a senha tiver caracteres especiais, faça URL-encode (`@`→`%40` etc.).
3. Esse valor vai no `DATABASE_URL` do `backend/.env` (seção 3).

> O free tier pausa o projeto após ~1 semana **sem nenhuma atividade**. Um
> restaurante em operação diária mantém o banco ativo, então não é problema.

---

## 2. PC do caixa — sistema e serviços

```bash
# Node.js 20 LTS (Linux; no Windows use o instalador oficial do Node 20)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs

# Redis local (a fila de pedidos)
sudo apt-get update && sudo apt-get install -y redis-server
sudo systemctl enable --now redis-server
```

> **Redis**: NÃO configure `maxmemory` com despejo (eviction) — ele guarda a
> fila de pedidos (BullMQ) e despejar jobs perderia pedidos. Deixe o padrão.
> A persistência AOF/RDB do Redis garante que a fila sobreviva a um reinício.

### Cuidados com o PC do caixa
- Nunca suspender/hibernar; manter na tomada (nobreak de preferência).
- Internet estável (fala com o Supabase) **e** rede local com as impressoras.
- Serviços configurados para subir no boot (Redis e PM2).

---

## 3. Backend sempre de pé com PM2

```bash
git clone <repo> bacalhau-manager && cd bacalhau-manager
npm ci

# backend/.env — copie do exemplo e preencha:
cp backend/.env.example backend/.env
#   DATABASE_URL   → connection string do Supabase (seção 1)
#   REDIS_HOST=localhost / REDIS_PORT=6379   (Redis local)
#   PRINT_WORKER=on
#   PRINTER_CASHIER_INTERFACE / PRINTER_KITCHEN_INTERFACE → impressoras da rede
#   CORS_ORIGINS   → URL do frontend na Vercel
#   JWT_SECRET     → um segredo forte

# Banco: gera o client e aplica as migrações (no Supabase)
npm run prisma:generate --workspace backend
npm run prisma:deploy --workspace backend

# Build de produção
npm run build --workspace backend

# PM2 mantém o backend de pé e reinicia no boot
sudo npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup        # imprime um comando com sudo — copie e rode

pm2 status
pm2 logs bacalhau-backend    # deve mostrar "Pedido #... impresso com sucesso"
```

---

## 4. Expor na internet com Cloudflare Tunnel

### Agora (sem domínio): Quick Tunnel

URL aleatória `*.trycloudflare.com`, grátis, sem conta. **A URL muda a cada
reinício** — bom para testar, não para produção fixa.

```bash
# Instala o cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared && sudo mv cloudflared /usr/local/bin/

# Sobe o tunnel apontando para o backend local
cloudflared tunnel --url http://localhost:3001
```

A API fica em `<URL>/api` e o WebSocket na própria `<URL>`.

### Depois (com domínio no Cloudflare): Tunnel nomeado

URL fixa (ex: `api.seudominio.com.br`), sobrevive a reinícios e roda como
serviço. Passos: `cloudflared login` → `cloudflared tunnel create bacalhau` →
rota DNS → arquivo de config → `cloudflared tunnel run` (ou instale como serviço
do sistema para subir no boot).

---

## 5. Frontend na Vercel

1. Conectar o repositório na Vercel, **Root Directory = `frontend`**.
2. Variáveis de ambiente (Project Settings → Environment Variables):
   - `NEXT_PUBLIC_API_URL = https://<sua-url-tunnel>/api`
   - `NEXT_PUBLIC_WS_URL  = https://<sua-url-tunnel>`
3. Deploy. A cada `git push` na branch de produção, a Vercel publica sozinha.

No `backend/.env`, inclua a URL da Vercel em `CORS_ORIGINS` e reinicie
(`pm2 restart bacalhau-backend`).

> Com Quick Tunnel a URL muda a cada restart — ao reiniciar o tunnel, atualize
> `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WS_URL` na Vercel. Some quando migrar para
> tunnel nomeado com domínio.

---

## Checklist de validação

- [ ] `npm run prisma:deploy` aplica as migrações no Supabase sem erro.
- [ ] `pm2 status` mostra o `bacalhau-backend` online.
- [ ] Frontend na Vercel carrega o cardápio consumindo a API via tunnel.
- [ ] Um pedido de teste imprime nas duas impressoras e loga
      "Pedido #... impresso com sucesso".
- [ ] Reiniciar o PC → Redis, backend (PM2) e tunnel voltam sozinhos; um pedido
      de teste ainda imprime.
