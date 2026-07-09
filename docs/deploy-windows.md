# Agente de impressão no PC do caixa — Windows 10

> Guia para instalar o **agente de impressão** no PC do caixa (Windows 10).
> Na arquitetura atual, o backend (API/WebSocket) roda na nuvem
> ([`deploy-cloud.md`](deploy-cloud.md)) e **enfileira** os pedidos; aqui roda
> só o **worker** (`dist/worker.js`), que consome a fila (Redis/Upstash) e
> imprime nas térmicas locais. O caixa faz **apenas conexões de saída** —
> não precisa de Redis local nem de túnel/exposição.

Onde disser **PowerShell (Admin)**: Iniciar → digite *PowerShell* → clique com o
botão direito → **Executar como administrador**.

Pré-requisitos (já prontos, do [`deploy-cloud.md`](deploy-cloud.md)):
- **Supabase** rodando — connection string da Session pooler (5432).
- **Upstash** criado — a `REDIS_URL` (`rediss://...`), a MESMA usada na VM.

---

## Atualizar uma instalação já existente

> Já rodou o setup? Para atualizar o código no PC do caixa, no PowerShell dentro
> da pasta do projeto (ex.: `C:\bacalhau`):

```powershell
cd C:\bacalhau
git pull
npm ci
npm run prisma:generate --workspace backend
npm run build --workspace backend
pm2 restart bacalhau-print-agent
```

As migrations do banco e o seed do admin rodam na **nuvem**, não aqui.

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

## 2. Git + clonar o projeto

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

## 3. Configurar o `backend\.env` (agente)

```powershell
copy backend\.env.agent.example backend\.env
notepad backend\.env
```

Preencha com os MESMOS `DATABASE_URL` (Supabase) e `REDIS_URL` (Upstash) da VM,
e as impressoras (seção 5):

```
DATABASE_URL="postgresql://postgres.<ref>:<senha>@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require"
REDIS_URL=rediss://default:<senha>@<endpoint>.upstash.io:6379

PRINTER_CASHIER_INTERFACE=//localhost/Caixa
PRINTER_KITCHEN_INTERFACE=//localhost/Cozinha
PRINTER_WIDTH=48
```

> O agente não serve API nem valida login — não precisa de `PORT`, `CORS_ORIGINS`
> nem `JWT_SECRET`. Deixe as interfaces vazias para **simular** a impressão (só
> loga) enquanto testa a conexão com a fila.

## 4. Gerar o Prisma Client + build

```powershell
npm run prisma:generate --workspace backend
npm run build --workspace backend
```

> Não rode `prisma:deploy`/`db:seed` aqui — o banco é migrado pela nuvem.

## 5. Impressoras térmicas (Windows)

Duas formas de ligar cada impressora no `.env` (seção 3):

- **USB (via spooler do Windows)**: instale o driver, **compartilhe** a
  impressora (Propriedades → Compartilhamento → nome sem espaços, ex.: `Caixa`),
  e use `//localhost/Caixa`.
- **Rede (IP fixo)**: `tcp://192.168.0.50`.

Depois de ajustar o `.env`: `pm2 restart bacalhau-print-agent`.

## 6. Agente sempre de pé (PM2 + boot automático)

```powershell
npm install -g pm2 pm2-windows-startup
pm2-startup install
pm2 start agent.config.js
pm2 save
```

Verifique:

```powershell
pm2 status                       # bacalhau-print-agent → online
pm2 logs bacalhau-print-agent    # deve logar "Agente de impressão no ar"
```

> O `pm2-windows-startup` faz o PM2 subir no **login** do Windows — configure o
> PC para **login automático** no usuário do caixa. (Para subir antes do login,
> veja o projeto `pm2-installer`.)

---

## Checklist final

- [ ] `pm2 status` → `bacalhau-print-agent` online
- [ ] `pm2 logs` mostra "Agente de impressão no ar — consumindo a fila"
- [ ] `REDIS_URL` e `DATABASE_URL` idênticos aos da VM
- [ ] Pedido de teste feito no site imprime os dois tickets (caixa + cozinha)
- [ ] PM2 configurado para subir no boot/login

---

> **Setup antigo (monolito):** versões anteriores rodavam o backend inteiro
> aqui, com Redis local (Memurai) e túnel. O script `scripts\setup-caixa.ps1`
> refere-se a esse modelo e **não** se aplica mais à arquitetura nuvem+agente.
