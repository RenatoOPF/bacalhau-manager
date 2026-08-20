# bacalhau-manager — Guia para o Claude Code

Sistema de gestão para o restaurante **Bacalhau & Cia**. Monorepo npm (workspaces `backend` e `frontend`).

## Stack

- **Backend**: NestJS (TypeScript) + Prisma + PostgreSQL + Redis/BullMQ + Socket.IO
- **Frontend**: Next.js 14 (App Router) + TailwindCSS + React Query + Socket.IO client
- **Dev local**: `docker compose up -d` sobe PostgreSQL 16 + Redis 7
- **Deploy**: backend na VM Oracle (`ssh bacalhau-vm`, `https://137.131.162.0.sslip.io`); frontend na Vercel (push na `main` = deploy automático)

## Comandos úteis

```bash
# Dev local
docker compose up -d                        # banco + redis
cd backend && npm run start:dev             # API em :3001/api
cd frontend && npm run dev                  # UI em :3000

# Banco
cd backend && npx prisma migrate dev        # rodar migrations
cd backend && npm run db:seed               # seed inicial
cd backend && npx prisma studio             # GUI do banco

# Worker de impressão (separado)
cd backend && npm run worker:dev

# Build (NUNCA rodar com next dev no ar — corrompe .next)
cd frontend && npm run build
```

## Módulos do backend (`backend/src/`)

| Módulo | Responsabilidade |
|--------|-----------------|
| `auth` | JWT, guards, decorators, roles (ADMIN / MANAGER / KITCHEN / DELIVERY) |
| `employees` | CRUD de funcionários; senha com bcrypt |
| `menu` | Categorias, itens, opções (tamanhos), upload de imagem (multer, max 1200px/500KB) |
| `orders` | Ciclo completo do pedido: criação → status → entregador → entregue |
| `cash` | Registrar pagamentos, fechamento diário, resumo por método |
| `reports` | KPIs, DRE, curva de horários, ABC de produtos, margens, by-channel |
| `integrations` | Captura de ESC/POS (base64) do iFood / 99Food via impressora fake |
| `printing` | Impressão térmica ESC/POS; tickets separados (caixa + cozinha) |
| `queue` | BullMQ — dois jobs independentes: `PRINT_CASHIER_JOB` e `PRINT_KITCHEN_JOB` |
| `realtime` | Gateway Socket.IO — eventos `order:created` e `order:status` |
| `stock` | Insumos (qty em milésimos), vínculos prato→insumo, baixa automática, produção |
| `expenses` | Despesas com categoria e conta de pagamento; data de competência vs pagamento |
| `accounts` | Contas de pagamento (Dinheiro, Nubank PJ, Itaú…) |
| `delivery` | Bairros (taxa cliente + repasse entregador) e zonas por km |
| `recipe` | Fichas técnicas (ingredientes, rendimento, preparo) |
| `customers` | Cadastro de clientes + múltiplos endereços; auto-save no checkout |
| `common` | `daily-number.ts` (número diário por pedido) + `date-range.ts` |
| `prisma` | Wrapper do PrismaService (injetado globalmente) |

## Telas do frontend (`frontend/src/app/`)

