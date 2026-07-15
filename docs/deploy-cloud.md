# Deploy do backend na nuvem — Oracle Cloud (Always Free)

> Arquitetura atual: o **backend (API + WebSocket)** roda 24/7 numa VM grátis da
> Oracle Cloud e apenas **enfileira** os pedidos. O **PC do caixa** roda só o
> **agente de impressão** ([`deploy-windows.md`](deploy-windows.md)), que consome
> a fila e imprime — fazendo apenas conexões de saída (sem túnel).
>
> ```
> [Vercel] frontend ──HTTPS──► [Oracle VM] backend (PRINT_WORKER=off)
>                                   ├──► [Supabase] Postgres
>                                   └──► [Upstash] Redis (fila) ◄── [caixa] agente
> ```

Componentes gratuitos: **Supabase** (Postgres), **Upstash** (Redis),
**Oracle Cloud** (VM), **Caddy** (HTTPS automático via `sslip.io`), **Vercel**
(frontend).

---

## 1. Postgres — Supabase

Já configurado. Você precisa da connection string da **Session pooler (5432)** —
ver seção 1 de [`deploy.md`](deploy.md).

## 2. Redis — Upstash (fila BullMQ)

1. Crie conta em <https://upstash.com> → **Create Database** (Redis).
2. Escolha a região mais próxima (ex.: `sa-east-1` / São Paulo).
3. Na página do banco, copie a **Redis URL** no formato
   `rediss://default:<senha>@<endpoint>.upstash.io:6379`.

Esse mesmo valor (`REDIS_URL`) vai no `.env` da VM **e** do PC do caixa — é a
fila compartilhada. O `rediss://` já ativa TLS no código.

## 3. VM — Oracle Cloud Always Free

1. Crie conta em <https://cloud.oracle.com> (pede cartão só para verificação;
   a VM Always Free não cobra).
2. **Create Instance** → imagem **Ubuntu 22.04**, shape **Ampere A1 (ARM)**
   Always Free (ex.: 1 OCPU / 6 GB). Baixe a chave SSH.
3. Em **Networking → VCN → Security List**, adicione *Ingress Rules* liberando
   as portas **80** e **443** (origem `0.0.0.0/0`).
4. Conecte via SSH: `ssh -i chave.key ubuntu@<IP-PUBLICO>`.
5. A imagem Ubuntu da Oracle bloqueia portas no iptables local — libere também:
   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```

## 4. Node, código e build

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
git clone https://github.com/RenatoOPF/bacalhau-manager.git ~/bacalhau
cd ~/bacalhau
npm ci
```

Crie o `.env` a partir do modelo da nuvem e preencha:

```bash
cp backend/.env.cloud.example backend/.env
nano backend/.env
```

Preencha `CORS_ORIGINS` (URL da Vercel), `DATABASE_URL` (Supabase), `REDIS_URL`
(Upstash) e `JWT_SECRET`. Mantenha `PRINT_WORKER=off`.

```bash
npm run prisma:generate --workspace backend
npm run prisma:deploy  --workspace backend   # aplica migrations no Supabase
npm run db:seed        --workspace backend   # cria o admin (idempotente)
npm run build          --workspace backend
```

## 5. Backend sempre de pé (PM2)

```bash
sudo npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd    # rode o comando que ele imprimir (sobe no boot)
```

Confirme: `pm2 status` e `curl -s localhost:3001/api/menu` deve retornar JSON.

## 6. HTTPS automático — Caddy + sslip.io

O frontend na Vercel é HTTPS, então o backend também precisa ser (senão o
navegador bloqueia por *mixed content*). O `sslip.io` transforma o IP num
hostname (`<ip>.sslip.io`) e o Caddy pega um certificado Let's Encrypt sozinho —
sem comprar domínio.

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

Edite `/etc/caddy/Caddyfile` (troque `<IP>` pelo IP público, com hífens ou
pontos — ex.: `140.238.1.2.sslip.io`):

```
<IP>.sslip.io {
    reverse_proxy localhost:3001
}
```

```bash
sudo systemctl reload caddy
```

Teste: `https://<IP>.sslip.io/api/menu` deve responder JSON com cadeado válido.

## 7. Frontend — Vercel

No projeto da Vercel (Root Directory = `frontend`), configure as env vars:

- `NEXT_PUBLIC_API_URL = https://<IP>.sslip.io/api`
- `NEXT_PUBLIC_WS_URL  = https://<IP>.sslip.io`

Depois confirme que essa URL da Vercel está em `CORS_ORIGINS` no `backend/.env`
da VM. Se alterar o `.env`: `pm2 restart bacalhau-backend`.

## 8. PC do caixa — agente de impressão

Siga [`deploy-windows.md`](deploy-windows.md): o caixa roda só o worker,
apontando o `REDIS_URL`/`DATABASE_URL` para os mesmos Upstash/Supabase.

---

## Checklist final

- [ ] Upstash criado; `REDIS_URL` idêntico na VM e no caixa
- [ ] `pm2 status` → `bacalhau-backend` online
- [ ] `https://<IP>.sslip.io/api/menu` responde JSON (HTTPS válido)
- [ ] Vercel com `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WS_URL` corretos
- [ ] URL da Vercel em `CORS_ORIGINS`
- [ ] Agente de impressão rodando no caixa e imprimindo um pedido de teste

## Atualizar

```bash
cd ~/bacalhau && git pull && npm ci
npm run prisma:generate --workspace backend  # npm ci apaga o client gerado — sempre regerar
npm run prisma:deploy   --workspace backend  # se houver migration nova
npm run build           --workspace backend
pm2 restart bacalhau-backend
```
