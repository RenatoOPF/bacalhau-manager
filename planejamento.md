# Sistema de Gerenciamento — Bacalhau & Cia

## Visão Geral

Sistema próprio de gestão para restaurante delivery, desenvolvido para substituir o sistema atual com mais estabilidade, custo zero de manutenção e funcionalidades específicas para o negócio. O coração do sistema é o fluxo: **cliente faz pedido → cozinha recebe e imprime → entregador leva**.

---

## Problema a Resolver

| Dor atual | Solução esperada |
|---|---|
| Pedidos que chegam e não imprimem na cozinha | Fila confiável com reprocessamento automático |
| Custo mensal do sistema atual | Sistema próprio, sem mensalidade |
| Sem cálculo de taxa por entregador | Módulo de taxas de entrega individualizado |
| Falta de funcionalidades específicas | Sistema feito sob medida |

---

## Usuários e Perfis

| Perfil | Acesso | O que faz |
|---|---|---|
| **Cliente** | Link público (cardápio web) | Monta pedido, acompanha status, recebe confirmação |
| **Cozinheiro** | Ticket impresso (sem acesso ao sistema no MVP) | Recebe o pedido pelo ticket da cozinha (itens + observações) e prepara |
| **Gerente/Admin** | PC do caixa + painel administrativo | Visualiza fila completa (com endereços), atualiza status do preparo, gerencia cardápio, estoque, caixa, relatórios e funcionários |
| **Entregador** _(futuro)_ | App/tela própria | Visualiza pedidos prontos, segue rota otimizada |

---

## Módulos

### 1. Cardápio (Cliente)
- Página web acessível por link (sem necessidade de app instalado)
- Exibição de categorias, pratos, descrições e preços
- Seleção de itens e montagem do pedido
- Suporte a observações por item (ex: "sem cebola")
- Confirmação do pedido com número de protocolo
- Acompanhamento do status em tempo real:
  - `Recebido` → `Em preparo` → `Saiu para entrega` → `Entregue`
- Previsão de tempo de entrega exibida ao cliente

### 2. Cozinha
> No MVP **não há tela da cozinha**. A cozinha trabalha exclusivamente pelo ticket impresso, acionado pelo PC do caixa. (Tela própria da cozinha fica para uma fase futura.)

- Impressão automática na impressora térmica ao receber pedido
  - Ticket da cozinha: número do pedido + itens + observações
  - **Não exibe** endereço do cliente (informação exclusiva do caixa)
- Reimpressão manual em caso de falha (a partir do PC do caixa)
- Atualização de status do preparo (`Em preparo` → `Pronto`) é feita pelo caixa/gerente — ver módulo Caixa

### 3. Caixa (Gerente)
- Fila completa de pedidos com **endereço do cliente** visível
- Impressora própria no PC do caixa — imprime ticket completo ao receber pedido:
  - Número do pedido + itens + endereço + forma de pagamento + total
- A impressora da cozinha também é acionada pelo PC do caixa (ponto central de impressão)
- Atualização do status de preparo do pedido: `Em preparo` → `Pronto` (no MVP, feita pelo caixa já que não há tela da cozinha)
- Registro de pagamentos recebidos: dinheiro, PIX e **cartão** (quando pedido vier via iFood/99Food)
- Histórico de transações por dia/período
- Fechamento de caixa diário com totais por modalidade de pagamento
- Visualização de pedidos pendentes de pagamento
- Integração futura com gateway de pagamento online

### 4. Estoque
- Cadastro de itens por unidade
- Entrada e saída de estoque (manual inicialmente)
- Alerta de estoque baixo (quantidade mínima configurável por item)
- Baixa automática de estoque ao confirmar pedido _(a definir com o gerente)_
- Histórico de movimentações

### 5. Relatórios
- Faturamento por período (dia, semana, mês)
- Pedidos por canal (cardápio próprio, iFood, Gami/99Food)
- Itens mais vendidos
- Taxa de entrega paga por entregador (próprio vs. terceirizado)
- Tempo médio de preparo e entrega
- Exportação em PDF ou planilha

### 6. Gestão de Funcionários
- Cadastro de cozinheiros, entregadores e gerentes
- Controle de acesso por perfil
- Histórico de atividade _(futuro)_
- Cálculo de taxa de entrega por entregador próprio

### 7. Integrações Externas

#### iFood — Merchant API
Integração oficial via **iFood Marketplace API** (OAuth 2.0):
- Recebe pedidos em tempo real via polling/webhooks
- Acessa todos os dados: itens, endereço, forma de pagamento, valor
- Atualiza status do pedido pelo sistema (confirmado, em preparo, saiu para entrega)
- Pagamentos via cartão chegam pelo iFood — registrados no caixa como "cartão (iFood)"
- Requer solicitação de acesso como parceiro iFood (burocrático, mas viável)

