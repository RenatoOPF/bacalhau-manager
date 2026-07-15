// Configuração do PM2 para o BACKEND na NUVEM (VM Oracle Cloud Always Free).
// Serve a API/WebSocket e ENFILEIRA os pedidos (PRINT_WORKER=off, não imprime).
// A impressão fica no PC do caixa, via `agent.config.js`.
//
// Topologia: Postgres no Supabase, fila no Upstash (Redis), HTTPS via Caddy
// (<ip>.sslip.io) e frontend na Vercel. Ver docs/deploy-cloud.md.
//
// Uso (na VM): npm run build --workspace backend && pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'bacalhau-backend',
      cwd: './backend',
      // Build de produção (gere antes com: npm run build --workspace backend)
      script: 'dist/main.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        // Sem worker de impressão na nuvem: a VM não alcança as térmicas locais.
        PRINT_WORKER: 'off',
        // Fuso do restaurante: o "dia" (reset do número, fechamento, relatórios)
        // vira à meia-noite de Brasília, não em UTC.
        TZ: 'America/Sao_Paulo',
      },
    },
  ],
};
