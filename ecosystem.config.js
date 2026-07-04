// Configuração do PM2 — mantém o AGENTE LOCAL de impressão sempre de pé no PC
// do caixa (rode com PRINT_WORKER=on no backend/.env). Ele consome a fila do
// Redis da nuvem e imprime nas impressoras da rede local.
// Uso: pm2 start ecosystem.config.js
//
// O backend público roda na Fly.io e o frontend na Vercel (ver docs/deploy.md).
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
  ],
};
