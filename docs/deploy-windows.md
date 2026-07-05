# Deploy no PC do caixa — Windows 10

> Guia para instalar o backend no **PC do caixa rodando Windows 10**.
> Arquitetura: backend NestJS roda aqui (`PRINT_WORKER=on`, serve API/WebSocket,
> enfileira e imprime), **Redis local** (via Memurai), **PostgreSQL no Supabase**
> (nuvem), exposição via **Cloudflare Tunnel** e frontend na **Vercel**.
> Versão Linux/Ubuntu deste guia: [`deploy.md`](deploy.md).

Onde disser **PowerShell (Admin)**: Iniciar → digite *PowerShell* → clique com o
botão direito → **Executar como administrador**.

Pré-requisito: o banco no Supabase já deve estar criado e você precisa da
**connection string da Session pooler (porta 5432)** — ver seção 1 de
[`deploy.md`](deploy.md).

---

## Atalho: script de setup

Com o repositório clonado (seção 3) e o Supabase pronto, o script automatiza a
maior parte:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-caixa.ps1
```

Ele instala Node 20, Memurai (Redis), dependências, cria o `backend\.env`
(que você preenche com a `DATABASE_URL` do Supabase), aplica as migrações, faz
o seed, builda, sobe o PM2 (com auto-start no login) e instala o `cloudflared` —
e imprime no fim os passos manuais (impressoras, tunnel e Vercel). Na primeira
execução ele para para você preencher a `DATABASE_URL`; rode de novo depois.

As seções abaixo detalham cada parte caso prefira fazer na mão.

---

## 1. Node.js 20 LTS

```powershell
winget install OpenJS.NodeJS.LTS
```

Feche e reabra o PowerShell e confirme:

```powershell
node -v   # v20.x
```

> Sem `winget`? Baixe o instalador **LTS** em <https://nodejs.org> e instale.

## 2. Redis local (Memurai)

O Redis não roda nativamente no Windows. O **Memurai** é compatível, gratuito
(Developer Edition) e instala como **serviço do Windows** (sobe no boot).

```powershell
winget install Memurai.MemuraiDeveloper
```

> Sem `winget`? Baixe em <https://www.memurai.com/get-memurai> (Developer Edition).

Confirme (deve responder `PONG`):

```powershell
memurai-cli ping
```

Escuta em `localhost:6379`, que é o que o `.env` espera. **Não** configure
`maxmemory` com despejo (eviction) — a fila guarda pedidos e despejar jobs
perderia pedidos.

## 3. Git + clonar o projeto

```powershell
winget install Git.Git
```

Reabra o PowerShell e clone (ex.: em `C:\bacalhau`):

```powershell
cd C:\
git clone https://github.com/RenatoOPF/bacalhau-manager.git bacalhau
cd bacalhau
npm ci
```

## 4. Configurar o `backend\.env`

```powershell
copy backend\.env.example backend\.env
notepad backend\.env
```

Preencha:

```
PORT=3001
CORS_ORIGINS=https://SEU-PROJETO.vercel.app

DATABASE_URL="postgresql://postgres.<ref>:SUA_SENHA@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require"

REDIS_HOST=localhost
REDIS_PORT=6379

PRINT_WORKER=on

PRINTER_CASHIER_INTERFACE=//localhost/Caixa
PRINTER_KITCHEN_INTERFACE=//localhost/Cozinha
PRINTER_WIDTH=48

JWT_SECRET=troque-por-um-segredo-forte
```

> Se a senha do Supabase tiver caracteres especiais (`@ : / # ? % &`), faça
> URL-encode (`@`→`%40`, `#`→`%23`...). Para evitar isso, gere uma senha só com
> letras e números em Supabase → Settings → Database → Reset database password.

## 5. Banco + build

O Supabase já está migrado, mas rode assim mesmo (gera o client e confirma):

```powershell
npm run prisma:generate --workspace backend
npm run prisma:deploy --workspace backend
npm run build --workspace backend
```

## 6. Backend sempre de pé (PM2 + boot automático)

```powershell
npm install -g pm2 pm2-windows-startup
pm2-startup install
pm2 start ecosystem.config.js
pm2 save
```

Verifique:

```powershell
pm2 status
pm2 logs bacalhau-backend
```

> O `pm2-windows-startup` faz o PM2 subir no **login** do Windows — então
> configure o PC para **login automático** no usuário do caixa. (Para um serviço
> que sobe antes do login, veja o projeto `pm2-installer`.)

## 7. Impressoras térmicas (Windows)

Duas formas de ligar cada impressora no `.env` (seção 4):

- **USB (via spooler do Windows)**: instale o driver, **compartilhe** a
  impressora (Propriedades → Compartilhamento → nome sem espaços, ex.: `Caixa`),
  e use `//localhost/Caixa`.
- **Rede (IP fixo)**: `tcp://192.168.0.50`.

Depois de ajustar o `.env`: `pm2 restart bacalhau-backend`.

## 8. Expor na internet — Cloudflare Tunnel

```powershell
winget install Cloudflare.cloudflared
```

Teste rápido (URL temporária, muda a cada reinício):

```powershell
cloudflared tunnel --url http://localhost:3001
```

Anote a URL `https://algo.trycloudflare.com`.

> Para uma URL **fixa** que sobe sozinha no boot, crie um *named tunnel* e
> instale como serviço (`cloudflared service install`) — recomendado quando
> tiver um domínio no Cloudflare.

## 9. Frontend na Vercel

No projeto da Vercel (Root Directory = `frontend`), configure:

- `NEXT_PUBLIC_API_URL = https://<url-do-tunnel>/api`
- `NEXT_PUBLIC_WS_URL  = https://<url-do-tunnel>`

Confirme que a URL da Vercel está em `CORS_ORIGINS` no `backend\.env`. Se
alterar o `.env`: `pm2 restart bacalhau-backend`.

---

## Checklist final

- [ ] `memurai-cli ping` → `PONG`
- [ ] `pm2 status` → `bacalhau-backend` **online**
- [ ] Frontend (Vercel) abre o cardápio consumindo a API via tunnel
- [ ] Pedido de teste **imprime** nas duas impressoras
      (`pm2 logs` mostra "Pedido #... impresso com sucesso")
- [ ] Reiniciar o PC → login automático → Memurai + PM2 + tunnel voltam sozinhos

## Cuidados com o PC do caixa

- **Nunca suspender/hibernar**: Configurações → Sistema → Energia → Suspender = **Nunca**.
- Login automático no usuário do caixa (para o PM2 subir no boot).
- Internet estável (fala com o Supabase) **e** rede/USB das impressoras.
- Nobreak/UPS de preferência.