#### Gami / 99Food
- Verificar disponibilidade de API para parceiros junto ao suporte
- Enquanto não houver API: avaliar solução temporária via interceptação de impressão _(ver nota abaixo)_

#### Impressão (Cozinha e Caixa)
- Duas impressoras térmicas, ambas acionadas pelo PC do caixa
- Ticket da cozinha: itens + observações
- Ticket do caixa: itens + endereço + pagamento + total
- Biblioteca: `node-thermal-printer` (ESC/POS)

#### Google Maps API _(futuro)_
- Rota otimizada para entregadores com base no tempo de preparo em andamento

---

## Nota — Interceptação de Impressão (Solução Temporária)

Enquanto integrações oficiais (Gami/99Food) não estiverem disponíveis, existe a abordagem de **impressora virtual**: instalar um driver de impressora virtual no Windows que captura o job de impressão enviado pelo app da plataforma e extrai os dados do pedido antes de enviá-los à impressora física.

**É tecnicamente possível**, mas frágil — qualquer mudança no formato do ticket da plataforma quebra a integração. Usar apenas como ponte temporária, nunca como solução definitiva.

---

## Arquitetura de Infraestrutura

### Backend no PC do caixa + Postgres no Supabase (custo ~zero)
O backend roda **no PC do caixa**, dentro do restaurante. Uma única instância (`PRINT_WORKER=on`) serve a API/WebSocket, enfileira os pedidos **e** imprime — as impressoras estão na mesma rede local. O **PostgreSQL** fica no **Supabase** (grátis), o **Redis** roda **local** no PC, a exposição é via **Cloudflare Tunnel** (grátis) e o frontend na **Vercel** (grátis).

```
Cliente → Vercel (frontend Next.js)
    ↓ HTTPS / WebSocket
Cloudflare Tunnel (URL pública, grátis)
    ↓
PC do caixa (rede local): backend NestJS (PM2, PRINT_WORKER=on)
    ├── Redis local (fila BullMQ)
    └── Supabase (PostgreSQL gerenciado, na nuvem)
    ↓ rede local
    ├── Impressora da Cozinha (ESC/POS)
    └── Impressora do Caixa (ESC/POS)
```

**Único processo**: o mesmo backend serve a API, mantém o WebSocket, consome a fila e imprime. Sem serviço separado. Detalhes operacionais em [`docs/deploy.md`](docs/deploy.md).

**Custo**: Supabase (free tier), Cloudflare Tunnel e Vercel (grátis). Só o PC do caixa (que já existe) e a energia.

**Cuidados para o PC do caixa:**
- Configurar para nunca suspender ou hibernar
- Manter conectado na tomada (não depender de bateria)
- Internet estável (fala com o Supabase) **e** rede local com as impressoras
- Nobreak/UPS para proteger contra quedas de energia
- Configurar reinício automático dos serviços (Redis + PM2)

---

## Fluxo Principal — Pedido pelo Cardápio Próprio

```
Cliente acessa link → Seleciona itens → Confirma pedido
        ↓
Sistema registra pedido → Envia para fila confiável (Redis/BullMQ)
        ↓
PC do caixa processa pedido:
  ├── Impressora do caixa imprime ticket completo (endereço + itens + pagamento)
  └── Impressora da cozinha imprime ticket de preparo (itens + observações)
        ↓
Caixa/gerente atualiza status → "Em preparo" → "Pronto"
        ↓
Gerente designa entregador → Status "Saiu para entrega"
        ↓
Entregador realiza entrega → Status "Entregue"
        ↓
Cliente recebe notificação de cada mudança de status
```

---

## Fluxo — Pedido via iFood / Gami

```
Cliente faz pedido no iFood/Gami
        ↓
Sistema recebe via API (webhook/polling)
        ↓
Pedido entra na mesma fila do cardápio próprio
        ↓
Mesmo fluxo de impressão e status
        ↓
Pagamento registrado no caixa como "cartão (iFood)" ou "cartão (Gami)"
```

---

## Stack Técnica Sugerida

### Por que essa stack?
Foco em confiabilidade (resolver o problema de pedidos que não imprimem), custo zero de infraestrutura e um único ecossistema (JavaScript/TypeScript) para facilitar manutenção solo.

