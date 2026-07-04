# Deploy — produção

> **Arquitetura atual:** o backend roda na **Fly.io** (nuvem), com **Postgres**
> e **Redis** gerenciados. As impressoras térmicas ficam na rede local do
> restaurante — por isso um **agente local** roda no PC do caixa, consome a
> fila do Redis e imprime. O frontend fica na **Vercel**.

## Arquitetura de produção

```
Cliente → Vercel (frontend Next.js)
                ↓ HTTPS / WebSocket
        Fly.io (backend NestJS, região gru/São Paulo)
          ├── Postgres gerenciado (DATABASE_URL)
          └── Redis gerenciado (REDIS_URL)  ← fila BullMQ
                ↑ mesma REDIS_URL + DATABASE_URL
        PC do caixa (rede local do restaurante):
          Agente de impressão (mesmo backend, PRINT_WORKER=on)
                ↓ rede local
          Impressoras térmicas (caixa + cozinha)
```

**Divisão de papéis (mesmo código, dois modos via `PRINT_WORKER`):**

| Onde | `PRINT_WORKER` | Faz |
|---|---|---|
| Fly.io (nuvem) | `off` | Serve a API/WebSocket e **enfileira** os pedidos. Não imprime. |
| PC do caixa (local) | `on` | **Consome** a fila e imprime nas impressoras ESC/POS locais. |

Como os pedidos ficam persistidos no Redis, se o PC do caixa estiver desligado
os jobs **aguardam** na fila e são impressos assim que o agente voltar.

---

## 1. Backend na Fly.io

Pré-requisito: `flyctl` instalado e logado (`flyctl auth login`).

```bash
# Na RAIZ do repo (o Dockerfile builda a partir daqui — npm workspaces).
flyctl launch --no-deploy   # cria o app; confirme região gru e o fly.toml existente
```

### 1.1 Provisionar Postgres e Redis gerenciados

Use o provedor de sua preferência (ex.: Fly Postgres/Upstash, Neon, Supabase).
O importante é obter as duas strings de conexão:

- `DATABASE_URL` — Postgres, com `sslmode=require`.
- `REDIS_URL` — use `rediss://` (TLS). O código detecta `rediss://` e liga TLS
  automaticamente (`backend/src/app.module.ts`).

### 1.2 Segredos (não vão no fly.toml)

```bash
flyctl secrets set \
  DATABASE_URL="postgresql://user:senha@host/db?sslmode=require" \
  REDIS_URL="rediss://default:senha@host:6379" \
  JWT_SECRET="troque-por-um-segredo-forte" \
  CORS_ORIGINS="https://seu-projeto.vercel.app"
```

> `PORT=8080` e `PRINT_WORKER=off` já estão no `fly.toml` — a nuvem nunca roda
> o worker de impressão.

### 1.3 Deploy

```bash
flyctl deploy
```

As migrations do Prisma rodam sozinhas antes de cada release
(`release_command` no `fly.toml` → `prisma migrate deploy`). A API fica em
`https://<app>.fly.dev/api` e o WebSocket na própria origem.

> O `fly.toml` mantém `auto_stop_machines = off` / `min_machines_running = 1`:
> o gateway WebSocket e a fila precisam de um processo vivo 24/7.

---

## 2. Agente de impressão no PC do caixa

O agente é o **mesmo backend**, rodando na máquina do caixa (mesma rede das
impressoras), apontando para o Postgres e o Redis da nuvem.

### 2.1 Preparar a máquina

```bash
# Node 20 LTS (Linux; no Windows, instale o Node 20 pelo instalador oficial)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs

git clone <repo> bacalhau-manager && cd bacalhau-manager
npm ci
npm run prisma:generate --workspace backend
npm run build --workspace backend
```

### 2.2 Configurar `backend/.env`

```
# Aponta para os MESMOS serviços da nuvem que o backend Fly usa:
DATABASE_URL="postgresql://user:senha@host/db?sslmode=require"
REDIS_URL="rediss://default:senha@host:6379"

# Liga o worker de impressão SÓ aqui:
PRINT_WORKER=on

# Impressoras na rede local (ESC/POS). Ex.: tcp://IP, ou //localhost/Nome no Windows.
PRINTER_CASHIER_INTERFACE=tcp://192.168.0.50
PRINTER_KITCHEN_INTERFACE=tcp://192.168.0.51
PRINTER_WIDTH=48
```

> O agente só precisa do processo de pé para consumir a fila; a porta HTTP
> local (`PORT`) fica ociosa e não precisa ser exposta.

### 2.3 Manter de pé com PM2

```bash
sudo npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # imprime um comando com sudo — copie e rode (início no boot)

pm2 logs bacalhau-backend   # deve mostrar "Pedido #... impresso com sucesso"
```

### Cuidados com o PC do caixa
- Nunca suspender/hibernar; manter na tomada (nobreak de preferência).
- Conexão estável com a internet (fala com Postgres/Redis na nuvem) **e** com
  as impressoras na rede local.
- Serviço configurado para subir no boot (PM2).

---

## 3. Frontend na Vercel

1. Conectar o repositório na Vercel, **Root Directory = `frontend`**.
2. Variáveis de ambiente (Project Settings → Environment Variables):
   - `NEXT_PUBLIC_API_URL = https://<app>.fly.dev/api`
   - `NEXT_PUBLIC_WS_URL  = https://<app>.fly.dev`
3. Deploy. A cada `git push` na branch de produção, a Vercel publica sozinha.

Garanta que a URL da Vercel esteja em `CORS_ORIGINS` nos secrets do Fly
(seção 1.2). Ao alterar, rode `flyctl secrets set CORS_ORIGINS=...` (dispara um
novo release automaticamente).

---

## Checklist de validação

- [ ] `flyctl deploy` conclui e `GET https://<app>.fly.dev/api` responde (404 do
      Nest confirma que o processo está de pé).
- [ ] Frontend na Vercel carrega o cardápio consumindo a API do Fly.
- [ ] Um pedido de teste cria um job na fila (visível nos logs do Fly:
      "enfileira" sem imprimir).
- [ ] Agente local (`PRINT_WORKER=on`) imprime o pedido de teste nas duas
      impressoras e loga "Pedido #... impresso com sucesso".
- [ ] Desligar o agente, fazer um pedido, religar → o pedido pendente imprime.
