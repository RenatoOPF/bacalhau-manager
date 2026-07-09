// Configuração do PM2 — mantém o backend sempre de pé no PC do caixa
// (PRINT_WORKER=on no backend/.env). A mesma instância serve a API/WebSocket,
// consome a fila do Redis local e imprime nas impressoras da rede local.
// Uso: pm2 start ecosystem.config.js
//
// Banco no Supabase, exposição via ngrok (domínio estático grátis), frontend
// na Vercel (ver docs/deploy.md).
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
      // Túnel ngrok com domínio estático grátis (URL fixa, sobe no boot junto
      // com o PM2). Configure o authtoken uma vez: `ngrok config add-authtoken <token>`
      // e troque o --domain pelo seu domínio reservado em dashboard.ngrok.com.
      name: 'ngrok-tunnel',
      script: 'ngrok',
      args: 'http --domain=SEU-DOMINIO.ngrok-free.app 3001',
      instances: 1,
      autorestart: true,
      watch: false,
    },
  ],
};
