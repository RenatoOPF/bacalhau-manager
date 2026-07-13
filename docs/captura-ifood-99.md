# Captura de pedidos do iFood / 99 via "impressora fake"

> Guia executável **no PC do caixa (Windows)**. Objetivo desta fase: montar a
> impressora virtual e **coletar amostras cruas** das impressões do iFood/99.
> O parser por plataforma + criação do pedido vêm depois, com base nas amostras.

## Como funciona

O agente do caixa já sobe um servidor TCP raw (`CaptureService`) na porta
`CAPTURE_PORT` (padrão `9100`). Criamos uma impressora do Windows cujo porto é um
**Standard TCP/IP Port → 127.0.0.1:9100**; ao apontar o app do iFood/99 para ela,
cada impressão chega ao agente como bytes crus e é salva em
`backend\captures\` (`.bin` = bytes originais, `.txt` = preview de texto).

```
App iFood/99 ──imprime──► [impressora "iFood Captura"] ──127.0.0.1:9100──► agente ──► captures\*.bin
```

---

## Passo 1 — Ativar/confirmar o capturador

Garanta que `backend\.env` tem `CAPTURE_PORT=9100`, então atualize e reinicie o
agente:

```powershell
cd C:\bacalhau
git pull
npm run build --workspace backend
pm2 restart bacalhau-print-agent
pm2 logs bacalhau-print-agent --lines 20
```

Nos logs deve aparecer:

```
Captura ouvindo em 0.0.0.0:9100 — salvando em C:\bacalhau\backend\captures
```

Confirme a porta:

```powershell
Test-NetConnection 127.0.0.1 -Port 9100    # TcpTestSucceeded : True
```

## Passo 2 — Criar a impressora fake (PowerShell **como Administrador**)

```powershell
Add-PrinterPort -Name "Bacalhau9100" -PrinterHostAddress "127.0.0.1" -PortNumber 9100
Add-Printer -Name "iFood Captura" -DriverName "Generic / Text Only" -PortName "Bacalhau9100"
```

Se reclamar que o driver não existe:

```powershell
Add-PrinterDriver -Name "Generic / Text Only"
```

e rode o `Add-Printer` de novo.

> **Se o preview (Passo 4) vier embaralhado:** o app provavelmente imprime em
> ESC/POS (gráfico), não texto puro. Nesse caso, recrie a impressora usando o
> **mesmo driver da térmica** que o iFood/99 já usa hoje, mantendo o porto
> `Bacalhau9100`. Assim capturamos o ESC/POS cru para decodificar.

## Passo 3 — Apontar o app e imprimir

Nas configurações de impressão do **app do iFood** (ou da **99**), selecione a
impressora **"iFood Captura"**. Depois force uma impressão — de preferência
"reimprimir último pedido" ou um pedido de teste real.

## Passo 4 — Conferir a amostra

```powershell
dir C:\bacalhau\backend\captures
Get-Content (Get-ChildItem C:\bacalhau\backend\captures\*.txt | Sort-Object LastWriteTime | Select-Object -Last 1)
```

Verifique se o texto está legível (nº do pedido, cliente, itens, endereço,
total) ou embaralhado.

## Passo 5 — Gerar amostra compartilhável (para desenvolver o parser)

O `.bin` cru é a fonte de verdade. Gere um base64 dele (preserva os bytes
exatos) para análise no PC de dev:

```powershell
$bin = Get-ChildItem C:\bacalhau\backend\captures\*.bin | Sort-Object LastWriteTime | Select-Object -Last 1
[Convert]::ToBase64String([IO.File]::ReadAllBytes($bin.FullName)) | Set-Content C:\bacalhau\amostra-captura.b64.txt
```

> ⚠️ A amostra contém dados reais do pedido (cliente/endereço). **Não** commite
> os arquivos de `captures\` nem o `.b64` no Git (já estão/ficam ignorados).
> Compartilhe o conteúdo do `.b64` por um canal privado para o parser ser
> construído; o dev decodifica de volta os bytes originais.

---

## Anotar ao coletar (ajuda a montar o parser)

- Plataforma da amostra: **iFood** ou **99**.
- Driver usado: `Generic / Text Only` ou o térmico (qual modelo).
- Se veio 1 impressão só ou várias (algumas plataformas imprimem 2 vias).
