# Notas de upgrade — vulnerabilidades do `npm audit`

Levantamento do que os upgrades sugeridos por `npm audit fix --force` quebrariam,
feito em 2026-07-13 no host de produção. Decisão de quando/como fazer fica para
o PC de dev.

## `next` 14.2.35 → 16.2.10 (pula a v15 inteira)

**Quebra confirmada no código:**
- `frontend/src/app/pedido/[protocol]/page.tsx:22` recebe
  `params: { protocol: string }` de forma síncrona. A partir do Next 15,
  `params` (e `searchParams`, `cookies()`, `headers()`) viraram `Promise` —
  essa página quebra em runtime até reescrever para
  `params: Promise<{ protocol: string }>` + `await`.

**Checado e não deve quebrar:**
- Sem `middleware.ts` no projeto → não afeta o CVE de cache-poisoning em
  Middleware/Proxy.
- Sem uso de `next/image` → não afeta o DoS da Image Optimization API.
- Sem CSP com nonce nem scripts `beforeInteractive` → não afeta os dois XSS.
- Todos os `fetch()` do frontend estão em código `'use client'`
  (`src/lib/api.ts`) — não dependem do cache padrão de `fetch` em Server
  Components, que mudou no v15.

**Requisitos:** Next 16 exige Node ≥20.9 (ok, máquina tem v24.18) e React
`^18.2.0 || ^19` (ok, projeto usa 18.3.1). Mesmo assim, são duas major
releases de diferença (15 e 16) — prováveis mudanças de comportamento além do
`params` (Turbopack como bundler padrão em dev, etc.) só apareceriam testando
build/dev na prática.

## `@nestjs/platform-express` 10.4.22 → 11.1.28

Não é um upgrade isolado — `@nestjs/platform-express@11` exige
`@nestjs/core@^11` e `@nestjs/common@^11`, forçando upgrade em cascata de todo
o stack NestJS usado no projeto:

- `@nestjs/websockets` (usado em `backend/src/realtime/realtime.gateway.ts`)
  — v11 exige `@nestjs/platform-socket.io@^11` também.
- `@nestjs/bullmq` (usado em `orders.module.ts`, `orders.processor.ts`,
  `queue.module.ts`, `worker.module.ts`) — a versão atual (`10.x`) só suporta
  `@nestjs/core ^8||^9||^10`. Existe `@nestjs/bullmq@11.0.4` compatível com
  `@nestjs/core@11`, mas **não é bumped automaticamente** pelo
  `npm audit fix --force` (que só mexe na cadeia direta do `qs`/`express`) —
  rodar o audit fix sozinho deixaria `@nestjs/core@11` junto com
  `@nestjs/bullmq@10`, incompatíveis, quebrando build/boot por conflito de
  peer deps.
- `@nestjs/jwt`, `@nestjs/config` também têm suas próprias faixas de
  compatibilidade a checar antes do bump.

Não encontrei uso de API específica do Express 4 que quebraria com o Express
5 embutido no `platform-express@11` (sem rotas wildcard `*`, sem parsing de
query aninhada — todos os `@Query()` do projeto são strings simples).

## Resumo

| Upgrade | Escopo real | Quebra confirmada |
|---|---|---|
| Next 14→16 | Isolado ao frontend | 1 página (`params` síncrono) |
| `@nestjs/platform-express` 10→11 | Todo o stack Nest (core, common, websockets, platform-socket.io, bullmq) precisa subir junto | Nenhuma no código de negócio, mas alto risco de quebra por incompatibilidade de versões se feito parcialmente |

O upgrade do Nest é o mais arriscado via `--force` porque o npm não coordena
as versões dos pacotes irmãos — melhor decidir as versões manualmente no PC
de dev e testar antes de trazer para cá.

## Outros achados desta sessão (já corrigidos neste host)

- `npm ci` tinha 5 pacotes com install scripts bloqueados pelo allowlist do
  npm (`@nestjs/core`, `@prisma/client`, `@prisma/engines`,
  `msgpackr-extract`, `prisma`) — aprovados via `npm approve-scripts`
  (mudança registrada em `package.json` → `allowScripts`).
- O Prisma Client gerado pelo postinstall estava genérico/desatualizado
  (faltavam `Order`, `Role`, `PaymentStatus` etc.). Corrigido rodando
  `npm run prisma:generate --workspace backend`, que lê o schema correto em
  `backend/prisma/schema.prisma`.
