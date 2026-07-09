// Configuração do PM2 para o AGENTE DE IMPRESSÃO no PC do caixa (Windows).
// Roda SÓ o worker (dist/worker.js): consome a fila (Redis/Upstash) e imprime
// nas térmicas locais. Faz apenas conexões de saída — sem API, sem túnel.
//
// Requer no backend/.env: REDIS_URL (Upstash), DATABASE_URL (Supabase) e as
// interfaces PRINTER_CASHIER_INTERFACE / PRINTER_KITCHEN_INTERFACE.
// Ver docs/deploy-windows.md.
//
// Uso (no caixa): npm run build --workspace backend && pm2 start agent.config.js
module.exports = {
  apps: [
    {
      name: 'bacalhau-print-agent',
      cwd: './backend',
      script: 'dist/worker.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