| Rota | Acesso | Descrição |
|------|--------|-----------|
| `/` | Público | Menu + carrinho + checkout (cliente final) |
| `/pedido/[protocol]` | Público | Rastreamento do pedido em tempo real |
| `/login` | Público | Auth JWT → redireciona por role |
| `/admin` | ADMIN/MANAGER | Fila de pedidos do dia (Socket.IO) |
| `/admin/balcao` | ADMIN/MANAGER | Novo pedido manual (PDV balcão/telefone) |
| `/admin/caixa` | ADMIN/MANAGER | Registrar pagamentos + fechar caixa |
| `/admin/cardapio` | ADMIN/MANAGER | CRUD cardápio (categorias, itens, opções, vínculos de estoque) |
| `/admin/estoque` | ADMIN/MANAGER | Insumos, alertas, produção manual |
| `/admin/fichas-tecnicas` | ADMIN/MANAGER | Fichas técnicas por prato |
| `/admin/clientes` | ADMIN/MANAGER | Cadastro clientes + histórico + mapa |
| `/admin/funcionarios` | ADMIN | CRUD funcionários + roles |
| `/admin/entregas` | ADMIN/MANAGER | Bairros e zonas de entrega |
| `/admin/despesas` | ADMIN/MANAGER | Despesas e contas financeiras |
| `/admin/relatorios` | ADMIN/MANAGER | KPIs, DRE, margens, horários de pico |
| `/entregador` | DELIVERY | Pedidos atribuídos + atualização de status |
| `/cozinha` | Público | Display cozinha (sem dados pessoais) |

## Convenções do banco (Prisma)

- Valores monetários em **centavos** (`Int`) — nunca `Float`
- Quantidades de estoque em **milésimos** da unidade (1 000 milli = 1 porção/kg/un)
- `Order.dailyNumber` reinicia por dia (ou ao fechar caixa); `Order.protocol` é global e único
- Estoque pode ficar negativo — não bloqueia venda, só alerta no admin
- `OrderItem` guarda snapshots de nome/preço/custo — histórico imune a mudanças no cardápio
- `StockLink` vincula prato/opção → insumo com `qtyMilli` de consumo

## Padrão de código

- **Backend**: módulo NestJS com `module.ts / controller.ts / service.ts / *.dto.ts`
- **Frontend**: React Query para server state; `lib/api.ts` como único ponto de chamadas HTTP
- Guards: `JwtAuthGuard` + `RolesGuard` com decorator `@Roles(Role.ADMIN)`
- Autenticação no frontend: token JWT em `localStorage`; interceptado em `lib/api.ts`
- Sem UI library — componentes Tailwind customizados (classes `.card`, `.btn-primary`, `.input`…)

## Fluxo de captura externa (iFood / 99Food)

1. Impressora fake captura ESC/POS e envia base64 para `POST /api/integrations/capture`
2. `IntegrationsService.ingestCapture()` detecta parser pelo conteúdo
3. Dedup por `(channel, externalId)` — reimprimir a mesma comanda não cria duplicata
4. Vincula bairro via fuzzy match (sem acento, lowercase)
5. Cria `Order`, enfileira impressão (`BullMQ`), emite `order:created` via Socket.IO

## Fluxo de pedido completo

```
Cliente faz pedido (web ou iFood/99Food)
  → Order criado no banco (status RECEIVED)
  → BullMQ: PRINT_CASHIER_JOB + PRINT_KITCHEN_JOB (independentes)
  → Socket.IO: order:created → caixa vê em tempo real
  → Caixa registra pagamento → paidAt definido → estoque baixado
  → Caixa atribui entregador (courier + taxa de bairro)
  → Entregador: "Saiu para entrega" → "Entregue"
  → Cliente rastreia em /pedido/[protocol]
```

## Variáveis de ambiente relevantes

| Var | Onde | Descrição |
|-----|------|-----------|
| `DATABASE_URL` | backend | Postgres connection string |
| `REDIS_HOST` / `REDIS_PORT` | backend | Fila BullMQ |
| `JWT_SECRET` | backend | Assinar tokens |
| `CORS_ORIGINS` | backend | URL(s) do frontend |
| `PRINTER_CASHIER_INTERFACE` | backend/agent | Endereço TCP ou porta USB da impressora do caixa |
| `PRINTER_KITCHEN_INTERFACE` | backend/agent | Impressora da cozinha |
| `PRINTER_WIDTH` | backend/agent | Largura da bobina (chars) |
| `PRINT_WORKER` | backend | `on` = processa fila localmente |
| `NEXT_PUBLIC_API_URL` | frontend | URL base da API |
| `NEXT_PUBLIC_WS_URL` | frontend | URL do Socket.IO |
