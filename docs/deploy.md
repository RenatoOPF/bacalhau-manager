# Deploy — Fase 1

> **Onde rodar:** todo este guia roda **no notebook-servidor do restaurante**
> (não na máquina de desenvolvimento). O backend, o banco, a fila e as
> impressoras ficam nesse notebook; o frontend fica na Vercel.

## Atalho: script de setup

Com o repositório clonado no notebook-servidor, a maior parte é automática:

```bash
bash scripts/setup-server.sh
```

Ele sobe Postgres/Redis, instala dependências, prepara o banco, builda o
backend, instala e sobe o PM2 e instala o `cloudflared` — e imprime no fim os
3 passos manuais (boot do PM2, tunnel e Vercel). As seções abaixo detalham cada
parte caso prefira fazer na mão.

---

Arquitetura de produção (MVP):

```
Cliente → Vercel (frontend Next.js)
                ↓ HTTPS / WebSocket
        Cloudflare Tunnel (URL pública)
                ↓
        Notebook: backend NestJS (PM2) → PostgreSQL + Redis (Docker)
                ↓ rede local
        Impressoras térmicas (caixa + cozinha)
```

- **Frontend**: Vercel (grátis).
- **Backend + banco + fila + impressoras**: notebook local.
- **Exposição**: Cloudflare Tunnel (sem abrir portas no roteador).

---

## 1. Backend sempre de pé com PM2

```bash
# Banco: gera o client e aplica as migrações existentes (produção)
npm run prisma:generate --workspace backend
npm run prisma:deploy --workspace backend

# Build de produção do backend
npm run build --workspace backend

# Instala o PM2 globalmente (uma vez)
sudo npm install -g pm2

# Sobe o backend pela config do repo
pm2 start ecosystem.config.js

# Salva a lista de processos e configura o início automático no boot
pm2 save
pm2 startup        # imprime um comando com sudo — copie e rode

# Comandos úteis
pm2 status
pm2 logs bacalhau-backend
pm2 restart bacalhau-backend
```

> O Postgres e o Redis sobem via `docker compose up -d` (ver README). Garanta que
> o `backend/.env` aponta para eles (`DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`).

### Cuidados com o notebook-servidor
- Nunca suspender/hibernar; manter na tomada (nobreak de preferência).
- Conexão via cabo de rede, não Wi-Fi.
- Docker e PM2 configurados para subir no boot.

---

## 2. Expor na internet com Cloudflare Tunnel

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

O comando imprime uma URL pública (ex: `https://algo-aleatorio.trycloudflare.com`).
A API fica em `<URL>/api` e o WebSocket na própria `<URL>`.

### Depois (com domínio no Cloudflare): Tunnel nomeado

URL fixa (ex: `api.seudominio.com.br`), sobrevive a reinícios e pode rodar como
serviço/PM2. Passos: `cloudflared login` → `cloudflared tunnel create bacalhau`
→ rota DNS → arquivo de config → `cloudflared tunnel run`.

---

## 3. Frontend na Vercel

1. Conectar o repositório na Vercel, **Root Directory = `frontend`**.
2. Variáveis de ambiente (Project Settings → Environment Variables):
   - `NEXT_PUBLIC_API_URL = https://<sua-url-tunnel>/api`
   - `NEXT_PUBLIC_WS_URL  = https://<sua-url-tunnel>`
3. Deploy. A cada `git push` na branch de produção, a Vercel publica sozinha.

### CORS no backend
No `backend/.env`, incluir a URL da Vercel em `CORS_ORIGINS`:

```
CORS_ORIGINS=https://seu-projeto.vercel.app
```

Reinicie o backend (`pm2 restart bacalhau-backend`) após alterar o `.env`.

> Com Quick Tunnel a URL muda a cada restart — então, ao reiniciar o tunnel,
> atualize `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WS_URL` na Vercel. Some quando
> migrarmos para tunnel nomeado com domínio.