### Backend
| Tecnologia | Função |
|---|---|
| **Node.js + TypeScript** | Servidor principal |
| **NestJS** | Framework estruturado, módulos, injeção de dependência |
| **PostgreSQL** | Banco de dados relacional — pedidos, estoque, caixa, relatórios |
| **Redis + BullMQ** | Fila de pedidos — garante que nenhum pedido se perca e reprocessa em caso de falha |
| **Socket.io** | Comunicação em tempo real (status para cliente, cozinha e caixa) |
| **Prisma** | ORM para o banco de dados |
| **PM2** | Gerenciador de processos — reinicia o servidor automaticamente se cair |

### Frontend
| Tecnologia | Função |
|---|---|
| **Next.js + TypeScript** | Cardápio do cliente e painel admin (mesmo projeto) |
| **TailwindCSS** | Estilização rápida e responsiva |
| **React Query** | Cache e sincronização de dados do servidor |

### Impressora Térmica
| Tecnologia | Função |
|---|---|
| **node-thermal-printer** | Biblioteca Node.js para impressoras ESC/POS |
| Conexão via USB ou IP na rede local | Ambas as impressoras acionadas pelo PC do caixa |

### Infraestrutura
| Componente | Solução |
|---|---|
| **Backend** | PC do caixa (PM2, `PRINT_WORKER=on`) — serve API, fila e impressão |
| **Banco de dados** | Supabase (PostgreSQL gerenciado, free tier) |
| **Fila (Redis)** | Redis local nativo no PC do caixa |
| **Exposição para internet** | Cloudflare Tunnel (gratuito) |
| **Frontend (cardápio)** | Vercel (gratuito para projetos pequenos) |

---

## Roadmap

### Fase 1 — MVP (Coração do sistema)
> Objetivo: substituir o sistema atual com o mínimo funcional

- [x] Cardápio web (cliente faz pedido via link)
- [x] Fila de pedidos confiável (Redis + BullMQ)
- [x] Tela do caixa/gerente (fila completa com endereço + atualização de status do preparo)
- [x] Impressão automática: ticket de cozinha + ticket de caixa
- [x] Status do pedido em tempo real para o cliente
- [x] Pagamento em dinheiro e PIX (registrado manualmente)
- [x] Painel básico do admin (gerenciar cardápio)
- [x] Deploy no PC do caixa (backend + Redis local) + Supabase + Cloudflare Tunnel

> ⚠️ O painel admin ainda **não tem autenticação** — as rotas `/admin/*` estão
> abertas para quem tiver a URL do túnel. Login/perfis estão prontos na branch
> `fase-2-funcionarios` (ver Fase 2). Resolver antes do uso aberto em produção.

### Fase 2 — Gestão
- [ ] Módulo de caixa (histórico, fechamento diário)
- [ ] Módulo de estoque (cadastro, alertas de estoque baixo)
- [ ] Gestão de funcionários e perfis de acesso
- [ ] Cálculo de taxa de entrega por entregador
- [ ] Relatórios básicos (faturamento, itens vendidos por canal)

### Fase 3 — Integrações
- [ ] Solicitar acesso à iFood Merchant API
- [ ] Integração com iFood (pedidos entram na mesma fila)
- [ ] Verificar/solicitar API do Gami / 99Food
- [ ] Integração com Gami / 99Food
- [ ] Pagamentos via cartão (iFood/Gami) registrados no caixa

### Fase 4 — Expansão
- [ ] Sistema de rotas para entregadores (Google Maps API)
- [ ] Otimização de rota por tempo de preparo em andamento
- [ ] Pagamento online integrado (gateway de pagamento — ex: Mercado Pago, Stripe)
- [ ] App instalável para entregadores (PWA)
- [ ] Notificações push para o cliente

---

## Considerações Importantes

- **Estabilidade é prioridade**: Redis/BullMQ garante que pedidos nunca se percam — mesmo que o servidor reinicie, os pedidos na fila são reprocessados automaticamente.
- **Ponto único de impressão**: o PC do caixa controla as duas impressoras, simplificando a arquitetura e o diagnóstico de falhas.
- **iFood Merchant API**: iniciar o processo de solicitação de acesso com antecedência — pode levar semanas para ser aprovado.
- **Gami/99Food**: confirmar disponibilidade de API antes de planejar a integração; se não houver, avaliar impressora virtual como ponte temporária.
- **Estoque**: confirmar com o gerente a granularidade do controle (baixa por prato vendido ou entrada/saída manual).
- **Sinalização de pedido pronto**: sem tela da cozinha no MVP, a cozinha não consegue marcar `Pronto` diretamente — quem atualiza é o caixa, que dependerá de aviso verbal/visual da cozinha. Se isso virar gargalo, a tela da cozinha (prevista para fase futura) resolve.
- **Sem pressa**: o sistema atual funciona — o MVP só vai para produção quando estiver estável e testado.
