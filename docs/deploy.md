# Deploy — produção

> **Onde rodar:** todo este guia roda **no notebook-servidor do restaurante**
> (não na máquina de desenvolvimento). O backend, o banco e a fila ficam nesse
> notebook; o frontend fica na Vercel.
>
> **Alvo:** Ubuntu Server (headless), instalação **nativa** (sem Docker),
> pensado para hardware modesto (ex.: Atom 64 bits + 4GB RAM).

## Atalho: script de setup

Com o repositório clonado no notebook-servidor, a maior parte é automática:

```bash
bash scripts/setup-server.sh
```

Ele instala Node 20, PostgreSQL e Redis nativos, cria o banco, prepara um swap
de segurança, instala dependências, builda o backend, sobe o PM2 e instala o
`cloudflared` — e imprime no fim os 3 passos manuais (boot do PM2, tunnel e
Vercel). As seções abaixo detalham cada parte caso prefira fazer na mão.

---

## Arquitetura de produção

```
Cliente → Vercel (frontend Next.js)
                ↓ HTTPS / WebSocket
        Cloudflare Tunnel (URL pública)
                ↓
        Notebook (Ubuntu Server):
          backend NestJS (PM2) → PostgreSQL + Redis (nativos)
                ↓ rede local
        Impressoras térmicas (caixa + cozinha)
```

- **Frontend**: Vercel (grátis) — não roda no notebook.
- **Backend + banco + fila + impressoras**: notebook local.
- **Exposição**: Cloudflare Tunnel (sem abrir portas no roteador).

---

## 1. Sistema e serviços (instalação nativa)

```bash
# Node.js 20 LTS (a versão do apt costuma ser antiga)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PostgreSQL + Redis nativos
sudo apt-get update
sudo apt-get install -y postgresql redis-server
sudo systemctl enable --now postgresql redis-server

# Banco e usuário (casa com o DATABASE_URL padrão do .env.example)
sudo -u postgres psql -c "CREATE USER bacalhau WITH PASSWORD 'bacalhau';"
sudo -u postgres psql -c "CREATE DATABASE bacalhau OWNER bacalhau;"
```

> Por padrão o PostgreSQL do Ubuntu já aceita conexão por senha em
> `127.0.0.1`/`localhost` (pg_hba `scram-sha-256`), que é como o Prisma conecta.

### Ajustes para 4GB de RAM
- **Swap de segurança** (o script cria 2GB automaticamente se não houver):
  ```bash
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```
- **PostgreSQL** enxuto em `/etc/postgresql/<versão>/main/postgresql.conf`:
  `shared_buffers = 256MB`, `max_connections = 20`. Reinicie:
  `sudo systemctl restart postgresql`.
- **Redis**: NÃO configurar `maxmemory` com despejo (eviction) — ele guarda a
  fila de pedidos (BullMQ) e despejar jobs perderia pedidos. Deixe o padrão.
- Use **Ubuntu Server headless** (sem ambiente gráfico) para sobrar RAM.

### Cuidados com o notebook-servidor
- Nunca suspender/hibernar; manter na tomada (nobreak de preferência).
- Conexão via cabo de rede, não Wi-Fi.
- Serviços configurados para subir no boot (PostgreSQL, Redis e PM2).

---

## 2. Backend sempre de pé com PM2

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

> Garanta que o `backend/.env` aponta para os serviços nativos
> (`DATABASE_URL`, `REDIS_HOST=localhost`, `REDIS_PORT=6379`) e que `JWT_SECRET`
> e a senha do admin foram trocados.

---

## 3. Expor na internet com Cloudflare Tunnel

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

## 4. Frontend na Vercel

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
