# Arquitetura — Bacalhau & Cia Manager

Sistema de gestão para o restaurante Bacalhau & Cia. Monorepo npm com workspaces `backend` e `frontend`.

---

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Topologia de deploy](#2-topologia-de-deploy)
3. [Banco de dados (Prisma)](#3-banco-de-dados-prisma)
4. [Backend — módulos NestJS](#4-backend--módulos-nestjs)
5. [Fila e impressão](#5-fila-e-impressão)
6. [Captura externa (iFood / 99Food)](#6-captura-externa-ifood--99food)
7. [Frontend — Next.js 14](#7-frontend--nextjs-14)
8. [Fluxo completo de um pedido](#8-fluxo-completo-de-um-pedido)
9. [Variáveis de ambiente](#9-variáveis-de-ambiente)

---

## 1. Visão geral

```
bacalhau-manager/
├── backend/              # NestJS + Prisma + BullMQ + Socket.IO
├── frontend/             # Next.js 14 (App Router) + TailwindCSS
├── docker-compose.yml    # PostgreSQL 16 + Redis 7 (dev local)
├── ecosystem.config.js   # PM2 — backend na VM (uso legado)
├── agent.config.js       # PM2 — agente de impressão (PC do caixa)
├── backend/fly.toml      # Configuração do Fly.io (deploy atual)
└── backend/Dockerfile    # Imagem Docker usada pelo Fly.io
```

**Stack:**

| Camada | Tecnologia |
|--------|-----------|
| API | NestJS (TypeScript), porta 3001 |
| Banco | PostgreSQL via Prisma ORM |
| Fila | BullMQ + Redis (dev local — removido em produção) |
| Tempo real | Socket.IO |
| Frontend | Next.js 14 App Router + TailwindCSS + React Query |
| Impressão | ESC/POS via `node-thermal-printer` |

---

## 2. Topologia de deploy

```
┌─────────────────────────────────────────────────────────┐
│              NUVEM (Fly.io — região GRU)                │
│                                                         │
│  ┌─────────────────┐    ┌──────────────────────────┐   │
│  │  NestJS Backend │────│ Supabase (AWS sa-east-1)  │   │
│  │  (API + WS)     │    │ PostgreSQL                │   │
│  │  PRINT_WORKER=  │    └──────────────────────────┘   │
│  │       off       │    (Redis removido — impressão     │
│  └────────┬────────┘     via Socket.IO direto)          │
└───────────┼─────────────────────────────────────────────┘
            │ Socket.IO (wss://)
            │
┌───────────┼─────────────────────────────────────────────┐
│           │          REDE LOCAL DO RESTAURANTE          │
│           │                                             │
│  ┌────────▼────────┐           ┌─────────────────────┐ │
│  │   PC do Caixa   │           │   PC da Cozinha     │ │
│  │                 │  TCP:9100 │                     │ │
│  │  PrintAgentSvc  ├──────────►│  socat bridge       │ │
│  │  (worker.ts)    │           │  /dev/usb/lp1       │ │
│  │                 │           │                     │ │
│  │  Impressora     │           │  Impressora térmica │ │
│  │  do caixa       │           │  da cozinha         │ │
│  └─────────────────┘           └─────────────────────┘ │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                   VERCEL (Frontend)                     │
│  Next.js — deploy automático via push na main           │
│  NEXT_PUBLIC_API_URL → backend Fly.io                   │
└─────────────────────────────────────────────────────────┘
```

### PC do caixa

- Roda o **agente de impressão** (`dist/worker.js`) gerenciado pelo PM2 (`agent.config.js`)
- O `PrintAgentService` conecta ao backend via Socket.IO e escuta eventos de impressão
- Impressoras conectadas localmente (USB, Bluetooth ou TCP)
- Também roda o `CaptureService` (servidor TCP que recebe ESC/POS do iFood/99Food)

### PC da cozinha

- Roda apenas o **socat bridge** como processo avulso (não é PM2):
  ```bash
  socat TCP-LISTEN:9100,reuseaddr,fork OPEN:/dev/usb/lp1,wronly
  ```
- Expõe a impressora USB (`/dev/usb/lp1`) na porta TCP 9100
- O agente do caixa envia os bytes ESC/POS diretamente para `IP-cozinha:9100`

### Backend na nuvem (Fly.io)

- App `bacalhau-backend`, região `gru` (São Paulo), domínio `api.bacalhaueciamaceio.com.br`
- DNS gerenciado pelo Cloudflare
- Deploy manual: `~/.fly/bin/flyctl deploy --app bacalhau-backend` (dentro de `backend/`)
- Volume persistente `/app/uploads` para fotos do cardápio
- Roda com `PRINT_WORKER=off` — não imprime diretamente
- Emite eventos Socket.IO (`print:cashier`, `print:kitchen`) para o agente do caixa
- Redis/BullMQ **removidos** — impressão feita via Socket.IO direto (sem Redis em produção)
- O `OrdersProcessor` (BullMQ) existe no código mas não é utilizado na arquitetura atual

---

## 3. Banco de dados (Prisma)

### Convenções

- Valores monetários em **centavos** (`Int`) — nunca `Float`
- Quantidades de estoque em **milésimos** (`Int`): 1000 milli = 1 unidade/porção/kg
- `*At` — campos `DateTime` (createdAt, paidAt, cashierPrintedAt…)
- `*Cents` — valor monetário (priceCents, totalCents, costCents…)
- `*Milli` — quantidade de estoque (qtyMilli, alertMilli, deltaMilli…)

### Entidades principais

#### Order

Campo | Tipo | Descrição
------|------|----------
`id` | CUID | Chave interna
`protocol` | Int unique | Link de rastreamento público (nunca reinicia)
`dailyNumber` | Int | Número exibido no caixa/cozinha (reinicia por dia ou ao fechar caixa)
`channel` | Enum | OWN / IFOOD / NOVENTA_NOVE / GAMI
`externalId` | String? | Localizador do iFood ou código do 99Food (usado para dedup)
`status` | Enum | RECEIVED → IN_PREPARATION → READY → OUT_FOR_DELIVERY → DELIVERED / CANCELED
`paymentMethod` | Enum | CASH / PIX / CARD / ONLINE
`paymentStatus` | Enum | PENDING / PAID
`paidAt` | DateTime? | Quando o pagamento foi registrado (base do fechamento diário)
`totalCents` | Int | Total (itens + taxa entrega − desconto)
`deliveryFeeCents` | Int | Taxa cobrada do cliente
`discountCents` | Int | Desconto concedido
`courierId` | FK? | Entregador (Employee)
`courierFeeCents` | Int | Repasse ao entregador (snapshot no momento da designação)
`neighborhoodId` | FK? | Bairro (para taxa de entrega)
`cashierPrintedAt` | DateTime? | Confirmação de impressão pelo agente (caixa)
`kitchenPrintedAt` | DateTime? | Confirmação de impressão pelo agente (cozinha)

#### OrderItem

Guarda **snapshots** para preservar o histórico mesmo que o cardápio seja alterado.

Campo | Tipo | Descrição
------|------|----------
`menuItemId` | FK? | Referência (nullable SetNull — item pode ser deletado)
`nameSnapshot` | String | Nome do prato no momento do pedido
`optionNameSnapshot` | String? | Tamanho/opção (ex.: "Individual", "Inteira")
`priceCents` | Int | Preço unitário no momento do pedido
`unitCostCents` | Int | Custo unitário calculado no momento do pedido
`quantity` | Int | Quantidade
`notes` | String? | Observações do item

#### StockItem / StockLink

- `StockItem.qtyMilli` — saldo atual em milésimos (pode ser negativo; não bloqueia venda)
- `StockLink` — vínculo prato/opção → insumo com `qtyMilli` de consumo por venda
  - Insumos de itens com opção: `qtyMilli` refere-se à porção inteira; meia porção desconta metade
- `StockMovement` — auditoria de cada alteração (Venda, Estorno, Reposição, Produção, Ajuste)
- `StockItem.source` — matéria-prima de um insumo derivado (ex.: Bacalhau Desfiado ← Bacalhau kg)
- `StockItem.substitute` — fallback quando estoque zerado, com `substituteFactor`

#### Employee

- `role`: ADMIN / MANAGER / KITCHEN / DELIVERY
- Senha com bcrypt, campo `active` para soft-delete
- Relação `deliveries: Order[]` (como entregador)

---

## 4. Backend — módulos NestJS

### Mapa de módulos

```
AppModule
├── AuthModule          JWT login, guards, decorators
├── EmployeesModule     CRUD funcionários
├── MenuModule          Categorias, itens, opções, upload imagem
├── OrdersModule        Ciclo completo do pedido
├── CashModule          Pagamentos, fechamento diário
├── ReportsModule       KPIs, DRE, ABC, margens
├── StockModule         Insumos, vínculos, produção, consumo/estorno
├── IntegrationsModule  Captura ESC/POS do iFood / 99Food
├── PrintingModule      ESC/POS + configuração de impressoras
├── QueueModule         BullMQ (fila de impressão)
├── RealtimeModule      Gateway Socket.IO
├── DeliveryModule      Bairros, zonas por km
├── RecipeModule        Fichas técnicas
├── CustomersModule     Clientes + endereços
├── AccountsModule      Contas de pagamento
├── ExpensesModule      Despesas
└── PrismaModule        PrismaService global
```

### Módulos críticos em detalhe

#### OrdersModule

`OrdersService.create()` coordena todo o fluxo de criação:
1. Valida itens e calcula total
2. Cria `Order` + `OrderItem[]` com snapshots
3. Baixa estoque via `StockService.consumeForOrder()`
4. Auto-salva cliente se houver telefone
5. Emite `print:cashier` e `print:kitchen` via `RealtimeGateway`
6. Emite `order:created` via Socket.IO

#### StockModule

`consumeForOrder(order)` — resolve o consumo de cada insumo:
- Casamento por vínculo direto (`menuItemId` / `optionId`)
- Fallback por texto normalizado (para pedidos iFood sem `menuItemId`)
- Suporte a tamanhos (Inteira = 100%, Meia / Individual = 50%)
- Complementos extras nas `notes` do item
- Substitutos automáticos quando insumo zerado

`buildCostEstimator()` — calcula CMV por item:
```
custo = Σ( round(qtyMilli × fator × costCents / 1000) ) + extraCostCents × fator
```
Cacheado por 2 minutos para evitar queries repetidas.

#### IntegrationsModule

Captura e parseia comandas ESC/POS de plataformas externas. Ver seção 6.

---

## 5. Fila e impressão

### Arquitetura geral

```
Novo pedido criado
      │
      ▼
RealtimeGateway
  .emitPrintCashier(order)  ──► Socket.IO evento 'print:cashier'
  .emitPrintKitchen(order)  ──► Socket.IO evento 'print:kitchen'
      │
      ▼
PC do Caixa — PrintAgentService
      │
      ├── printCashierTicket(order) ──► Impressora do caixa (USB/BT/TCP)
      │
      └── printKitchenTicket(order) ──► IP-cozinha:9100 (TCP)
                                              │
                                              ▼
                                         socat bridge
                                         /dev/usb/lp1
                                              │
                                              ▼
                                    Impressora da cozinha
```

### PrintAgentService (`print-agent.service.ts`)

Roda no **PC do caixa** como parte do `WorkerModule`. É um cliente Socket.IO que:

- Conecta ao backend via `BACKEND_URL` no `onModuleInit()`
- Escuta `print:cashier` → chama `PrintingService.printCashierTicket(order)`
- Escuta `print:kitchen` → chama `PrintingService.printKitchenTicket(order)`
- Retry automático: até 5 tentativas com 10s de intervalo entre cada
- Após sucesso: emite `print:confirmed { orderId, target }` de volta ao backend

### RealtimeGateway (`realtime.gateway.ts`)

Eventos Socket.IO gerenciados:

| Direção | Evento | O que faz |
|---------|--------|-----------|
| Emite | `order:created` | Novo pedido chegou (caixa atualiza fila) |
| Emite | `order:status` | Status do pedido mudou (caixa + cliente rastreiam) |
| Emite | `print:cashier` | Solicita impressão do ticket do caixa |
| Emite | `print:kitchen` | Solicita impressão do ticket da cozinha |
| Recebe | `print:confirmed` | Agente confirmou impressão → grava `cashierPrintedAt` / `kitchenPrintedAt` no banco |
| Emite | `order:print-confirmed` | Frontend atualiza ícone de impressão |

### PrintingService (`printing.service.ts`)

- Usa `node-thermal-printer` para gerar bytes ESC/POS
- Suporta até 2 impressoras de cozinha (`PRINTER_KITCHEN_INTERFACE` + `PRINTER_KITCHEN_INTERFACE_2`)
- **Keep-alive Bluetooth**: pulso a cada 9 minutos para evitar que a impressora desligue por inatividade
- Largura configurável via `PRINTER_WIDTH` (padrão: 48 colunas)

**Ticket do caixa** (`printCashierTicket`): nome do cliente, endereço completo, itens com preços, taxa de entrega, total, forma de pagamento.

**Ticket da cozinha** (`printKitchenTicket`): número do pedido (tamanho duplo), nome do cliente, itens com observações — sem endereço ou dados financeiros.

### BullMQ (fila de backup)

Existe no código mas **não é utilizado na arquitetura atual de produção**:
- `ORDERS_QUEUE` com jobs `PRINT_CASHIER_JOB` e `PRINT_KITCHEN_JOB`
- 5 tentativas, backoff fixo de 10s
- `OrdersProcessor` consumiria a fila se `PRINT_WORKER=on` no backend
- Ativo apenas em dev local ou se o agente Socket.IO não estiver disponível

### Socat bridge (PC da cozinha)

Processo avulso (não gerenciado pelo PM2) iniciado manualmente ou no boot:

```bash
# ~/kitchen-printer-bridge.sh
socat TCP-LISTEN:9100,reuseaddr,fork OPEN:/dev/usb/lp1,wronly
```

- Escuta na porta TCP 9100
- Cada conexão entrante abre `/dev/usb/lp1` e encaminha os bytes
- Log de erros em `/tmp/socat.log`
- A flag `reuseaddr` permite reiniciar sem aguardar o timeout do socket
- A flag `fork` suporta conexões simultâneas (uma por job de impressão)

### Como verificar se um pedido foi impresso na cozinha

Consultar o campo `kitchenPrintedAt` no banco:

```sql
SELECT protocol, status, "cashierPrintedAt", "kitchenPrintedAt"
FROM "Order"
WHERE protocol = <numero>;
```

- `null` → agente não confirmou (não imprimiu ou `print:confirmed` não chegou ao backend)
- data preenchida → agente imprimiu e confirmou com sucesso

---

## 6. Captura externa (iFood / 99Food)

### Como funciona

A plataforma (iFood ou 99Food) imprime a comanda em uma **impressora virtual** configurada no PC do caixa. O `CaptureService` atua como essa impressora — é um servidor TCP que recebe os bytes ESC/POS crus.

```
App do iFood/99Food
      │
      │ imprime comanda (ESC/POS raw)
      ▼
CaptureService (TCP :9100 no caixa)
      │
      │ salva .bin + .txt preview
      │ POST /api/integrations/capture (base64)
      ▼
IntegrationsService (backend)
      │
      ├── Decodifica ESC/POS (CP860 → texto)
      ├── Detecta plataforma (iFood ou 99Food)
      ├── Parseia: localizador, itens, endereço, pagamento
      ├── Dedup: busca Order por (channel, externalId)
      ├── Fuzzy match de bairro
      ├── Cria Order + OrderItems (snapshots)
      ├── Emite print:cashier + print:kitchen
      └── Emite order:created
```

### Parsers

**iFood parser** (`ifood.parser.ts`):
- Detecta por "iFood" nas primeiras 6 linhas
- Extrai: "Localizador:", "PEDIDO:", telefone, itens `Nx NOME R$XX,XX`, taxa de entrega, status de pagamento

**99Food parser** (`noventa-nove.parser.ts`):
- Detecta por "99Food" nas primeiras 8 linhas
- Extrai: `#NNNNN`, "Localizador:", telefone, endereço, itens com sub-itens indentados (opções)

### Deduplicação

Antes de criar o pedido, busca por `(channel, externalId)`. Se já existir, retorna o pedido existente sem criar duplicata. Isso permite reimprimir a comanda no iFood sem gerar pedido duplicado.

---

## 7. Frontend — Next.js 14

### Estrutura de rotas

| Rota | Acesso | Função |
|------|--------|--------|
| `/` | Público | Cardápio + carrinho + checkout |
| `/pedido/[protocol]` | Público | Rastreamento em tempo real |
| `/login` | Público | Autenticação → redireciona por role |
| `/cozinha` | Público | Display da fila da cozinha (sem dados pessoais) |
| `/admin` | ADMIN/MANAGER | Fila de pedidos do dia |
| `/admin/balcao` | ADMIN/MANAGER | PDV manual (balcão/telefone) |
| `/admin/caixa` | ADMIN/MANAGER | Registrar pagamentos + fechar caixa |
| `/admin/cardapio` | ADMIN/MANAGER | CRUD cardápio completo |
| `/admin/estoque` | ADMIN/MANAGER | Insumos, alertas, produção |
| `/admin/fichas-tecnicas` | ADMIN/MANAGER | Fichas técnicas por prato |
| `/admin/clientes` | ADMIN/MANAGER | Cadastro + histórico + mapa |
| `/admin/funcionarios` | ADMIN | CRUD funcionários + roles |
| `/admin/entregas` | ADMIN/MANAGER | Bairros + zonas de taxa |
| `/admin/despesas` | ADMIN/MANAGER | Despesas + contas financeiras |
| `/admin/relatorios` | ADMIN/MANAGER | KPIs, DRE, margens, picos |
| `/entregador` | DELIVERY | Pedidos atribuídos + atualizar status |

### lib/api.ts

Único ponto de chamadas HTTP. Centraliza:
- Token JWT em `localStorage` (`bacalhau_token`)
- Header `Authorization: Bearer <token>` em todas as requisições autenticadas
- Função `request<T>(path, init?)` com tratamento de erro (`ApiError`)
- Todos os tipos compartilhados (`Order`, `MenuItem`, `OrderItem`, etc.)

### Socket.IO no frontend

Páginas que usam Socket.IO em tempo real:

| Página | Eventos escutados | Ação |
|--------|------------------|------|
| `/admin` | `order:created`, `order:status` | Invalida query da fila |
| `/admin/caixa` | `order:created` | Invalida pendências de pagamento |
| `/pedido/[protocol]` | `order:status` | Atualiza pipeline de status |

Padrão usado:
```tsx
useEffect(() => {
  const socket = io(NEXT_PUBLIC_WS_URL);
  socket.on('order:created', () => queryClient.invalidateQueries(['orders']));
  return () => socket.disconnect();
}, []);
```

---

## 8. Fluxo completo de um pedido

```
1. CLIENTE FAZ PEDIDO
   └─ GET /api/menu → lista cardápio
   └─ POST /api/orders → OrdersService.create()
         ├─ Cria Order (status=RECEIVED, dailyNumber=N)
         ├─ Cria OrderItem[] com snapshots de nome/preço/custo
         ├─ StockService.consumeForOrder() → baixa estoque
         ├─ Auto-salva cliente (se telefone informado)
         ├─ emit 'print:cashier' → PrintAgentService imprime ticket do caixa
         ├─ emit 'print:kitchen' → PrintAgentService envia para IP-cozinha:9100
         └─ emit 'order:created' → caixa vê em tempo real

2. IMPRESSÃO
   └─ PrintAgentService recebe 'print:cashier'
         ├─ PrintingService.printCashierTicket() → impressora do caixa
         └─ emit 'print:confirmed' { target: 'cashier' }
               └─ RealtimeGateway grava cashierPrintedAt

   └─ PrintAgentService recebe 'print:kitchen'
         ├─ PrintingService.printKitchenTicket() → TCP IP-cozinha:9100
         │     └─ socat → /dev/usb/lp1 → impressora física
         └─ emit 'print:confirmed' { target: 'kitchen' }
               └─ RealtimeGateway grava kitchenPrintedAt

3. CAIXA REGISTRA PAGAMENTO
   └─ PATCH /api/cash/:id/pay
         └─ paidAt = now, paymentStatus = PAID

4. ENTREGA
   └─ PATCH /api/orders/:id/delivery { courierId, courierFeeCents }
         └─ Order.status = OUT_FOR_DELIVERY
         └─ emit 'order:status' → entregador vê no /entregador

   └─ PATCH /api/orders/:id/status { status: 'DELIVERED' }
         └─ emit 'order:status' → cliente vê no /pedido/[protocol]

5. CLIENTE RASTREIA
   └─ GET /api/orders/track/:protocol (polling inicial)
   └─ Socket.IO 'order:status' (tempo real)
         └─ Pipeline: Recebido → Em preparo → Pronto → Saiu → Entregue
```

---

## 9. Variáveis de ambiente

### Backend — dev local

```env
PORT=3001
CORS_ORIGINS=http://localhost:3000
DATABASE_URL=postgresql://postgres:bacalhau@localhost:5432/bacalhau
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=troque-em-producao
PRINT_WORKER=on
PRINTER_CASHIER_INTERFACE=
PRINTER_KITCHEN_INTERFACE=
PRINTER_WIDTH=48
```

### Backend — nuvem (Fly.io)

```env
PORT=8080
CORS_ORIGINS=https://www.bacalhaueciamaceio.com.br
DATABASE_URL=postgresql://...supabase.com/postgres?sslmode=require
JWT_SECRET=<segredo-forte>
INTEGRATION_KEY=<chave-longa>
PRINT_WORKER=off
TZ=America/Maceio
```

> Redis não é necessário em produção. O `fly.toml` define PORT, PRINT_WORKER e TZ diretamente.

### Agente de impressão — PC do caixa

```env
DATABASE_URL=postgresql://...supabase.com/postgres?sslmode=require
BACKEND_URL=https://api.bacalhaueciamaceio.com.br
PRINTER_CASHIER_INTERFACE=//localhost/Caixa
PRINTER_KITCHEN_INTERFACE=192.168.1.102:9100
PRINTER_KITCHEN_INTERFACE_2=
PRINTER_WIDTH=48
CAPTURE_PORT=9100
CAPTURE_DIR=./captures
INTEGRATION_URL=https://api.bacalhaueciamaceio.com.br/api
INTEGRATION_KEY=<mesma-chave-do-backend>
```

### Frontend — Vercel

```env
NEXT_PUBLIC_API_URL=https://api.bacalhaueciamaceio.com.br/api
NEXT_PUBLIC_WS_URL=https://api.bacalhaueciamaceio.com.br
```
