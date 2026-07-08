// Configuração do PM2 — mantém o backend sempre de pé no PC do caixa
// (PRINT_WORKER=on no backend/.env). A mesma instância serve a API/WebSocket,
// consome a fila do Redis local e imprime nas impressoras da rede local.
// Uso: pm2 start ecosystem.config.js
//
// Banco no Supabase, exposição via Cloudflare Tunnel, frontend na Vercel
// (ver docs/deploy.md).
module.exports = {
  apps: [
    {
      name: 'bacalhau-backend',
      cwd: './backend',
      // Roda o build de produção (gere antes com: npm run build --workspace backend)
      script: 'dist/main.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      // Tunnel rápido (URL muda a cada reinício). Para URL fixa, ver
      // docs/deploy-windows.md#8-expor-na-internet-cloudflare-tunnel.
      name: 'cloudflared-tunnel',
      script: 'cloudflared',
      args: 'tunnel --url http://localhost:3001',
      instances: 1,
      autorestart: true,
      watch: false,
    },
  ],
};
