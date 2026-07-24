# Agente de impressão no PC do caixa — Windows 10

> Guia para instalar o **agente de impressão** no PC do caixa (Windows 10).
> Na arquitetura atual, o backend (API/WebSocket) roda na nuvem
> ([`deploy-cloud.md`](deploy-cloud.md)) e **enfileira** os pedidos; aqui roda
> só o **worker** (`dist/worker.js`), que consome a fila (Redis na VM) e
> imprime nas térmicas locais.
>
> O Redis fica **fechado na VM** (ouve só em `localhost`) — o PC acessa via
> **túnel SSH**: uma conexão de saída criptografada, sem abrir porta na internet.
>
> ```
> [VM Oracle] Redis :6379 (localhost)
>      ▲
>      │ túnel SSH (porta local 6379 → VM :6379)
>      │
> [PC do caixa] agente de impressão → redis://127.0.0.1:6379
> ```

Onde disser **PowerShell (Admin)**: Iniciar → digite *PowerShell* → clique com o
botão direito → **Executar como administrador**.

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

## 3. Chave SSH da VM

O túnel SSH (seção 4) precisa da **mesma chave privada** usada para acessar a
VM Oracle. Copie o arquivo `.pem` para o PC e guarde-o em local seguro:

```
C:\bacalhau\keys\vm_key.pem
```

No PowerShell (Admin), restrinja as permissões do arquivo (necessário para o
OpenSSH não reclamar de permissões abertas):

```powershell
icacls C:\bacalhau\keys\vm_key.pem /inheritance:r /grant:r "$env:USERNAME:R"
```

Confirme que o cliente SSH está instalado (vem com o Windows 10 1803+):

```powershell
ssh -V   # deve mostrar OpenSSH_for_Windows...
```

> Sem SSH? Ative em Configurações → Aplicativos → Recursos opcionais → **Cliente
> OpenSSH**.

## 4. Túnel SSH para o Redis da VM

O Redis da VM só ouve em `localhost` — o agente precisa de um túnel que
redirecione a porta local `6379` para o Redis da VM.

### 4a. Testar manualmente (uma vez)

```powershell
ssh -N -L 6379:localhost:6379 -i C:\bacalhau\keys\vm_key.pem ubuntu@137.131.162.0
```

Mantenha o PowerShell aberto (o túnel fica ativo enquanto o processo roda).
Em outro PowerShell, confirme a conexão:

```powershell
# Requer redis-cli instalado; se não tiver, pule para o teste do agente.
redis-cli -p 6379 -a <SENHA_DO_REDIS> ping   # PONG
```

### 4b. Túnel automático no boot (Tarefa Agendada)

Crie o script de túnel em `C:\bacalhau\tunnel.ps1`:

```powershell
while ($true) {
    ssh -N `
        -o "ServerAliveInterval=30" `
        -o "ServerAliveCountMax=3" `
        -o "ExitOnForwardFailure=yes" `
        -L 6379:localhost:6379 `
        -i C:\bacalhau\keys\vm_key.pem `
        ubuntu@137.131.162.0
    Start-Sleep -Seconds 5   # reconecta automaticamente se cair
}
```

Registre como Tarefa Agendada (PowerShell Admin), executando **ao fazer login**,
na conta do caixa:

```powershell
$action  = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-WindowStyle Hidden -File C:\bacalhau\tunnel.ps1"

$trigger = New-ScheduledTaskTrigger -AtLogOn

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
    -TaskName "Redis-SSH-Tunnel" `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -RunLevel Highest `
    -Force
```

Para iniciar agora sem reiniciar:

```powershell
Start-ScheduledTask -TaskName "Redis-SSH-Tunnel"
```

> **Senha do Redis:** guardada na VM em `/home/ubuntu/redis-password.txt`.
> Leia com: `ssh bacalhau-vm "cat /home/ubuntu/redis-password.txt"`

## 5. Configurar o `backend\.env` (agente)

```powershell
copy backend\.env.agent.example backend\.env
notepad backend\.env
```

Preencha (use a **mesma** `DATABASE_URL` do Supabase que está na VM):

```
DATABASE_URL="postgresql://postgres.<ref>:<senha>@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require"
REDIS_URL=redis://default:<SENHA_DO_REDIS>@127.0.0.1:6379

PRINTER_CASHIER_INTERFACE=//localhost/Caixa
PRINTER_KITCHEN_INTERFACE=//localhost/Cozinha
PRINTER_WIDTH=48
```

> A `REDIS_URL` aponta para `127.0.0.1:6379` (porta local do túnel SSH).
> O túnel do passo 4 precisa estar ativo para o agente funcionar.
>
> O agente não serve API — não precisa de `PORT`, `CORS_ORIGINS` nem `JWT_SECRET`.
> Deixe as interfaces vazias para **simular** a impressão enquanto testa.

## 6. Gerar o Prisma Client + build

```powershell
npm run prisma:generate --workspace backend
npm run build --workspace backend
```

> Não rode `prisma:deploy`/`db:seed` aqui — o banco é migrado pela nuvem.

## 7. Impressoras térmicas (Windows)

Duas formas de ligar cada impressora no `.env` (seção 5):

- **USB (via spooler do Windows)**: instale o driver, **compartilhe** a
  impressora (Propriedades → Compartilhamento → nome sem espaços, ex.: `Caixa`),
  e use `//localhost/Caixa`.
- **Rede (IP fixo)**: `tcp://192.168.0.50`.

Depois de ajustar o `.env`: `pm2 restart bacalhau-print-agent`.

## 8. Agente sempre de pé (PM2 + boot automático)

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

- [ ] Chave SSH copiada para `C:\bacalhau\keys\vm_key.pem` com permissões corretas
- [ ] Tarefa Agendada `Redis-SSH-Tunnel` criada e rodando
- [ ] `REDIS_URL=redis://default:<senha>@127.0.0.1:6379` no `backend\.env`
- [ ] `pm2 status` → `bacalhau-print-agent` online
- [ ] `pm2 logs` mostra "Agente de impressão no ar — consumindo a fila"
- [ ] Pedido de teste feito no site imprime os dois tickets (caixa + cozinha)
- [ ] PM2 configurado para subir no boot/login

---

> **Setup antigo (monolito):** versões anteriores rodavam o backend inteiro
> aqui, com Redis local (Memurai) e fila no Upstash. O script `scripts\setup-caixa.ps1`
> refere-se a esse modelo e **não** se aplica mais à arquitetura nuvem+agente.
