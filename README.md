# Bacalhau & Cia — Sistema de Gerenciamento

Monorepo da **Fase 1 / MVP**. Veja o [planejamento completo](./planejamento.md).

```
bacalhau-manager/
├── backend/      NestJS + Prisma + BullMQ + Socket.io (API, fila, impressão)
├── frontend/     Next.js (cardápio do cliente + painel do caixa)
└── docker-compose.yml   PostgreSQL + Redis para dev local
```

## O que já está estruturado (Fase 1)

- **Cardápio** (`/menu`): API pública + admin, telas do cliente.
- **Pedidos** (`/orders`): criação, listagem (caixa), acompanhamento por protocolo,
  atualização de status pelo caixa, reimpressão manual.
- **Fila confiável** (BullMQ/Redis): toda impressão passa pela fila com retry
  automático — nenhum pedido se perde.
- **Impressão** (ESC/POS): ticket do caixa (com endereço) e ticket da cozinha
  (sem endereço). Modo simulado quando não há impressora configurada.
- **Tempo real** (Socket.io): novos pedidos e mudanças de status no painel do caixa.

> No MVP **não há tela da cozinha** — ela trabalha pelo ticket impresso, e o
> caixa/gerente atualiza o status do preparo.

## Pré-requisitos

- Node.js 18.18+ (você tem 18.19 ✓)
- Docker (ou PostgreSQL + Redis instalados localmente)

## Como rodar

```bash
# 1. Sobe banco e fila
docker compose up -d

# 2. Instala dependências (raiz, via workspaces)
npm install

# 3. Backend: configura env, gera client, cria tabelas e popula cardápio
cd backend
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run db:seed
npm run start:dev          # http://localhost:3001/api

# 4. Frontend (outro terminal)
cd frontend
cp .env.example .env.local
npm run dev                # http://localhost:3000
```

- Cardápio do cliente: <http://localhost:3000>
- Painel do caixa: <http://localhost:3000/admin>

## Impressoras

Deixe `PRINTER_*_INTERFACE` vazio no `.env` para rodar sem hardware (a impressão
fica apenas no log). Para impressoras reais, preencha com o IP (`tcp://192.168.0.50`)
ou caminho USB. Em produção o backend roda no **PC do caixa** com
`PRINT_WORKER=on` e imprime nas impressoras da rede local. Ver [docs/deploy.md](docs/deploy.md).

## Próximos passos (ainda da Fase 1)

- Painel admin para gerenciar cardápio (criar/editar itens) — API pronta, falta UI.
- Tela pública de acompanhamento do pedido por protocolo.
- Deploy no PC do caixa + Supabase + Cloudflare Tunnel (ver `docs/deploy.md`).
